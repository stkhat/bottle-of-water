import type { SpanRef } from "./locate";

export interface InteractionCallbacks {
  /** The span under a viewport point that has a card, if any. */
  spanAt(x: number, y: number): SpanRef | undefined;
  showHover(ref: SpanRef): void;
  hideHover(): void;
  /** A word was clicked. */
  click(ref: SpanRef): void;
  escape(): void;
  /** The page or an element in it scrolled, or the window was resized. */
  scroll(): void;
}

export interface InteractionOptions {
  /** How long the pointer rests on a word before its card shows (ms). */
  hoverDelayMs?: number;
  /** How long the card stays after the pointer leaves the word and the card (ms). */
  hideDelayMs?: number;
}

export interface Interactions {
  /** The pointer is in the hover card. */
  keepHover(): void;
  /** The pointer left the hover card. */
  releaseHover(): void;
  stop(): void;
}

/** Page controls that keep their own clicks: words inside them open no panel. */
const INTERACTIVE =
  "a[href], button, input, textarea, select, label, summary, [role=button], [role=link], [contenteditable]";

/** True when the event happened inside Lingo's own UI (a `lingo-*` shadow host). */
function inLingoUi(event: Event): boolean {
  return event
    .composedPath()
    .some((n) => n instanceof Element && n.localName.startsWith("lingo-"));
}

const same = (a: SpanRef | undefined, b: SpanRef | undefined) =>
  a === b ||
  (!!a && !!b && a.block === b.block && a.span.start === b.span.start);

/**
 * Turns pointer, keyboard and scroll events on the page into hover, click, Escape and
 * scroll callbacks. The pointer is read once per animation frame. A word's card
 * shows after the pointer rests on it for `hoverDelayMs` (250 ms) and goes
 * `hideDelayMs` (200 ms) after the pointer leaves both the word and the card.
 */
export function watchInteractions(
  cb: InteractionCallbacks,
  { hoverDelayMs = 250, hideDelayMs = 200 }: InteractionOptions = {},
): Interactions {
  /** The word under the pointer. */
  let candidate: SpanRef | undefined;
  /** The word whose card is up (or on its way). */
  let shown: SpanRef | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  let lastMove: PointerEvent | undefined;

  function hideNow() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    candidate = undefined;
    if (shown) {
      shown = undefined;
      cb.hideHover();
    }
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      shown = undefined;
      cb.hideHover();
    }, hideDelayMs);
  }

  function track(event: PointerEvent) {
    if (inLingoUi(event)) return;
    const ref =
      event.buttons === 0 ? cb.spanAt(event.clientX, event.clientY) : undefined;
    if (same(ref, candidate)) return;
    candidate = ref;
    clearTimeout(showTimer);
    if (same(ref, shown)) {
      clearTimeout(hideTimer);
      return;
    }
    if (shown) scheduleHide();
    if (!ref) return;
    showTimer = setTimeout(() => {
      clearTimeout(hideTimer);
      shown = ref;
      cb.showHover(ref);
    }, hoverDelayMs);
  }

  function onPointerMove(event: PointerEvent) {
    lastMove = event;
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      if (lastMove) track(lastMove);
    });
  }

  function onPointerDown(event: PointerEvent) {
    if (!inLingoUi(event)) hideNow();
  }

  function onClick(event: MouseEvent) {
    if (event.button !== 0 || inLingoUi(event)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (getSelection()?.isCollapsed === false) return;
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return;
    const ref = cb.spanAt(event.clientX, event.clientY);
    if (ref) cb.click(ref);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !inLingoUi(event)) cb.escape();
  }

  let scrollFrame: number | undefined;
  function onScroll() {
    hideNow();
    scrollFrame ??= requestAnimationFrame(() => {
      scrollFrame = undefined;
      cb.scroll();
    });
  }

  const passive = { capture: true, passive: true } as const;
  document.addEventListener("pointermove", onPointerMove, passive);
  document.addEventListener("pointerdown", onPointerDown, passive);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, passive);
  window.addEventListener("resize", onScroll, passive);

  return {
    keepHover() {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      candidate = undefined;
    },
    releaseHover() {
      candidate = undefined;
      if (shown) scheduleHide();
    },
    stop() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
      document.removeEventListener("pointermove", onPointerMove, passive);
      document.removeEventListener("pointerdown", onPointerDown, passive);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, passive);
      window.removeEventListener("resize", onScroll, passive);
    },
  };
}
