import { parseTtml } from "../../../core/subtitles/ttml";
import type { Cue } from "../../../core/subtitles/types";
import { parseWebVtt } from "../../../core/subtitles/webvtt";
import { firstTranslation, playerNarrower, styleSwitch } from "../adapter-kit";
import {
  createPageBridge,
  NETWORK_CALL_TIMEOUT_MS,
  retryNetworkCall,
} from "../page-channel";
import { createRecent } from "../recent";
import type {
  CaptionRequest,
  ControlBarMode,
  InsertionPoint,
  PlatformAdapter,
  VideoCaptions,
} from "../platform";
import type { NetflixTextTrack } from "./manifest";
import {
  CHANNEL,
  isTrackList,
  isTracksMessage,
  type PageCall,
  type PageCallResults,
  type TracksMessage,
} from "./messages";
import {
  CONTROL_BAR_DELAY_MS,
  CONTROL_BAR_HEIGHT,
  HIDE_CAPTIONS_CSS,
  HIDE_CONTROL_BAR_CSS,
  KEEP_TITLES,
  BAR_GONE_MS,
  POINTER_REST_MS,
  query,
  SELECTORS,
  titleText,
  TOP_STRIP,
} from "./site";
import { asTrack, pickOriginalTrack, translationTracks } from "./tracks";

export interface NetflixAdapterOptions {
  /** Default: `location.href`. */
  href?: () => string;
  /** How long to wait for the player to parse the title's manifest. */
  tracksTimeoutMs?: number;
  /** How often the URL is checked for another title (Netflix is a single-page app). */
  pollMs?: number;
  /** How long the floating player buttons stay after the pointer stops. */
  idleMs?: number;
  /** How long the pointer keeps moving over the player before the control bar shows. */
  controlBarDelayMs?: number;
  /** Default: the content script's `fetch`. */
  fetch?: typeof fetch;
  /** How long to wait for one download through the page script. */
  fetchTimeoutMs?: number;
}

const WATCH = /^\/watch\/(\d+)/;

/**
 * Netflix's watch page. Subtitles come from the manifest the player parses, observed by
 * the page script (`page.ts`): the learning language's track is the original,
 * the native language's track the translation (Netflix has no machine translation).
 * Netflix has no column beside the video: its player fills the window (and the screen
 * in fullscreen), so it is narrowed for the transcript sidebar, and the subtitle box
 * "below the video" sits at the player's bottom. The
 * L and ^ buttons go into Netflix's control bar, which shows only while the pointer
 * moves; on a page without a recognizable bar they float at the player's bottom right.
 * Nothing is stored: subtitle URLs and texts live in memory only.
 */
export function createNetflixAdapter(
  options: NetflixAdapterOptions = {},
): PlatformAdapter {
  const href = options.href ?? (() => location.href);
  const bridge = createPageBridge<PageCall, PageCallResults, TracksMessage>({
    channel: CHANNEL,
    isEvent: isTracksMessage,
  });
  const hideCaptions = styleSwitch(
    "lingo-hide-netflix-captions",
    HIDE_CAPTIONS_CSS,
  );
  const tracksTimeoutMs = options.tracksTimeoutMs ?? 15_000;
  const pollMs = options.pollMs ?? 500;
  const idleMs = options.idleMs ?? 3000;
  const barDelayMs = options.controlBarDelayMs ?? CONTROL_BAR_DELAY_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? NETWORK_CALL_TIMEOUT_MS;
  const fetchText =
    options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));

  const titles = createRecent<NetflixTextTrack[]>(KEEP_TITLES);
  const names = new Map<string, string>();
  const cleanups: (() => void)[] = [];
  cleanups.push(
    bridge.onEvent((message) => titles.set(message.movieId, message.tracks)),
  );

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
    titles.set(movieId, fromPage);
    return fromPage;
  }

  /** The title's tracks, waiting for its manifest; else those of the title the player plays. */
  async function tracksFor(
    movieId: string,
    signal?: AbortSignal,
  ): Promise<NetflixTextTrack[] | undefined> {
    const seen =
      (await seenTracks(movieId)) ??
      (await titles.wait(movieId, tracksTimeoutMs, signal));
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
      return retryNetworkCall(
        () => bridge.call({ type: "fetchText", url }, fetchTimeoutMs),
        signal,
      );
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

    // The native language's track if one can be read (Netflix has no machine translation).
    const translation = await firstTranslation(
      request,
      { tracks: translationTracks(tracks, original), canAutoTranslate: false },
      async (choice) => {
        const picked =
          choice.source === "siteTrack"
            ? tracks.find((t) => t.id === choice.track.id)
            : undefined;
        return picked ? cuesOf(picked, signal) : [];
      },
    );
    return { track: asTrack(original), cues, translation };
  }

  const player = () => query(SELECTORS.player);

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
        element = document.createElement(name);
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

  // The player view holds the control bar, the back arrow and the video; inside
  // `.watch-video`, which is the element in fullscreen (docs/notes/netflix.md).
  const narrowPlayer = playerNarrower(
    () => {
      const view = player();
      return view && view !== document.fullscreenElement ? view : null;
    },
    "width",
    (width) => `calc(100% - ${width}px)`,
  );
  cleanups.push(() => narrowPlayer(0));

  const floating = own(
    "lingo-netflix-controls",
    `position: absolute; z-index: 61; right: 24px; bottom: ${CONTROL_BAR_HEIGHT}px;
     height: 40px; display: flex; visibility: hidden;`,
    player,
  );
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  function showFloating() {
    const group = document.querySelector<HTMLElement>("lingo-netflix-controls");
    if (!group) return;
    group.style.visibility = "visible";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      group.style.visibility = "hidden";
    }, idleMs);
  }

  // Netflix's control bar is held back while Lingo's subtitle is over the video
  // (docs/notes/netflix.md, "Layout decisions"): it shows once the pointer has kept
  // moving over the player, or is in the bar's area or the top strip; never while Lingo
  // is in use. Each new bar is held back again.
  const hideBar = styleSwitch("lingo-hide-netflix-bar", HIDE_CONTROL_BAR_CSS);
  let barMode: ControlBarMode = "free";
  let revealed = false;
  let barPresent = false;
  /** The pointer's last move was in the bar's area or the top strip. */
  let pointerAtEdge = false;
  let barGoneTimer: ReturnType<typeof setTimeout> | undefined;
  let runStart = -Infinity;
  let lastMove = -Infinity;
  const barHidden = () =>
    barMode === "hidden" || (barMode === "delay" && !revealed);
  cleanups.push(() => {
    clearTimeout(barGoneTimer);
    hideBar(false);
  });

  /** Shows the bar after a long enough run of moves over the player, or one at its edges. */
  function watchBar(event: Event) {
    const box = player()?.getBoundingClientRect();
    const { clientX: x, clientY: y } = event as MouseEvent;
    const over =
      box !== undefined &&
      x >= box.left &&
      x <= box.right &&
      y >= box.top &&
      y <= box.bottom;
    if (!over) {
      lastMove = -Infinity;
      pointerAtEdge = false;
      return;
    }
    const now = performance.now();
    if (now - lastMove >= POINTER_REST_MS) runStart = now;
    lastMove = now;
    pointerAtEdge =
      y >= box.bottom - CONTROL_BAR_HEIGHT || y <= box.top + TOP_STRIP;
    if (barMode !== "delay" || revealed) return;
    if (pointerAtEdge || now - runStart >= barDelayMs) {
      revealed = true;
      hideBar(false);
    }
  }

  const onPointerMove = (event: Event) => {
    watchBar(event);
    showFloating();
  };
  // On the window, capturing: the page cannot keep the moves from Lingo.
  const POINTER = ["pointermove", "mousemove"] as const;
  for (const type of POINTER)
    window.addEventListener(type, onPointerMove, {
      capture: true,
      passive: true,
    });
  cleanups.push(() => {
    for (const type of POINTER)
      window.removeEventListener(type, onPointerMove, { capture: true });
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
      row && row !== document.body;
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
    const anchor = query(SELECTORS.controlsAnchor);
    if (anchor?.parentElement) {
      if (!barSeen) {
        barSeen = true;
        // The buttons live in the bar from now on.
        document.querySelector("lingo-netflix-controls")?.remove();
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
    const bar = query(SELECTORS.controlBar);
    const view = player();
    if (!bar || !view || barHidden()) return null;
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
    videoId,
    title() {
      const id = videoId();
      const named = id ? names.get(id) : undefined;
      if (named) return named;
      const bar = query(SELECTORS.title);
      const text = bar ? titleText(bar) : "";
      if (text) return text;
      const page = document.title.replace(/\s*[-|]\s*Netflix$/i, "").trim();
      return page === "Netflix" ? "" : page;
    },
    url() {
      const id = videoId();
      return id ? `https://www.netflix.com/watch/${id}` : href();
    },
    video: () =>
      player()?.querySelector("video") ?? document.querySelector("video"),
    playerElement: player,
    controlsPoint,
    belowVideoElement: below,
    sideColumn: () => null,
    fillsWindow: () => {
      const view = player();
      return view !== null && view !== document.fullscreenElement;
    },
    narrowPlayer,
    controlBarTop,
    holdBackControlBar(mode) {
      if (mode === "hidden") revealed = false;
      // The move that ended Lingo's use (closing a card) went to the bar's area.
      else if (mode === "delay" && barMode === "hidden" && pointerAtEdge)
        revealed = true;
      // The next bar after Netflix took one away (the pointer rested) is held back
      // again; not a bar Netflix builds anew while the pointer moves.
      const present = query(SELECTORS.controlBar) !== null;
      if (present) clearTimeout(barGoneTimer);
      else if (barPresent)
        barGoneTimer = setTimeout(() => {
          if (query(SELECTORS.controlBar)) return;
          revealed = false;
          hideBar(barHidden());
        }, BAR_GONE_MS);
      barPresent = present;
      barMode = mode;
      hideBar(barHidden());
    },
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
    async pause() {
      await bridge.call({ type: "pause" });
    },
    async play() {
      await bridge.call({ type: "play" });
    },
    onNavigate(listener) {
      let last = href();
      const check = () => {
        const now = href();
        if (now === last) return;
        last = now;
        listener();
      };
      window.addEventListener("popstate", check);
      const timer = setInterval(check, pollMs);
      const off = bridge.onEvent(check);
      return () => {
        window.removeEventListener("popstate", check);
        clearInterval(timer);
        off();
      };
    },
    hideSiteCaptions: hideCaptions,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      titles.clear();
      names.clear();
      hideCaptions(false);
      bridge.dispose();
    },
  };
}
