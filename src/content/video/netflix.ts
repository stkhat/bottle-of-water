import { parseTtml } from "../../core/subtitles/ttml";
import { chooseTranslation } from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import { parseWebVtt } from "../../core/subtitles/webvtt";
import { createNetflixBridge, type NetflixBridge } from "./netflix-bridge";
import {
  asTrack,
  pickOriginalTrack,
  translationTracks,
  type NetflixTextTrack,
} from "./netflix-manifest";
import { isTrackList } from "./netflix-messages";
import {
  CONTROL_BAR_HEIGHT,
  HIDE_CAPTIONS_CSS,
  query,
  SELECTORS,
  titleText,
  TOP_BAR_HEIGHT,
} from "./netflix-site";
import type {
  CaptionRequest,
  InsertionPoint,
  PlatformAdapter,
  VideoCaptions,
} from "./platform";

export interface NetflixAdapterOptions {
  /** Default: a bridge to the page script on this window. */
  bridge?: NetflixBridge;
  document?: Document;
  /** Default: `location.href`. */
  href?: () => string;
  /** How long to wait for the player to parse the title's manifest. */
  tracksTimeoutMs?: number;
  /** How often the URL is checked for another title (Netflix is a single-page app). */
  pollMs?: number;
  /** How long the floating player buttons stay after the pointer stops. */
  idleMs?: number;
  /** Default: the content script's `fetch`. */
  fetch?: typeof fetch;
}

export interface NetflixAdapter extends PlatformAdapter {
  readonly platform: "netflix";
}

const HIDE_STYLE_ID = "lingo-hide-netflix-captions";
/** Titles whose tracks are kept (the playing one, the next episode, a few before). */
const KEEP_TITLES = 6;
/** The transcript panel's width (px). */
const PANEL_WIDTH = 360;
/** Lingo's parts over the page, above Netflix's player (below the dictionary window). */
const PANEL_LAYER = 2147483600;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

const WATCH = /^\/watch\/(\d+)/;

/**
 * Netflix's watch page. Subtitles come from the manifest the player parses, observed by
 * the page script (`netflix-page.ts`): the learning language's track is the original,
 * the native language's track the translation (Netflix has no machine translation).
 * Netflix has no column beside the video, so the transcript is a panel at the right of
 * the player, and the subtitle box "below the video" sits at the player's bottom. The
 * L and ^ buttons go into Netflix's control bar, which shows only while the pointer
 * moves; on a page without a recognizable bar they float at the player's bottom right.
 * Nothing is stored: subtitle URLs and texts live in memory only.
 */
export function createNetflixAdapter(
  options: NetflixAdapterOptions = {},
): NetflixAdapter {
  const doc = options.document ?? document;
  const win = doc.defaultView ?? window;
  const href = options.href ?? (() => location.href);
  const bridge = options.bridge ?? createNetflixBridge();
  const tracksTimeoutMs = options.tracksTimeoutMs ?? 15_000;
  const pollMs = options.pollMs ?? 500;
  const idleMs = options.idleMs ?? 3000;
  const fetchText =
    options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));

  const titles = new Map<string, NetflixTextTrack[]>();
  const names = new Map<string, string>();
  const waiters = new Set<(movieId: string) => void>();
  const cleanups: (() => void)[] = [];

  function remember(movieId: string, tracks: NetflixTextTrack[]) {
    titles.delete(movieId);
    titles.set(movieId, tracks);
    while (titles.size > KEEP_TITLES)
      titles.delete(titles.keys().next().value as string);
    for (const waiter of [...waiters]) waiter(movieId);
  }
  cleanups.push(
    bridge.onTracks((message) => remember(message.movieId, message.tracks)),
  );

  function waitForTracks(
    movieId: string,
    ms: number,
    signal?: AbortSignal,
  ): Promise<NetflixTextTrack[] | undefined> {
    return new Promise((resolve, reject) => {
      const finish = (value: NetflixTextTrack[] | undefined) => {
        clearTimeout(timer);
        waiters.delete(waiter);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const waiter = (id: string) => {
        if (id === movieId) finish(titles.get(id));
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

  /** The tracks the page script has seen for `movieId`, if any. */
  async function seenTracks(
    movieId: string,
  ): Promise<NetflixTextTrack[] | undefined> {
    const known = titles.get(movieId);
    if (known) return known;
    const fromPage = await bridge
      .call({ type: "getTracks", movieId })
      .catch(() => null);
    if (!isTrackList(fromPage)) return undefined;
    remember(movieId, fromPage);
    return fromPage;
  }

  /** The title's tracks, waiting for its manifest; else those of the title the player plays. */
  async function tracksFor(
    movieId: string,
    signal?: AbortSignal,
  ): Promise<NetflixTextTrack[] | undefined> {
    const seen =
      (await seenTracks(movieId)) ??
      (await waitForTracks(movieId, tracksTimeoutMs, signal));
    if (seen) return seen;
    signal?.throwIfAborted();
    // The URL can name a show while the player plays one of its episodes.
    const playing = await bridge
      .call({ type: "currentMovieId" })
      .catch(() => null);
    return typeof playing === "string" && playing !== movieId
      ? seenTracks(playing)
      : undefined;
  }

  /**
   * A subtitle file, fetched by the content script, or by the page when the content
   * script's request is refused (CORS rules for content scripts differ by browser).
   */
  async function download(url: string, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetchText(url, { signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      return bridge.call({ type: "fetchText", url });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  /** The track's cues from its first readable format and CDN; [] when none can be read. */
  async function cuesOf(
    track: NetflixTextTrack,
    signal?: AbortSignal,
  ): Promise<Cue[]> {
    for (const { format, urls } of track.downloads)
      for (const url of urls) {
        signal?.throwIfAborted();
        let text: string;
        try {
          text = await download(url, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          continue;
        }
        const cues = format.startsWith("webvtt")
          ? parseWebVtt(text)
          : parseTtml(text);
        if (cues.length > 0) return cues;
      }
    return [];
  }

  function videoId(): string | undefined {
    const url = new URL(href());
    if (url.hostname !== "www.netflix.com" && url.hostname !== "netflix.com")
      return undefined;
    return WATCH.exec(url.pathname)?.[1];
  }

  async function loadCaptions(
    request: CaptionRequest,
  ): Promise<VideoCaptions | undefined> {
    const { signal } = request;
    const id = videoId();
    if (!id) return undefined;
    const tracks = await tracksFor(id, signal);
    if (!tracks) return undefined;
    void bridge
      .call({ type: "title", movieId: id })
      .then((name) => {
        if (typeof name === "string" && name) names.set(id, name);
      })
      .catch(() => {});
    const original = pickOriginalTrack(tracks, request.learningLang);
    if (!original) return undefined;
    const cues = await cuesOf(original, signal);
    if (cues.length === 0) return undefined;

    // The native language's track if one can be read, else the built-in translator.
    let candidates = translationTracks(tracks, original);
    for (;;) {
      signal?.throwIfAborted();
      const choice = chooseTranslation({
        tracks: candidates,
        nativeLang: request.nativeLang,
        canAutoTranslate: false,
        translatorAvailable: request.translatorAvailable,
      });
      const captions = (source: typeof choice.source, list: Cue[]) => ({
        track: asTrack(original),
        cues,
        translation: { source, lang: request.nativeLang, cues: list },
      });
      if (choice.source !== "siteTrack") return captions(choice.source, []);
      const picked = tracks.find((t) => t.id === choice.track.id);
      const list = picked ? await cuesOf(picked, signal) : [];
      if (list.length > 0) return captions("siteTrack", list);
      candidates = candidates.filter((t) => t !== choice.track);
    }
  }

  const player = () => query(doc, SELECTORS.player);

  /** One element of Lingo's own, made once and put back where it belongs when the page re-renders. */
  function own(
    name: string,
    style: string,
    parent: () => Element | null,
  ): () => HTMLElement | null {
    let element: HTMLElement | undefined;
    cleanups.push(() => element?.remove());
    return () => {
      const at = parent();
      if (!at) return null;
      if (!element) {
        element = doc.createElement(name);
        element.style.cssText = style;
      }
      if (element.parentElement !== at) at.append(element);
      return element;
    };
  }

  const below = own(
    "lingo-netflix-below",
    `position: absolute; z-index: 60; left: 50%; transform: translateX(-50%);
     width: min(880px, calc(100% - 48px)); bottom: ${CONTROL_BAR_HEIGHT}px;`,
    player,
  );

  const panel = own(
    "lingo-netflix-side",
    `position: fixed; z-index: ${PANEL_LAYER}; right: 16px; width: ${PANEL_WIDTH}px;
     top: ${TOP_BAR_HEIGHT}px; bottom: ${CONTROL_BAR_HEIGHT}px; overflow: hidden;
     pointer-events: none;`,
    () => doc.body,
  );
  // In fullscreen Netflix's own subtitles show and Lingo's parts step aside.
  const onFullscreen = () => {
    const element = doc.querySelector<HTMLElement>("lingo-netflix-side");
    if (element) element.hidden = doc.fullscreenElement !== null;
  };
  doc.addEventListener("fullscreenchange", onFullscreen);
  cleanups.push(() =>
    doc.removeEventListener("fullscreenchange", onFullscreen),
  );

  const floating = own(
    "lingo-netflix-controls",
    `position: absolute; z-index: 61; right: 24px; bottom: ${CONTROL_BAR_HEIGHT}px;
     height: 40px; display: flex; visibility: hidden;`,
    player,
  );
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const onPointerMove = () => {
    const group = doc.querySelector<HTMLElement>("lingo-netflix-controls");
    if (!group) return;
    group.style.visibility = "visible";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      group.style.visibility = "hidden";
    }, idleMs);
  };
  // On the window, capturing: the page cannot keep the moves from Lingo.
  const POINTER = ["pointermove", "mousemove"] as const;
  for (const type of POINTER)
    win.addEventListener(type, onPointerMove, { capture: true, passive: true });
  cleanups.push(() => {
    for (const type of POINTER)
      win.removeEventListener(type, onPointerMove, { capture: true });
    clearTimeout(idleTimer);
  });

  /** The control bar has been seen on this page: it is only hidden when missing. */
  let barSeen = false;

  /**
   * Before the anchor's slot in the row of buttons: the slot is the row's child that
   * holds the anchor, and the row the anchor's closest ancestor that holds another of
   * the bar's buttons (Netflix wraps each button, and the row also has spacers). On a
   * bar with a single button, the outermost wrapper that holds only the button.
   */
  function before(anchor: Element): InsertionPoint {
    for (
      let slot: Element = anchor, row = anchor.parentElement;
      row && row !== doc.body;
      slot = row, row = row.parentElement
    ) {
      const others = row.querySelectorAll(SELECTORS.controlButton.join(", "));
      if ([...others].some((button) => !slot.contains(button)))
        return { parent: row, before: slot };
    }
    let slot = anchor;
    while (
      slot.parentElement?.parentElement &&
      slot.parentElement.childElementCount === 1
    )
      slot = slot.parentElement;
    return { parent: slot.parentElement!, before: slot };
  }

  function controlsPoint(): InsertionPoint | null {
    const anchor = query(doc, SELECTORS.controlsAnchor);
    if (anchor?.parentElement) {
      if (!barSeen) {
        barSeen = true;
        // The buttons live in the bar from now on.
        doc.querySelector("lingo-netflix-controls")?.remove();
      }
      return before(anchor);
    }
    if (barSeen) return null;
    const group = floating();
    return group ? { parent: group, before: null } : null;
  }

  /**
   * The top of the control bar's lower part: the bar itself and what it shows, those in
   * the player's lower half only (the bar's box may cover the whole player, with the
   * back arrow at the top).
   */
  function controlBarTop(): number | null {
    const bar = query(doc, SELECTORS.controlBar);
    const view = player();
    if (!bar || !view) return null;
    const { top, bottom } = view.getBoundingClientRect();
    const middle = (top + bottom) / 2;
    const parts = [
      bar,
      ...bar.querySelectorAll(SELECTORS.controlBarParts.join(", ")),
    ];
    let highest: number | null = null;
    for (const part of parts) {
      const box = part.getBoundingClientRect();
      if (box.height <= 0 || box.top < middle) continue;
      highest = Math.min(highest ?? box.top, box.top);
    }
    return highest;
  }

  return {
    platform: "netflix",
    matches: (url) =>
      url.hostname === "www.netflix.com" || url.hostname === "netflix.com",
    videoId,
    title() {
      const id = videoId();
      const named = id ? names.get(id) : undefined;
      if (named) return named;
      const bar = query(doc, SELECTORS.title);
      const text = bar ? titleText(bar) : "";
      if (text) return text;
      const page = doc.title.replace(/\s*[-|]\s*Netflix$/i, "").trim();
      return page === "Netflix" ? "" : page;
    },
    url() {
      const id = videoId();
      return id ? `https://www.netflix.com/watch/${id}` : href();
    },
    video: () => player()?.querySelector("video") ?? doc.querySelector("video"),
    playerElement: player,
    controlsPoint,
    belowVideoElement: below,
    sideColumn() {
      const parent = panel();
      return parent ? { parent, before: null } : null;
    },
    transcriptFrame: panel,
    controlBarTop,
    adShowing: () => false,
    async tracks() {
      const id = videoId();
      const tracks = id ? await tracksFor(id) : undefined;
      return (tracks ?? []).filter((t) => !t.forced).map(asTrack);
    },
    loadCaptions,
    async seek(ms) {
      await bridge.call({ type: "seek", ms });
    },
    onNavigate(listener) {
      let last = href();
      const check = () => {
        const now = href();
        if (now === last) return;
        last = now;
        listener();
      };
      win.addEventListener("popstate", check);
      const timer = setInterval(check, pollMs);
      const off = bridge.onTracks(check);
      return () => {
        win.removeEventListener("popstate", check);
        clearInterval(timer);
        off();
      };
    },
    hideSiteCaptions(hidden) {
      const existing = doc.getElementById(HIDE_STYLE_ID);
      if (!hidden) {
        existing?.remove();
        return;
      }
      if (existing) return;
      const style = doc.createElement("style");
      style.id = HIDE_STYLE_ID;
      style.textContent = HIDE_CAPTIONS_CSS;
      (doc.head ?? doc.documentElement).append(style);
    },
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      waiters.clear();
      titles.clear();
      names.clear();
      doc.getElementById(HIDE_STYLE_ID)?.remove();
      if (!options.bridge) bridge.dispose();
    },
  };
}
