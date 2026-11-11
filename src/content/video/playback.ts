import { cueAt, cueIndexAt, lastStartedIndex } from "../../core/subtitles/cues";
import type { TimedTranslation } from "./captions";
import type { PlatformAdapter } from "./platform";
import type { VideoState } from "./state";

/** How often the site's video element is looked for until there is one (ms). */
const FIND_VIDEO_MS = 250;

/**
 * What plays at `ms`: the line, its card, the transcript's card and the translation the
 * subtitle shows. Nothing (-1, "") while not `following` (Lingo off, an ad).
 */
export function playingAt(
  state: VideoState,
  ms: number,
  following: boolean,
  timed: TimedTranslation | null,
): Pick<VideoState, "line" | "current" | "card" | "subtitleTranslation"> {
  const line = following ? cueIndexAt(state.lines, ms) : -1;
  const current = state.lines[line]?.card ?? -1;
  const card = following ? lastStartedIndex(state.cues, ms) : -1;
  let subtitleTranslation = "";
  if (following)
    subtitleTranslation = timed
      ? (cueAt(timed.cues, ms)?.text ?? "").split("\n").join(timed.joiner)
      : current >= 0
        ? (state.translations[current] ?? "")
        : "";
  return { line, current, card, subtitleTranslation };
}

/**
 * Calls `tick` on every frame and playback event of the site's video, once there is
 * one, and `ended` when it ends; until `signal` aborts.
 */
export async function followPlayback(
  adapter: PlatformAdapter,
  signal: AbortSignal,
  tick: (video: HTMLVideoElement) => void,
  ended: () => void,
) {
  let video = adapter.video();
  while (!video) {
    await new Promise((resolve) => setTimeout(resolve, FIND_VIDEO_MS));
    if (signal.aborted) return;
    video = adapter.video();
  }
  if (signal.aborted) return;
  const element = video;
  const onTick = () => tick(element);
  const events = ["timeupdate", "seeked", "play", "pause", "loadeddata"];
  for (const type of events) element.addEventListener(type, onTick);
  element.addEventListener("ended", ended);
  let frame: number | undefined;
  const loop = () => {
    onTick();
    frame = element.requestVideoFrameCallback(loop);
  };
  if ("requestVideoFrameCallback" in element)
    frame = element.requestVideoFrameCallback(loop);
  signal.addEventListener("abort", () => {
    for (const type of events) element.removeEventListener(type, onTick);
    element.removeEventListener("ended", ended);
    if (frame !== undefined) element.cancelVideoFrameCallback(frame);
  });
  onTick();
}
