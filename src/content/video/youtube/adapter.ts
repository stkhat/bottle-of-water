import type { Cue } from "../../../core/subtitles/types";
import {
  parseYouTubeJson3,
  youtubeCaptionInfo,
  type YouTubeCaptionInfo,
  type YouTubeTrack,
} from "../../../core/subtitles/youtube-json3";
import { firstTranslation, siteCaptionsHider, sleep } from "../adapter-kit";
import {
  createPageBridge,
  NETWORK_CALL_TIMEOUT_MS,
  retryNetworkCall,
} from "../page-channel";
import { createRecent } from "../recent";
import type {
  CaptionRequest,
  PlatformAdapter,
  VideoCaptions,
} from "../platform";
import {
  CHANNEL,
  isTimedtextMessage,
  type PageCall,
  type PageCallResults,
  type TimedtextMessage,
} from "./messages";
import { autoTranslateCode, pickOriginalTrack, trackUrl } from "./timedtext";

export interface YouTubeAdapterOptions {
  /** Default: `location.href`. */
  href?: () => string;
  /** How long to wait for the player's own caption request before asking for one. */
  playerRequestWaitMs?: number;
  /** How long to wait for the player's request after asking for a track. */
  captureTimeoutMs?: number;
  /** How long to wait for one fetch of a track through the page script. */
  fetchTimeoutMs?: number;
  pollMs?: number;
}

/** How long to wait for the player response of the current video. */
const PLAYER_RESPONSE_TIMEOUT_MS = 30_000;
/** Videos whose last captured request is kept (the current one and a few before). */
const KEEP_CAPTURES = 4;
/** A Short's path and its video id. */
const SHORTS_PATH = /^\/shorts\/([^/]+)/;

/** The URL shows a Short (`/shorts/<id>`; docs/notes/youtube-shorts.md). */
export const isShortsUrl = (href: string) =>
  SHORTS_PATH.test(new URL(href).pathname);

/**
 * YouTube's watch page and Shorts. Captions come from the player's own /api/timedtext request,
 * observed by the page script (`page.ts`): its URL carries the PO token the server
 * requires, so the other tracks are fetched by editing that URL. Caption bodies and
 * URLs live in memory only.
 */
export function createYouTubeAdapter(
  options: YouTubeAdapterOptions = {},
): PlatformAdapter {
  const href = options.href ?? (() => location.href);
  const pollMs = options.pollMs ?? 250;
  const playerRequestWaitMs = options.playerRequestWaitMs ?? 1500;
  const captureTimeoutMs = options.captureTimeoutMs ?? 10_000;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? NETWORK_CALL_TIMEOUT_MS;
  const bridge = createPageBridge<PageCall, PageCallResults, TimedtextMessage>({
    channel: CHANNEL,
    isEvent: isTimedtextMessage,
  });
  const hideCaptions = siteCaptionsHider(
    "lingo-hide-site-captions",
    "#ytp-caption-window-container { display: none !important; }",
  );

  const captures = createRecent<TimedtextMessage>(KEEP_CAPTURES);
  const offTimedtext = bridge.onEvent((message) => {
    // Ads make their own requests: they are kept under their own video id.
    if (message.videoId && message.body.trim() !== "")
      captures.set(message.videoId, message);
  });

  const onShorts = () => isShortsUrl(href());

  function videoId(): string | undefined {
    const url = new URL(href());
    if (url.pathname === "/watch")
      return url.searchParams.get("v") || undefined;
    return SHORTS_PATH.exec(url.pathname)?.[1];
  }

  // The watch page's player can stay in the DOM while a Short shows: go by the URL.
  const player = () =>
    document.getElementById(onShorts() ? "shorts-player" : "movie_player");
  const adShowing = () => player()?.classList.contains("ad-showing") ?? false;
  /** Sends a call to the page script, for the player this page shows. */
  const call = <T extends PageCall["type"]>(
    message: Extract<PageCall, { type: T }>,
    timeoutMs?: number,
  ): Promise<PageCallResults[T]> =>
    bridge.call<T>({ ...message, shorts: onShorts() }, timeoutMs);

  /** Fetches a track's body through the page script, trying once more if that fails. */
  const fetchTimedtext = (url: string): Promise<string> =>
    retryNetworkCall(() =>
      call({ type: "fetchTimedtext", url }, fetchTimeoutMs),
    );

  /** The player response once it is the current video's (it lags behind SPA navigation). */
  async function captionInfo(
    id: string,
    signal?: AbortSignal,
  ): Promise<YouTubeCaptionInfo> {
    const deadline = Date.now() + PLAYER_RESPONSE_TIMEOUT_MS;
    for (;;) {
      const response = (await call({ type: "getPlayerResponse" })) as {
        videoDetails?: { videoId?: unknown };
      } | null;
      if (response?.videoDetails?.videoId === id)
        return youtubeCaptionInfo(response);
      if (Date.now() >= deadline)
        throw new Error(`No player response for ${id}`);
      await sleep(pollMs, signal);
    }
  }

  /** The player's request for this video, asking the player for `original` if needed. */
  async function captureFor(
    id: string,
    original: YouTubeTrack,
    signal?: AbortSignal,
  ): Promise<TimedtextMessage | undefined> {
    const seen = captures.get(id);
    if (seen) return seen;
    while (adShowing()) await sleep(pollMs, signal);
    const own = await captures.wait(id, playerRequestWaitMs, signal);
    if (own) return own;
    const { previous } = await call({
      type: "loadTrack",
      languageCode: original.lang,
      asr: original.kind === "asr",
    });
    try {
      return await captures.wait(id, captureTimeoutMs, signal);
    } finally {
      // Put YouTube's own caption choice back as it was.
      await call({ type: "restoreCaptions", previous }).catch(
        (error: unknown) => {
          // Aborted when Lingo leaves the page: nothing to put back.
          if (!(error instanceof DOMException && error.name === "AbortError"))
            console.warn("Lingo:", error);
        },
      );
    }
  }

  async function cuesOf(
    capture: TimedtextMessage,
    track: { lang: string; asr: boolean; tlang?: string },
  ): Promise<Cue[]> {
    const same =
      capture.lang === track.lang &&
      (capture.kind === "asr") === track.asr &&
      (capture.tlang ?? undefined) === track.tlang;
    const body = same
      ? capture.body
      : await fetchTimedtext(trackUrl(capture.url, track));
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
    const tlang = autoTranslateCode(info, original, request.nativeLang);
    const translation = await firstTranslation(
      request,
      {
        tracks: info.tracks.filter((t) => t !== original),
        canAutoTranslate: tlang !== undefined,
      },
      (choice) =>
        choice.source === "siteTrack"
          ? cuesOf(capture, { lang: choice.track.lang, asr: false })
          : cuesOf(capture, { lang: original.lang, asr, tlang }),
    );
    return { track: original, cues, translation };
  }

  return {
    platform: "youtube",
    videoId,
    title() {
      const heading = document
        .querySelector(
          onShorts()
            ? "ytd-shorts yt-shorts-video-title-view-model h1"
            : "ytd-watch-metadata h1",
        )
        ?.textContent?.trim();
      return heading || document.title.replace(/ - YouTube$/, "").trim();
    },
    url() {
      const id = videoId();
      return id ? `https://www.youtube.com/watch?v=${id}` : href();
    },
    video: () =>
      player()?.querySelector<HTMLVideoElement>("video.html5-main-video") ??
      null,
    playerElement: player,
    controlsPoint() {
      if (onShorts()) {
        // The Short's own buttons at the top of the video, before its captions button.
        const right = document.querySelector(
          "ytd-shorts ytd-shorts-player-controls #right-controls",
        );
        if (!right) return null;
        return {
          parent: right,
          before:
            right.querySelector(
              ":scope > #closed-captioning-button-container",
            ) ?? right.firstElementChild,
        };
      }
      const controls = document.querySelector(
        "#movie_player .ytp-right-controls",
      );
      if (!controls) return null;
      // Next to the site's gear, as in mock Main.
      const settings = controls.querySelector(".ytp-settings-button");
      return settings?.parentElement
        ? { parent: settings.parentElement, before: settings }
        : { parent: controls, before: controls.firstElementChild };
    },
    belowVideoElement: () =>
      onShorts() ? null : document.getElementById("below"),
    sideColumn() {
      if (onShorts()) return null;
      const parent = document.getElementById("secondary-inner");
      if (!parent) return null;
      const related = document.getElementById("related");
      return {
        parent,
        before: related?.parentElement === parent ? related : null,
      };
    },
    vertical: onShorts,
    besidePlayer: () =>
      onShorts()
        ? document.querySelector<HTMLElement>(
            "ytd-shorts reel-action-bar-view-model",
          )
        : null,
    adShowing,
    async tracks() {
      const id = videoId();
      return id ? (await captionInfo(id)).tracks : [];
    },
    loadCaptions,
    async seek(ms) {
      await call({ type: "seek", seconds: ms / 1000 });
    },
    onNavigate(listener) {
      const handler = () => listener();
      document.addEventListener("yt-navigate-finish", handler);
      return () => document.removeEventListener("yt-navigate-finish", handler);
    },
    hideSiteCaptions: hideCaptions,
    dispose() {
      offTimedtext();
      captures.clear();
      hideCaptions(false);
      bridge.dispose();
    },
  };
}
