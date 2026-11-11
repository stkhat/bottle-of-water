import { fromUser } from "../../ui/from-user";
import { createHoverIntent } from "../lookup/hover-intent";
import type { SpanRef } from "./locate";

export interface InteractionCallbacks {
  /** The span under a viewport point that has a card, if any. */
  spanAt(x: number, y: number): SpanRef | undefined;
  showHover(ref: SpanRef): void;
  hideHover(): void;
  /** A word was clicked. */
  click(ref: SpanRef): void;
  /** The page's selection settled (the pointer is up); undefined when it is collapsed. */
  selection(range: Range | undefined): void;
  escape(): void;
  /** The user pressed the page somewhere other than a word a click opens. */
  pressAway(): void;
  /** The page or an element in it scrolled, or the window was resized. */
  scroll(): void;
}

export interface Interactions {
  /** The pointer is in the hover card. */
  keepHover(): void;
  /** The pointer left the hover card. */
  releaseHover(): void;
  /** Hides the hover card now, as a press on the page does. */
  dismissHover(): void;
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

/** How long the selection must stay unchanged before it is read (ms). */
const SELECTION_DELAY_MS = 100;

const same = (a: SpanRef | undefined, b: SpanRef | undefined) =>
  a === b ||
  (!!a && !!b && a.block === b.block && a.span.start === b.span.start);

/**
 * Turns pointer, selection, keyboard and scroll events on the page into hover, click,
 * selection, Escape and scroll callbacks; events a page script dispatched (not
 * `isTrusted`) are ignored. The pointer is read once per animation frame; cards show
 * and hide as `createHoverIntent` says.
 */
export function watchInteractions(cb: InteractionCallbacks): Interactions {
  const hover = createHoverIntent<SpanRef>(
    { show: cb.showHover, hide: cb.hideHover },
    same,
  );
  /** The word under the pointer. */
  let candidate: SpanRef | undefined;
  let frame: number | undefined;
  let lastMove: PointerEvent | undefined;
  /** A button is down on the page: the selection is still being made. */
  let pressed = false;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;

  function hideNow() {
    candidate = undefined;
    hover.cancel();
  }

  function track(event: PointerEvent) {
    if (inLingoUi(event)) return;
    const ref =
      event.buttons === 0 ? cb.spanAt(event.clientX, event.clientY) : undefined;
    if (same(ref, candidate)) return;
    candidate = ref;
    if (ref) hover.enter(ref);
    else hover.leave();
  }

  function onPointerMove(event: PointerEvent) {
    if (!fromUser(event)) return;
    lastMove = event;
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      if (lastMove) track(lastMove);
    });
  }

  function onPointerDown(event: PointerEvent) {
    if (!fromUser(event) || inLingoUi(event)) return;
    pressed = true;
    hideNow();
    if (!opensWord(event)) cb.pressAway();
  }

  function readSelection(delay: number) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selection = getSelection();
      cb.selection(
        selection && selection.rangeCount > 0 && !selection.isCollapsed
          ? selection.getRangeAt(0)
          : undefined,
      );
    }, delay);
  }

  function onPointerUp(event: PointerEvent) {
    if (!fromUser(event) || !pressed) return;
    pressed = false;
    readSelection(0);
  }

  function onSelectionChange() {
    if (!pressed) readSelection(SELECTION_DELAY_MS);
  }

  /** A click at the event's point would open a word (see `onClick`). */
  function opensWord(event: MouseEvent): boolean {
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return false;
    return cb.spanAt(event.clientX, event.clientY) !== undefined;
  }

  function onClick(event: MouseEvent) {
    if (!fromUser(event) || event.button !== 0 || inLingoUi(event)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (getSelection()?.isCollapsed === false) return;
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return;
    const ref = cb.spanAt(event.clientX, event.clientY);
    if (ref) cb.click(ref);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (fromUser(event) && event.key === "Escape" && !inLingoUi(event))
      cb.escape();
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
  document.addEventListener("pointerup", onPointerUp, passive);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, passive);
  window.addEventListener("resize", onScroll, passive);

  return {
    keepHover() {
      candidate = undefined;
      hover.keep();
    },
    releaseHover() {
      candidate = undefined;
      hover.release();
    },
    dismissHover: hideNow,
    stop() {
      hover.cancel();
      clearTimeout(selectionTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
      document.removeEventListener("pointermove", onPointerMove, passive);
      document.removeEventListener("pointerdown", onPointerDown, passive);
      document.removeEventListener("pointerup", onPointerUp, passive);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, passive);
      window.removeEventListener("resize", onScroll, passive);
    },
  };
}
