export interface HoverIntentCallbacks<T> {
  show(target: T): void;
  hide(): void;
}

export interface HoverIntentOptions {
  /** How long the pointer rests on a word before its card shows (ms). */
  showDelayMs?: number;
  /** How long the card stays after the pointer leaves the word and the card (ms). */
  hideDelayMs?: number;
}

export interface HoverIntent<T> {
  /** The pointer entered a word. */
  enter(target: T): void;
  /** The pointer left the word. */
  leave(): void;
  /** The pointer is on the card. */
  keep(): void;
  /** The pointer left the card. */
  release(): void;
  /** Hides the card now. */
  cancel(): void;
}

/**
 * When a word's card shows and hides, from the pointer entering and leaving words and
 * the card (the article UI's timing: 250 ms to show, 200 ms to hide).
 */
export function createHoverIntent<T>(
  cb: HoverIntentCallbacks<T>,
  { showDelayMs = 250, hideDelayMs = 200 }: HoverIntentOptions = {},
): HoverIntent<T> {
  let shown: { target: T } | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      shown = undefined;
      cb.hide();
    }, hideDelayMs);
  }

  return {
    enter(target) {
      clearTimeout(showTimer);
      // The card up stays until this word's card replaces it.
      clearTimeout(hideTimer);
      if (shown && shown.target === target) return;
      showTimer = setTimeout(() => {
        clearTimeout(hideTimer);
        shown = { target };
        cb.show(target);
      }, showDelayMs);
    },
    leave() {
      clearTimeout(showTimer);
      if (shown) scheduleHide();
    },
    keep() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    },
    release() {
      if (shown) scheduleHide();
    },
    cancel() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      if (shown) {
        shown = undefined;
        cb.hide();
      }
    },
  };
}
