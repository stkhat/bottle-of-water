import { render, type JSX } from "preact";
import { boxOf } from "../lookup/geometry";
import { createShadowHost } from "../shadow-host";
import { inUse } from "./hold";
import { createStore } from "../store";
import {
  BelowVideoUi,
  CONTROL_BAR_GAP,
  InPlayerUi,
  MenuUi,
  PageUi,
  PlayerBarUi,
  SUBTITLE_BOTTOM,
  subtitleOverVideo,
  TranscriptUi,
  VideoThemed,
  type VideoGeometry,
  type VideoLayout,
} from "./VideoUi";
import type { InsertionPoint, PlatformAdapter } from "./platform";
import type { VideoApp } from "./state";

export interface MountOptions {
  adapter: PlatformAdapter;
  app: VideoApp;
}

interface Part {
  host: HTMLElement;
  /** Where the host belongs now; null when its place is not on the page. */
  point(): InsertionPoint | null;
  /**
   * Moves back into the same parent in the current second, so a site that keeps taking
   * the host out cannot start a loop. A new parent (a control bar the site built again)
   * is not counted.
   */
  moves: { second: number; count: number; parent: Element | null };
}

/** Elements that do not draw their children (the fullscreen element can be the video). */
const NO_CHILDREN = new Set([
  "VIDEO",
  "AUDIO",
  "IMG",
  "IFRAME",
  "CANVAS",
  "EMBED",
  "OBJECT",
]);

/**
 * Where the parts over the page go in fullscreen, where only the fullscreen element is
 * drawn: straight inside it (deeper, an ancestor with a transform would move what is
 * fixed), or in its parent when it cannot hold children. Null outside fullscreen, or when
 * the whole page is in fullscreen.
 */
function fullscreenHost(): Element | null {
  const element = document.fullscreenElement;
  if (!element || element.contains(document.body)) return null;
  return NO_CHILDREN.has(element.tagName) ? element.parentElement : element;
}

/** The transcript sidebar beside a player that fills the window (mock FullWindow): 360px wide, 16px in. */
const SIDEBAR = { width: 360, inset: 16 };
/** How much narrower the player gets for the sidebar. */
const SIDEBAR_ROOM = SIDEBAR.width + 2 * SIDEBAR.inset;
/** Above the site's player, below Lingo's menu, hover card and dictionary window. */
const SIDEBAR_LAYER = 2147483600;

/** The most a part is moved back into the same parent in one second. */
const MAX_MOVES_PER_SECOND = 10;

/**
 * Mounts the video UI on the site's page, each part in its own shadow root: the
 * subtitle inside the player, the subtitle box under it, the transcript in the side
 * column, the L and ^ buttons in the player bar, and the menu, the hover card and the
 * dictionary window over the page (inside the fullscreen element while there is one).
 * Where the player fills the window or the screen (Netflix; YouTube in fullscreen), the
 * transcript goes in a sidebar at the right instead, and the player is narrowed for it.
 * The site re-renders its page (YouTube is a single-page app): a MutationObserver puts
 * the parts back. Returns an unmount.
 */
export function mountVideoUi({ adapter, app }: MountOptions): () => void {
  const layout = createStore<VideoLayout>({
    frameHeight: 0,
    subtitleBottom: SUBTITLE_BOTTOM,
    vertical: adapter.vertical?.() ?? false,
    sidebar: false,
  });
  const sidebar = document.createElement("lingo-video-sidebar");
  sidebar.style.cssText = `position: fixed; z-index: ${SIDEBAR_LAYER};
    top: ${SIDEBAR.inset}px; right: ${SIDEBAR.inset}px; bottom: ${SIDEBAR.inset}px;
    width: ${SIDEBAR.width}px; overflow: hidden;`;
  const parts: Part[] = [];
  const roots: ShadowRoot[] = [];

  function part(
    name: string,
    style: string,
    point: () => InsertionPoint | null,
    ui: JSX.Element,
  ): HTMLElement {
    const { host, root } = createShadowHost(name, style);
    render(<VideoThemed app={app}>{ui}</VideoThemed>, root);
    roots.push(root);
    parts.push({ host, point, moves: { second: 0, count: 0, parent: null } });
    return host;
  }

  /** The hosts the geometry measures, once made. */
  const made: { buttons?: HTMLElement; transcript?: HTMLElement } = {};
  const geometry: VideoGeometry = {
    player: () => boxOf(adapter.playerElement()),
    buttons: () => boxOf(made.buttons?.isConnected ? made.buttons : null),
    transcript: () => {
      const box = boxOf(made.transcript?.isConnected ? made.transcript : null);
      return box && box.bottom > box.top ? box : null;
    },
    beside: () => boxOf(adapter.besidePlayer?.() ?? null),
  };

  part(
    "lingo-video-player",
    "position: absolute; inset: 0; pointer-events: none; z-index: 60;",
    () => {
      const player = adapter.playerElement();
      return player ? { parent: player, before: null } : null;
    },
    <InPlayerUi app={app} layout={layout} />,
  );
  part(
    "lingo-video-below",
    "display: block;",
    () => {
      const below = adapter.belowVideoElement();
      return below ? { parent: below, before: below.firstElementChild } : null;
    },
    <BelowVideoUi app={app} />,
  );
  made.transcript = part(
    "lingo-transcript",
    // Clickable inside a frame that lets clicks through to the video (Netflix).
    "display: block; margin-bottom: 12px; pointer-events: auto;",
    () =>
      layout.get().sidebar
        ? { parent: sidebar, before: null }
        : adapter.sideColumn(),
    <TranscriptUi app={app} layout={layout} />,
  );
  made.buttons = part(
    "lingo-player-buttons",
    "display: inline-flex; align-items: center; height: 100%; vertical-align: top;",
    () => adapter.controlsPoint(),
    <PlayerBarUi app={app} />,
  );
  part(
    "lingo-video",
    "display: contents;",
    () => {
      const parent = fullscreenHost() ?? document.body;
      return parent ? { parent, before: null } : null;
    },
    // The menu first: the dictionary window and the hover card stack above it.
    <>
      <MenuUi app={app} geometry={geometry} layout={layout} />
      <PageUi app={app} geometry={geometry} layout={layout} />
    </>,
  );

  const resize = new ResizeObserver(([entry]) => {
    if (entry) layout.set({ frameHeight: entry.contentRect.height });
  });
  let observed: Element | null = null;

  /**
   * Keeps the in-video subtitle clear of the site's control bar while it shows. While
   * Lingo is in use the subtitle stays where it is: Netflix takes its bar away a few
   * seconds after the pointer stops on a word, and moving the word from under it would
   * close the hover card (and play the video again).
   */
  function liftSubtitle() {
    if (inUse(app.store.get())) return;
    const barTop = adapter.controlBarTop?.() ?? null;
    const player = boxOf(adapter.playerElement());
    const subtitleBottom =
      barTop === null || !player
        ? SUBTITLE_BOTTOM
        : Math.max(
            SUBTITLE_BOTTOM,
            Math.ceil(player.bottom - barTop + CONTROL_BAR_GAP),
          );
    if (subtitleBottom !== layout.get().subtitleBottom)
      layout.set({ subtitleBottom });
  }

  /**
   * While Lingo's subtitle is over the video, the site's control bar shows only after a
   * longer move (it lifts the subtitle), and never while Lingo is in use.
   */
  function holdBackControlBar() {
    const state = app.store.get();
    adapter.holdBackControlBar?.(
      !subtitleOverVideo(state, layout.get().vertical)
        ? "free"
        : inUse(state)
          ? "hidden"
          : "delay",
    );
  }

  /**
   * The sidebar shows while the transcript does beside a player that fills the window:
   * the player is narrowed for it, and given its width back otherwise.
   */
  function arrangeSidebar() {
    const { enabled, status, settings } = app.store.get();
    const on =
      enabled &&
      status === "ready" &&
      settings.transcriptShown &&
      !layout.get().vertical &&
      (adapter.fillsWindow?.() ?? false);
    adapter.narrowPlayer?.(on ? SIDEBAR_ROOM : 0);
    if (on) {
      const parent = fullscreenHost() ?? document.body;
      if (sidebar.parentElement !== parent) parent.append(sidebar);
    } else sidebar.remove();
    if (on !== layout.get().sidebar) layout.set({ sidebar: on });
  }

  /** Puts every part where it belongs (only those that moved: no mutation otherwise). */
  function place() {
    const vertical = adapter.vertical?.() ?? false;
    if (vertical !== layout.get().vertical) layout.set({ vertical });
    arrangeSidebar();
    const second = Math.floor(performance.now() / 1000);
    for (const { host, point, moves } of parts) {
      const at = point();
      if (!at) continue;
      // At the end (before: null), anywhere in the parent will do.
      const placed =
        host.parentElement === at.parent &&
        (at.before === null ||
          at.before === host ||
          at.before === host.nextElementSibling);
      if (placed) continue;
      if (moves.second !== second || moves.parent !== at.parent)
        Object.assign(moves, { second, count: 0, parent: at.parent });
      if (++moves.count > MAX_MOVES_PER_SECOND) continue;
      at.parent.insertBefore(host, at.before);
    }
    holdBackControlBar();
    liftSubtitle();
    const frame = layout.get().sidebar ? sidebar : adapter.playerElement();
    if (frame !== observed) {
      if (observed) resize.unobserve(observed);
      if (frame) resize.observe(frame);
      observed = frame;
    }
  }

  let frame: number | undefined;
  const schedule = () => {
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      place();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  place();

  const onFullscreen = () => {
    app.setFullscreen(document.fullscreenElement !== null);
    schedule();
  };
  document.addEventListener("fullscreenchange", onFullscreen);
  // Lingo on or off, the video's subtitles, the menu's switch and the column's ×.
  const offStore = app.store.subscribe(schedule);

  return () => {
    offStore();
    observer.disconnect();
    resize.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    document.removeEventListener("fullscreenchange", onFullscreen);
    for (const root of roots) render(null, root);
    for (const { host } of parts) host.remove();
    sidebar.remove();
    adapter.narrowPlayer?.(0);
  };
}
