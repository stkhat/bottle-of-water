import { useEffect, useRef } from "preact/hooks";
import { wordRuns } from "../../core/phrases/key";
import { fromUser } from "../from-user";
import {
  boxOfOffsets,
  rangeOfOffsets,
  selectedOffsets,
  selectOffsets,
  type SelectedOffsets,
  type TextBox,
} from "../selection-in-root";

/** The end of a selection a drag grows from: its start, or its end when dragged back. */
export type Anchor = "start" | "end";

/** Words selected in a subtitle line or a transcript card. */
export interface SelectedText extends SelectedOffsets {
  /** The end the drag grew from. */
  anchor: Anchor;
  /** The box of the first line of a part of the text. */
  boxOf(from: number, to: number): TextBox | undefined;
}

/** What a text that words can be selected in reports. */
export interface TextSelectionProps {
  /** A press on the text began selecting (it moved past a click). */
  onSelectStart?: () => void;
  /**
   * The whole words to select for a part of the text (offsets in it), grown from
   * `anchor`: shown while the drag goes on. Undefined selects nothing.
   */
  onSnap?: (
    from: number,
    to: number,
    anchor: Anchor,
  ) => SelectedOffsets | undefined;
  /**
   * The press ended: the selected words (offsets in the text), undefined when it
   * selected none. Returns the words to keep selected, if any: the selection goes
   * otherwise.
   */
  onSelect?: (
    selected: SelectedText | undefined,
  ) => SelectedOffsets | undefined;
}

/**
 * Presses on a text words are selected in. They do not drop the selection: the press
 * makes a new one, read when it ends. Langle's parts sit in closed shadow roots, so each
 * marks its own presses.
 */
const onText = new WeakSet<Event>();

export function pressedOnText(event: Event): boolean {
  return onText.has(event);
}

/** How far a press moves before it selects rather than clicks (px). */
const DRAG_PX = 4;

/** A word of the text: offsets in it. */
interface Word {
  start: number;
  end: number;
}

/**
 * The word nearest a viewport point, of the words laid out in the text: on the nearest
 * line, the nearest word along it. A point past the text's edge gives its nearest word,
 * so a drag never leaves the text.
 */
function wordNear(
  el: Element,
  words: readonly Word[],
  x: number,
  y: number,
): Word | undefined {
  let best: Word | undefined;
  let bestY = Infinity;
  let bestX = Infinity;
  for (const word of words) {
    const rects = rangeOfOffsets(el, word.start, word.end)?.getClientRects();
    for (const r of rects ?? []) {
      if (r.width === 0 && r.height === 0) continue;
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const dx = Math.max(r.left - x, 0, x - r.right);
      if (dy < bestY || (dy === bestY && dx < bestX)) {
        best = word;
        bestY = dy;
        bestX = dx;
      }
    }
  }
  return best;
}

/**
 * Selecting words in a text of Langle's UI (a shadow root), as Langle draws it
 * (2026-11-19): the browser's own drag selection would leave the text for the site's
 * page under it (the subtitle's box lets presses through around its lines, a card
 * sits beside the video), where the site takes the click and the page scrolls. A
 * press on the text selects nothing natively. Once it has moved a few pixels it calls
 * `onSelectStart`, holds the pointer, and selects whole words from the word pressed
 * to the word nearest the pointer, clamped to the text, as `onSnap` snaps them, once a
 * frame. Its end calls `onSelect` and swallows the click that follows, so neither the
 * site nor a word nor a card takes it. A press that does not move is a click (it
 * opens the word), and ends with `onSelect(undefined)`.
 *
 * Returns the text's ref, its pointerdown handler and whether words are selected in it.
 */
export function useTextSelection<E extends HTMLElement>(
  props: TextSelectionProps,
) {
  const ref = useRef<E>(null);
  const handlers = useRef(props);
  handlers.current = props;
  const stop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stop.current?.(), []);

  function onPointerDown(event: PointerEvent) {
    const el = ref.current;
    if (!el || !fromUser(event) || event.button !== 0) return;
    if (!handlers.current.onSelect) return;
    onText.add(event);
    stop.current?.();
    // A press inside selected words would drag them (the browser's text drag): the
    // press selects anew.
    if (selectedOffsets(el)) getSelection()?.removeAllRanges();
    const text = el.textContent ?? "";
    const words = wordRuns(text);
    const pressed = wordNear(el, words, event.clientX, event.clientY);
    const { pointerId } = event;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let frame: number | undefined;
    let last: { x: number; y: number } | undefined;
    /** The words selected now. */
    let shown: SelectedText | undefined;

    const noNativeSelection = (e: Event) => e.preventDefault();

    const unselect = () => {
      if (selectedOffsets(el!)) getSelection()?.removeAllRanges();
    };

    /**
     * Selects the words from the pressed one to the one nearest the pointer. A text
     * that changed under the press (the next line) selects nothing.
     */
    function follow(x: number, y: number) {
      const near = pressed && wordNear(el!, words, x, y);
      const snapped =
        pressed && near && el!.textContent === text
          ? handlers.current.onSnap?.(
              Math.min(pressed.start, near.start),
              Math.max(pressed.end, near.end),
              near.start < pressed.start ? "end" : "start",
            )
          : undefined;
      if (snapped?.from === shown?.from && snapped?.to === shown?.to) return;
      const anchor: Anchor =
        near && pressed && near.start < pressed.start ? "end" : "start";
      shown = snapped && {
        ...snapped,
        anchor,
        boxOf: (start, end) => boxOfOffsets(el!, start, end),
      };
      if (shown) selectOffsets(el!, shown.from, shown.to);
      else unselect();
    }

    /** The press moved far enough to select. */
    function begin() {
      dragging = true;
      try {
        el!.setPointerCapture(pointerId);
        el!.addEventListener("lostpointercapture", onLost);
      } catch {
        // The pointer is gone already (its press ended): the end comes next.
      }
      handlers.current.onSelectStart?.();
    }

    function onMove(move: PointerEvent) {
      if (move.pointerId !== pointerId || !fromUser(move)) return;
      // The button was let go where this document did not hear it.
      if (move.buttons === 0) {
        finish(move.clientX, move.clientY);
        return;
      }
      last = { x: move.clientX, y: move.clientY };
      if (!dragging) {
        if (Math.hypot(last.x - startX, last.y - startY) < DRAG_PX) return;
        begin();
      }
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        if (last) follow(last.x, last.y);
      });
    }

    /** Swallows the click that ends a drag (the next one, before anything sees it). */
    function swallowClick() {
      const swallow = (click: Event) => {
        click.stopImmediatePropagation();
        click.preventDefault();
        forget();
      };
      const forget = () => {
        removeEventListener("click", swallow, true);
        removeEventListener("pointerdown", forget, true);
      };
      addEventListener("click", swallow, true);
      // A drag let go outside the window gets no click: the next press is not it.
      addEventListener("pointerdown", forget, true);
    }

    function onUp(up: PointerEvent) {
      if (up.pointerId !== pointerId || !fromUser(up)) return;
      finish(up.clientX, up.clientY);
    }

    /**
     * The drag lost the pointer without its end coming here (let go where this
     * document does not hear it, or the text went): it ends where the pointer was last.
     */
    function onLost() {
      finish(last?.x ?? startX, last?.y ?? startY);
    }

    /** The press ended at `x`, `y`. */
    function finish(x: number, y: number) {
      end();
      if (!dragging && Math.hypot(x - startX, y - startY) >= DRAG_PX) begin();
      const connected = el!.isConnected;
      if (dragging) {
        // The last moves may not have had their frame yet.
        if (connected) follow(x, y);
        swallowClick();
      }
      const kept = handlers.current.onSelect?.(
        dragging && connected ? shown : undefined,
      );
      if (!connected) return;
      // Words without a card are not left selected.
      if (!kept) unselect();
      else if (kept.from !== shown?.from || kept.to !== shown.to)
        selectOffsets(el!, kept.from, kept.to);
    }

    function end() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      el!.removeEventListener("mousedown", noNativeSelection);
      el!.removeEventListener("selectstart", noNativeSelection);
      el!.removeEventListener("lostpointercapture", onLost);
      removeEventListener("pointermove", onMove, true);
      removeEventListener("pointerup", onUp, true);
      removeEventListener("pointercancel", onUp, true);
      stop.current = undefined;
    }

    // The press's mousedown would start the browser's drag selection, which moves the
    // focus of the selection made here with the pointer.
    el.addEventListener("mousedown", noNativeSelection, { once: true });
    el.addEventListener("selectstart", noNativeSelection);
    addEventListener("pointermove", onMove, true);
    addEventListener("pointerup", onUp, true);
    addEventListener("pointercancel", onUp, true);
    stop.current = end;
  }

  return {
    ref,
    onPointerDown,
    /** Words are selected in the text: a click there ends a drag, not a word's click. */
    selected: () => !!ref.current && selectedOffsets(ref.current) !== undefined,
  };
}
