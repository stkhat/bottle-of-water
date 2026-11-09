import { render, type JSX } from "preact";
import type { Box } from "../article/geometry";
import { createStore } from "../ui/store";
import {
  BelowVideoUi,
  InPlayerUi,
  PageUi,
  PlayerBarUi,
  TranscriptUi,
  type VideoGeometry,
  type VideoLayout,
} from "../ui/VideoUi";
import type { InsertionPoint, PlatformAdapter } from "./platform";
import type { VideoApp } from "./session";

export interface MountOptions {
  adapter: PlatformAdapter;
  app: VideoApp;
}

/** Events that must not reach the site's player (play/pause on click, shortcuts). */
const PRIVATE_EVENTS = [
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "contextmenu",
  "keydown",
  "keyup",
  "keypress",
] as const;

interface Part {
  host: HTMLElement;
  /** Where the host belongs now; null when its place is not on the page. */
  point(): InsertionPoint | null;
  /** Moves in the current second, so a site that keeps moving it cannot start a loop. */
  moves: { second: number; count: number };
}

/** The most a part is moved back in one second. */
const MAX_MOVES_PER_SECOND = 10;

const boxOf = (element: Element | null | undefined): Box | null => {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/**
 * Mounts the video UI on the site's page, each part in its own shadow root: the
 * subtitle and the menu inside the player, the subtitle box under it, the transcript in
 * the side column, the L and ^ buttons in the player bar, and the hover card, the
 * dictionary window and the end card over the page. The site re-renders its page
 * (YouTube is a single-page app): a MutationObserver puts the parts back. Returns an
 * unmount.
 */
export function mountVideoUi({ adapter, app }: MountOptions): () => void {
  const layout = createStore<VideoLayout>({ frameHeight: 0 });
  const parts: Part[] = [];
  const roots: ShadowRoot[] = [];

  function part(
    name: string,
    style: string,
    point: () => InsertionPoint | null,
    ui: JSX.Element,
  ): HTMLElement {
    const host = document.createElement(name);
    host.style.cssText = style;
    for (const type of PRIVATE_EVENTS)
      host.addEventListener(type, (event) => event.stopPropagation());
    const root = host.attachShadow({ mode: "open" });
    render(ui, root);
    roots.push(root);
    parts.push({ host, point, moves: { second: 0, count: 0 } });
    return host;
  }

  /** The player buttons' host, once made. */
  const made: { buttons?: HTMLElement } = {};
  const geometry: VideoGeometry = {
    player: () => boxOf(adapter.playerElement()),
    buttons: () => boxOf(made.buttons?.isConnected ? made.buttons : null),
  };

  part(
    "lingo-video-player",
    "position: absolute; inset: 0; pointer-events: none; z-index: 60;",
    () => {
      const player = adapter.playerElement();
      return player ? { parent: player, before: null } : null;
    },
    <InPlayerUi app={app} geometry={geometry} />,
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
  part(
    "lingo-transcript",
    // Clickable inside a frame that lets clicks through to the video (Netflix).
    "display: block; margin-bottom: 12px; pointer-events: auto;",
    () => adapter.sideColumn(),
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
    () => (document.body ? { parent: document.body, before: null } : null),
    <PageUi app={app} geometry={geometry} />,
  );

  const resize = new ResizeObserver(([entry]) => {
    if (entry) layout.set({ frameHeight: entry.contentRect.height });
  });
  let observed: Element | null = null;

  /** Puts every part where it belongs (only those that moved: no mutation otherwise). */
  function place() {
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
      if (moves.second !== second) Object.assign(moves, { second, count: 0 });
      if (++moves.count > MAX_MOVES_PER_SECOND) continue;
      at.parent.insertBefore(host, at.before);
    }
    const frame = adapter.transcriptFrame?.() ?? adapter.playerElement();
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

  const onFullscreen = () =>
    app.setFullscreen(document.fullscreenElement !== null);
  document.addEventListener("fullscreenchange", onFullscreen);

  return () => {
    observer.disconnect();
    resize.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    document.removeEventListener("fullscreenchange", onFullscreen);
    for (const root of roots) render(null, root);
    for (const { host } of parts) host.remove();
  };
}
