import { useEffect, useRef } from "preact/hooks";
import { fromUser } from "../from-user";
import {
  boxOfOffsets,
  selectedOffsets,
  selectOffsets,
  type SelectedOffsets,
  type TextBox,
} from "../selection-in-root";

/** Words selected in a subtitle line or a transcript card. */
export interface SelectedText extends SelectedOffsets {
  /** The box of the first line of a part of the text. */
  boxOf(from: number, to: number): TextBox | undefined;
}

/** What a text that words can be selected in reports. */
export interface TextSelectionProps {
  /** A press on the text began selecting (the first selection since the press). */
  onSelectStart?: () => void;
  /**
   * The press ended: the selected part of the text (offsets in it), undefined when
   * nothing in it is selected. Returns the whole words to select instead, if any.
   */
  onSelect?: (
    selected: SelectedText | undefined,
  ) => SelectedOffsets | undefined;
}

/**
 * Presses on a text words are selected in. They do not drop the selection: the press
 * makes a new one, read when it ends. Lingo's parts sit in closed shadow roots, so each
 * marks its own presses.
 */
const onText = new WeakSet<Event>();

export function pressedOnText(event: Event): boolean {
  return onText.has(event);
}

/**
 * Selecting words in a text of Lingo's UI (a shadow root): from a press on the text,
 * the first selection calls `onSelectStart`, and the press's end `onSelect`, whose
 * snapped words are then selected. Returns the text's ref, its pointerdown handler and
 * whether words are selected in it (a click after a drag opens no word).
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
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (started || !selectedOffsets(el)) return;
      started = true;
      handlers.current.onSelectStart?.();
    };
    const onUp = (up: PointerEvent) => {
      if (!fromUser(up)) return;
      document.removeEventListener("selectionchange", onChange);
      removeEventListener("pointerup", onUp, true);
      removeEventListener("pointercancel", onUp, true);
      // Read once the press's own changes to the selection are made.
      timer = setTimeout(() => {
        stop.current = undefined;
        if (!el.isConnected) return;
        const selected = selectedOffsets(el);
        // A quick drag can end before its selection's change is told.
        if (selected && !started) handlers.current.onSelectStart?.();
        const words = handlers.current.onSelect?.(
          selected && {
            ...selected,
            boxOf: (from, to) => boxOfOffsets(el, from, to),
          },
        );
        if (
          words &&
          (words.from !== selected?.from || words.to !== selected.to)
        )
          selectOffsets(el, words.from, words.to);
      });
    };
    document.addEventListener("selectionchange", onChange);
    addEventListener("pointerup", onUp, true);
    addEventListener("pointercancel", onUp, true);
    stop.current = () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
      removeEventListener("pointerup", onUp, true);
      removeEventListener("pointercancel", onUp, true);
    };
  }

  return {
    ref,
    onPointerDown,
    /** Words are selected in the text: a click there ends a drag, not a word's click. */
    selected: () => !!ref.current && selectedOffsets(ref.current) !== undefined,
  };
}
