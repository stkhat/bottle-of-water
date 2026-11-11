import type { Box } from "../lookup/geometry";
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
 * How far the window's right edge goes past the transcript's left edge (mock Main:
 * the window ends at 1100, the transcript starts at 1088). With the subtitle below the
 * video the window is taller and ends 28px before the transcript instead.
 */
const INTO_TRANSCRIPT = { inVideo: 12, belowVideo: -28 };

/** The transcript is beside the video: to its right and level with it. */
const beside = (player: Box, transcript: Box) =>
  transcript.left >= player.left + (player.right - player.left) / 2 &&
  transcript.top < player.bottom;

/** Mock Fullscreen: the window 32px from the screen's top and right edges, 420px tall. */
const FULLSCREEN = { inset: 32, height: 420 };

/**
 * Where the dictionary window opens (mock Main). It sits over the right part of the
 * video, its right edge 12px into the transcript beside the video (at the video's right
 * edge without one), and ends above the subtitle in the video (60% down the video);
 * with the subtitle below the video, it is taller and stops short of the transcript.
 * In fullscreen (mock Fullscreen) it is at the screen's top right.
 */
export function dictionaryFrame(
  player: Box,
  position: Settings["subtitlePosition"] | "fullscreen",
  viewport: { width: number; height: number },
  transcript?: Box | null,
): { left: number; top: number; height: number } {
  if (position === "fullscreen") {
    const { inset } = FULLSCREEN;
    const left = clamp(
      viewport.width - inset - WINDOW_WIDTH,
      EDGE,
      viewport.width - WINDOW_WIDTH - EDGE,
    );
    const height = Math.max(
      0,
      Math.min(FULLSCREEN.height, viewport.height - EDGE - inset),
    );
    return { left: Math.round(left), top: inset, height: Math.round(height) };
  }
  const inVideo = position === "inVideo";
  const into = INTO_TRANSCRIPT[position];
  const right =
    transcript && beside(player, transcript)
      ? transcript.left + into
      : player.right + into - INTO_TRANSCRIPT.inVideo;
  const left = clamp(
    right - WINDOW_WIDTH,
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
