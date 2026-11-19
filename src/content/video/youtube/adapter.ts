import type { Track } from "../../../core/subtitles/types";
import {
  parseYouTubeJson3,
  youtubeCaptionInfo,
  type YouTubeCaptionInfo,
  type YouTubeTrack,
} from "../../../core/subtitles/youtube-json3";
import { isAbortError } from "../../abort";
import {
  firstTranslation,
  playerNarrower,
  styleSwitch,
  sleep,
} from "../adapter-kit";
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
import {
  autoTranslateCode,
  pickOriginalTrack,
  sameResponse,
  trackUrl,
} from "./timedtext";

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
/** A try of `loadCaptions` to make again (see `loadFrom`). */
const AGAIN = Symbol("again");
/** A Short's path and its video id. */
const SHORTS_PATH = /^\/shorts\/([^/]+)/;

/** The YouTube track `chooseTranslation` picked (it hands back one of `info.tracks`). */
function siteTrack(info: YouTubeCaptionInfo, track: Track): YouTubeTrack {
  const found = info.tracks.find((t) => t.id === track.id);
  if (!found) throw new Error(`Unknown track ${track.id}`);
  return found;
}

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
  const hideCaptions = styleSwitch(
    "langle-hide-site-captions",
    "#ytp-caption-window-container { display: none !important; }",
  );
  const cleanups: (() => void)[] = [];

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
  /**
   * The player's box in the full-bleed row while the page is in fullscreen (YouTube
   * puts `<html>` in fullscreen; theater mode uses the same row without it). Null
   * elsewhere (docs/notes/youtube-captions.md).
   */
  const fullBleed = () => {
    if (onShorts() || !document.fullscreenElement) return null;
    const box = document.getElementById("player-full-bleed-container");
    const view = player();
    return box &&
      view &&
      box.contains(view) &&
      !view.contains(document.fullscreenElement) &&
      document.fullscreenElement.contains(box)
      ? box
      : null;
  };
  // A width on the growing flex item has no effect: a margin narrows it.
  const narrowPlayer = playerNarrower(
    fullBleed,
    "margin-right",
    (width) => `${width}px`,
  );
  cleanups.push(() => narrowPlayer(0));

  const captures = createRecent<TimedtextMessage>(KEEP_CAPTURES);
  const offTimedtext = bridge.onEvent((message) => {
    // Ads make their own requests: they are kept under their own video id.
    if (message.videoId && message.body.trim() !== "")
      captures.set(message.videoId, message);
  });
  cleanups.push(offTimedtext, () => captures.clear());
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
          // Aborted when Langle leaves the page: nothing to put back.
          if (!isAbortError(error)) console.warn("Langle:", error);
        },
      );
    }
  }

  async function loadCaptions(
    request: CaptionRequest,
  ): Promise<VideoCaptions | undefined> {
    const id = videoId();
    if (!id) return undefined;
    const loaded = await loadFrom(id, request, false);
    if (loaded !== AGAIN) return loaded;
    // Once more, with a request the player makes now and the response it makes it from.
    captures.delete(id);
    const retried = await loadFrom(id, request, true);
    return retried === AGAIN ? undefined : retried;
  }

  /**
   * One try of `loadCaptions`. AGAIN, unless `last`, when the kept request was made from
   * another player response than the current one, or when YouTube answered every track
   * fetched with an empty body (on the last try that is logged instead).
   */
  async function loadFrom(
    id: string,
    request: CaptionRequest,
    last: boolean,
  ): Promise<VideoCaptions | undefined | typeof AGAIN> {
    const { signal } = request;
    const listed = await captionInfo(id, signal);
    const wanted = pickOriginalTrack(listed.tracks, request.learningLang);
    if (!wanted) return undefined;
    const capture = await captureFor(id, wanted, signal);
    if (!capture) return undefined;
    // The player may have replaced its response since it was read (it did on a first
    // load, docs/notes/youtube-captions.md): the tracks come from the one read after
    // its request, which must be the response the request was made from.
    const info = await captionInfo(id, signal);
    if (!last && !sameResponse(capture.url, info.tracks)) return AGAIN;
    const original = pickOriginalTrack(info.tracks, request.learningLang);
    if (!original) return undefined;

    const fetched: string[] = [];
    /** The cues of `track` (or of its auto-translation into `tlang`), from the capture or fetched. */
    const cuesOf = async (track: YouTubeTrack, tlang?: string) => {
      const same =
        capture.lang === track.lang &&
        (capture.kind === "asr") === (track.kind === "asr") &&
        (capture.tlang ?? undefined) === tlang;
      if (same) return parseYouTubeJson3(capture.body);
      const body = await fetchTimedtext(
        trackUrl(capture.url, info.tracks, { track, tlang }),
      );
      fetched.push(body);
      return parseYouTubeJson3(body);
    };

    const cues = await cuesOf(original);
    const tlang = autoTranslateCode(info, original, request.nativeLang);
    const translation =
      cues.length === 0
        ? undefined
        : await firstTranslation(
            request,
            {
              tracks: info.tracks.filter((t) => t !== original),
              canAutoTranslate: tlang !== undefined,
            },
            (choice) =>
              choice.source === "siteTrack"
                ? cuesOf(siteTrack(info, choice.track))
                : cuesOf(original, tlang),
          );
    if (fetched.length > 0 && fetched.every((body) => body.trim() === "")) {
      if (!last) return AGAIN;
      console.warn(
        `Langle: YouTube answered every caption track fetched for ${id} with an empty body (${fetched.length})`,
      );
    }
    return translation && { track: original, cues, translation };
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
    async pause() {
      await call({ type: "pause" });
    },
    async play() {
      await call({ type: "play" });
    },
    onNavigate(listener) {
      const handler = () => listener();
      document.addEventListener("yt-navigate-finish", handler);
      return () => document.removeEventListener("yt-navigate-finish", handler);
    },
    fillsWindow: () => fullBleed() !== null,
    narrowPlayer,
    hideSiteCaptions: hideCaptions,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      hideCaptions(false);
      bridge.dispose();
    },
  };
}
