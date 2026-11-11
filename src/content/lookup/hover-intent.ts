export interface HoverIntentCallbacks<T> {
  show(target: T): void;
  hide(): void;
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

/** How long the pointer rests on a word before its card shows (ms). */
const SHOW_DELAY_MS = 250;
/** How long the card stays after the pointer leaves the word and the card (ms). */
const HIDE_DELAY_MS = 200;

/**
 * When a word's card shows and hides, from the pointer entering and leaving words and
 * the card. `same` tells whether two targets are the same word.
 */
export function createHoverIntent<T>(
  cb: HoverIntentCallbacks<T>,
  same: (a: T, b: T) => boolean = Object.is,
): HoverIntent<T> {
  let shown: { target: T } | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      shown = undefined;
      cb.hide();
    }, HIDE_DELAY_MS);
  }

  return {
    enter(target) {
      clearTimeout(showTimer);
      // The card up stays until this word's card replaces it.
      clearTimeout(hideTimer);
      if (shown && same(shown.target, target)) return;
      showTimer = setTimeout(() => {
        clearTimeout(hideTimer);
        shown = { target };
        cb.show(target);
      }, SHOW_DELAY_MS);
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
