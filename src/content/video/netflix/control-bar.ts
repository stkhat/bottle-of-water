import { styleSwitch } from "../adapter-kit";
import type { ControlBarMode } from "../platform";
import {
  BAR_GONE_MS,
  CONTROL_BAR_HEIGHT,
  HIDE_CONTROL_BAR_CSS,
  query,
  SELECTORS,
  TOP_STRIP,
} from "./site";

/**
 * Netflix's control bar is held back while Lingo's subtitle is over the video
 * (docs/notes/netflix.md, "Layout decisions"): it shows once the pointer has stayed in
 * the bar's area for a while, or at once in the top strip; never while Lingo is in use.
 * Each new bar is held back again. The adapter hands over the pointer's moves.
 */
export function createControlBar(o: {
  player: () => HTMLElement | null;
  /** How long the pointer stays in the bar's area before the bar shows. */
  delayMs: number;
}) {
  const hideBar = styleSwitch("lingo-hide-netflix-bar", HIDE_CONTROL_BAR_CSS);
  let barMode: ControlBarMode = "free";
  let revealed = false;
  let barPresent = false;
  /** Where the pointer's last move over the player was: the bar's area, the top strip. */
  let pointerAt: "bottom" | "top" | null = null;
  let barGoneTimer: ReturnType<typeof setTimeout> | undefined;
  /** Runs while the pointer stays in the bar's area; shows the bar when it ends. */
  let bottomTimer: ReturnType<typeof setTimeout> | undefined;
  const barHidden = () =>
    barMode === "hidden" || (barMode === "delay" && !revealed);
  function cancelBottom() {
    clearTimeout(bottomTimer);
    bottomTimer = undefined;
  }
  function reveal() {
    cancelBottom();
    revealed = true;
    hideBar(false);
  }

  /** The bar shows at once in the top strip, after `delayMs` in the bar's area. */
  function revealForPointer() {
    if (barMode !== "delay" || revealed) return cancelBottom();
    if (pointerAt === "top") return reveal();
    if (pointerAt !== "bottom") return cancelBottom();
    bottomTimer ??= setTimeout(() => {
      bottomTimer = undefined;
      if (pointerAt === "bottom" && barMode === "delay") reveal();
    }, o.delayMs);
  }

  return {
    /** Lingo keeps the bar hidden now. */
    hidden: barHidden,

    /** The pointer moved. */
    watch(event: Event) {
      const box = o.player()?.getBoundingClientRect();
      const { clientX: x, clientY: y } = event as MouseEvent;
      const over =
        box !== undefined &&
        x >= box.left &&
        x <= box.right &&
        y >= box.top &&
        y <= box.bottom;
      pointerAt = !over
        ? null
        : y >= box.bottom - CONTROL_BAR_HEIGHT
          ? "bottom"
          : y <= box.top + TOP_STRIP
            ? "top"
            : null;
      revealForPointer();
    },

    /** The pointer left the window (over its bottom edge, say): it is in no area. */
    pointerOut(event: Event) {
      if ((event as MouseEvent).relatedTarget !== null) return;
      pointerAt = null;
      cancelBottom();
    },

    /** `PlatformAdapter.holdBackControlBar`. */
    holdBack(mode: ControlBarMode) {
      if (mode === "hidden") revealed = false;
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
      // The pointer may already be in an area (the move that ended Lingo's use, say).
      revealForPointer();
      hideBar(barHidden());
    },

    dispose() {
      clearTimeout(barGoneTimer);
      cancelBottom();
      hideBar(false);
    },
  };
}
