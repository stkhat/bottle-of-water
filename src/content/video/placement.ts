import type { Box } from "../article/geometry";
import type { Settings } from "../../core/settings";

/** The dictionary window's width (mock Main). */
const WINDOW_WIDTH = 360;
/** Below the site's header (YouTube's masthead is 56px tall). */
const TOP_MIN = 64;
/** Closest the window comes to the viewport's edges. */
const EDGE = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Where the dictionary window opens, from the player's box (mock Main). With the
 * subtitle in the video it sits over the video's right edge and ends above the
 * subtitle (60% down the video); with the subtitle below, it is taller.
 */
export function dictionaryFrame(
  player: Box,
  position: Settings["subtitlePosition"],
  viewport: { width: number; height: number },
): { left: number; top: number; height: number } {
  const inVideo = position === "inVideo";
  const left = clamp(
    player.right - (inVideo ? 164 : 204),
    EDGE,
    viewport.width - WINDOW_WIDTH - EDGE,
  );
  const top = Math.max(TOP_MIN, player.top - (inVideo ? 42 : 32));
  const wanted = inVideo
    ? clamp(player.top + (player.bottom - player.top) * 0.6 - top, 240, 340)
    : 530;
  const height = Math.round(
    Math.max(0, Math.min(wanted, viewport.height - EDGE - top)),
  );
  return { left: Math.round(left), top: Math.round(top), height };
}

/**
 * Where the Lingo menu opens inside the player (its `right` and `bottom`): just above
 * the L and ^ buttons, as in mock Main.
 */
export function menuPlacement(
  player: Box,
  buttons: Box,
): { right: number; bottom: number } {
  return {
    right: Math.round(Math.max(EDGE, player.right - buttons.right - 38)),
    bottom: Math.round(player.bottom - buttons.top + 13),
  };
}
