import { chooseTranslation } from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import {
  parseYouTubeJson3,
  youtubeCaptionInfo,
  type YouTubeCaptionInfo,
  type YouTubeTrack,
} from "../../core/subtitles/youtube-json3";
import type {
  CaptionRequest,
  PlatformAdapter,
  VideoCaptions,
} from "./platform";
import { createPageBridge, type PageBridge } from "./youtube-bridge";
import type { TimedtextMessage } from "./youtube-messages";
import {
  autoTranslateCode,
  pickOriginalTrack,
  trackUrl,
} from "./youtube-timedtext";

export interface YouTubeAdapterOptions {
  /** Default: a bridge to the page script on this window. */
  bridge?: PageBridge;
  document?: Document;
  /** Default: `location.href`. */
  href?: () => string;
  /** How long to wait for the player's own caption request before asking for one. */
  playerRequestWaitMs?: number;
  /** How long to wait for the player's request after asking for a track. */
  captureTimeoutMs?: number;
  /** How long to wait for the player response of the current video. */
  playerResponseTimeoutMs?: number;
  pollMs?: number;
}

export interface YouTubeAdapter extends PlatformAdapter {
  readonly platform: "youtube";
}

/** A /api/timedtext response the player itself received (non-empty). */
type Capture = Pick<
  TimedtextMessage,
  "url" | "lang" | "tlang" | "kind" | "body"
>;

const HIDE_STYLE_ID = "lingo-hide-site-captions";
const HIDE_CSS = "#ytp-caption-window-container { display: none !important; }";
/** Videos whose last captured request is kept (the current one and a few before). */
const KEEP_CAPTURES = 4;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(done, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError(signal!));
    }
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * YouTube's watch page. Captions come from the player's own /api/timedtext request,
 * observed by the page script (`youtube-page.ts`): its URL carries the PO token the
 * server requires, so the other tracks are fetched by editing that URL. Nothing is
 * stored: caption bodies and URLs live in memory only.
 */
export function createYouTubeAdapter(
  options: YouTubeAdapterOptions = {},
): YouTubeAdapter {
  const doc = options.document ?? document;
  const href = options.href ?? (() => location.href);
  const bridge = options.bridge ?? createPageBridge();
  const pollMs = options.pollMs ?? 250;
  const playerRequestWaitMs = options.playerRequestWaitMs ?? 1500;
  const captureTimeoutMs = options.captureTimeoutMs ?? 10_000;
  const playerResponseTimeoutMs = options.playerResponseTimeoutMs ?? 30_000;

  const captures = new Map<string, Capture>();
  const waiters = new Set<(videoId: string) => void>();

  const offTimedtext = bridge.onTimedtext((message) => {
    // Ads make their own requests: they are kept under their own video id.
    if (!message.videoId || message.body.trim() === "") return;
    captures.delete(message.videoId);
    captures.set(message.videoId, message);
    while (captures.size > KEEP_CAPTURES)
      captures.delete(captures.keys().next().value as string);
    for (const waiter of [...waiters]) waiter(message.videoId);
  });

  function waitForCapture(
    videoId: string,
    ms: number,
    signal?: AbortSignal,
  ): Promise<Capture | undefined> {
    const existing = captures.get(videoId);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const finish = (value: Capture | undefined) => {
        clearTimeout(timer);
        waiters.delete(waiter);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const waiter = (id: string) => {
        if (id === videoId) finish(captures.get(id));
      };
      const onAbort = () => {
        clearTimeout(timer);
        waiters.delete(waiter);
        reject(abortError(signal!));
      };
      const timer = setTimeout(() => finish(undefined), ms);
      waiters.add(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function videoId(): string | undefined {
    const url = new URL(href());
    if (url.pathname !== "/watch") return undefined;
    return url.searchParams.get("v") ?? undefined;
  }

  const player = () => doc.getElementById("movie_player");
  const adShowing = () => player()?.classList.contains("ad-showing") ?? false;

  /** The player response once it is the current video's (it lags behind SPA navigation). */
  async function captionInfo(
    id: string,
    signal?: AbortSignal,
  ): Promise<YouTubeCaptionInfo> {
    const deadline = Date.now() + playerResponseTimeoutMs;
    for (;;) {
      const response = (await bridge.call({ type: "getPlayerResponse" })) as {
        videoDetails?: { videoId?: unknown };
      } | null;
      if (response?.videoDetails?.videoId === id)
        return youtubeCaptionInfo(response);
      if (Date.now() >= deadline)
        throw new Error(`No player response for ${id}`);
      await sleep(pollMs, signal);
    }
  }

  async function untilNoAd(signal?: AbortSignal) {
    while (adShowing()) await sleep(pollMs, signal);
  }

  /** The player's request for this video, asking the player for `original` if needed. */
  async function captureFor(
    id: string,
    original: YouTubeTrack,
    signal?: AbortSignal,
  ): Promise<Capture | undefined> {
    const seen = captures.get(id);
    if (seen) return seen;
    await untilNoAd(signal);
    const own = await waitForCapture(id, playerRequestWaitMs, signal);
    if (own) return own;
    const { previous } = await bridge.call({
      type: "loadTrack",
      languageCode: original.lang,
      asr: original.kind === "asr",
    });
    try {
      return await waitForCapture(id, captureTimeoutMs, signal);
    } finally {
      // Put YouTube's own caption choice back as it was.
      await bridge
        .call({ type: "restoreCaptions", previous })
        .catch((error: unknown) => {
          // Aborted when Lingo leaves the page: nothing to put back.
          if (!(error instanceof DOMException && error.name === "AbortError"))
            console.warn("Lingo:", error);
        });
    }
  }

  async function cuesOf(
    capture: Capture,
    track: { lang: string; asr: boolean; tlang?: string },
  ): Promise<Cue[]> {
    const same =
      capture.lang === track.lang &&
      (capture.kind === "asr") === track.asr &&
      (capture.tlang ?? undefined) === track.tlang;
    const body = same
      ? capture.body
      : await bridge.call({
          type: "fetchTimedtext",
          url: trackUrl(capture.url, track),
        });
    return parseYouTubeJson3(body);
  }

  async function loadCaptions(
    request: CaptionRequest,
  ): Promise<VideoCaptions | undefined> {
    const { signal } = request;
    const id = videoId();
    if (!id) return undefined;
    const info = await captionInfo(id, signal);
    const original = pickOriginalTrack(info.tracks, request.learningLang);
    if (!original) return undefined;
    const capture = await captureFor(id, original, signal);
    if (!capture) return undefined;
    const asr = original.kind === "asr";
    const cues = await cuesOf(capture, { lang: original.lang, asr });
    if (cues.length === 0) return undefined;

    // The first source in the spec's order that has cues.
    let tracks = info.tracks.filter((t) => t !== original);
    let tlang = autoTranslateCode(info, original, request.nativeLang);
    for (;;) {
      signal?.throwIfAborted();
      const choice = chooseTranslation({
        tracks,
        nativeLang: request.nativeLang,
        canAutoTranslate: tlang !== undefined,
        translatorAvailable: request.translatorAvailable,
      });
      const translation = (source: typeof choice.source, list: Cue[]) => ({
        track: original,
        cues,
        translation: { source, lang: request.nativeLang, cues: list },
      });
      if (choice.source === "siteTrack") {
        const list = await cuesOf(capture, {
          lang: choice.track.lang,
          asr: false,
        });
        if (list.length > 0) return translation("siteTrack", list);
        tracks = tracks.filter((t) => t !== choice.track);
      } else if (choice.source === "siteAutoTranslate") {
        const list = await cuesOf(capture, { lang: original.lang, asr, tlang });
        if (list.length > 0) return translation("siteAutoTranslate", list);
        tlang = undefined;
      } else {
        return translation(choice.source, []);
      }
    }
  }

  return {
    platform: "youtube",
    matches: (url) => url.hostname === "www.youtube.com",
    videoId,
    title() {
      const heading = doc
        .querySelector("ytd-watch-metadata h1")
        ?.textContent?.trim();
      return heading || doc.title.replace(/ - YouTube$/, "").trim();
    },
    url() {
      const id = videoId();
      return id ? `https://www.youtube.com/watch?v=${id}` : href();
    },
    video: () =>
      doc.querySelector<HTMLVideoElement>(
        "#movie_player video.html5-main-video",
      ),
    playerElement: player,
    controlsPoint() {
      const controls = doc.querySelector("#movie_player .ytp-right-controls");
      if (!controls) return null;
      // Next to the site's gear, as in mock Main.
      const settings = controls.querySelector(".ytp-settings-button");
      return settings?.parentElement
        ? { parent: settings.parentElement, before: settings }
        : { parent: controls, before: controls.firstElementChild };
    },
    belowVideoElement: () => doc.getElementById("below"),
    sideColumn() {
      const parent = doc.getElementById("secondary-inner");
      if (!parent) return null;
      const related = doc.getElementById("related");
      return {
        parent,
        before: related?.parentElement === parent ? related : null,
      };
    },
    adShowing,
    async tracks() {
      const id = videoId();
      return id ? (await captionInfo(id)).tracks : [];
    },
    loadCaptions,
    async seek(ms) {
      await bridge.call({ type: "seek", seconds: ms / 1000 });
    },
    onNavigate(listener) {
      const handler = () => listener();
      doc.addEventListener("yt-navigate-finish", handler);
      return () => doc.removeEventListener("yt-navigate-finish", handler);
    },
    hideSiteCaptions(hidden) {
      const existing = doc.getElementById(HIDE_STYLE_ID);
      if (!hidden) {
        existing?.remove();
        return;
      }
      if (existing) return;
      // textContent, not innerHTML: youtube.com enforces Trusted Types.
      const style = doc.createElement("style");
      style.id = HIDE_STYLE_ID;
      style.textContent = HIDE_CSS;
      (doc.head ?? doc.documentElement).append(style);
    },
    dispose() {
      offTimedtext();
      waiters.clear();
      captures.clear();
      doc.getElementById(HIDE_STYLE_ID)?.remove();
      if (!options.bridge) bridge.dispose();
    },
  };
}
