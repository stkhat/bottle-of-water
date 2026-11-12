import { warn } from "../lookup/warn";
import type { Store } from "../store";
import type { PlatformAdapter } from "./platform";
import type { VideoState } from "./state";

/**
 * How long the video waits after the last card or selection closed before it plays
 * again, so moving from word to word (or from the hover card to the window) does not
 * play and pause it.
 */
export const RESUME_DELAY_MS = 200;

/** A card or a selection is open over the words (spec: "Pausing while Lingo is in use"). */
const inUse = (s: VideoState) =>
  s.hover !== null || s.panel !== null || s.phrase !== null || s.selecting;

export interface PlaybackHold {
  /** Forgets Lingo's pause: another video is not Lingo's to play. */
  reset(): void;
  stop(): void;
}

/**
 * Pauses the playing video while the hover card, the dictionary window, the selection
 * card or a selection is open, and plays it again once the last one closed, only if
 * Lingo paused it and the user has not pressed play since. Lingo plays the video only
 * after it stops tracking its pause, so a `play` event while it tracks one is the
 * user's: they took over, and Lingo leaves playback alone (pausing again stays theirs).
 */
export function holdPlayback(o: {
  store: Store<VideoState>;
  adapter: Pick<PlatformAdapter, "video" | "adShowing" | "pause" | "play">;
  delayMs?: number;
}): PlaybackHold {
  const { store, adapter, delayMs = RESUME_DELAY_MS } = o;
  let held = inUse(store.get());
  /** The video Lingo paused, until it plays again. */
  let paused: HTMLVideoElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function forget() {
    clearTimeout(timer);
    timer = undefined;
    paused?.removeEventListener("play", forget);
    paused = null;
  }

  function hold() {
    clearTimeout(timer);
    timer = undefined;
    // Still paused by Lingo: held again before it played.
    if (paused) return;
    const { enabled, status } = store.get();
    const video = adapter.video();
    if (!enabled || status !== "ready" || !video || video.paused) return;
    if (adapter.adShowing()) return;
    paused = video;
    video.addEventListener("play", forget);
    adapter.pause().catch((error: unknown) => {
      warn(error);
      if (paused === video) forget();
    });
  }

  function release() {
    if (!paused) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const video = paused;
      forget();
      if (video && video === adapter.video() && video.paused)
        adapter.play().catch(warn);
    }, delayMs);
  }

  const unsubscribe = store.subscribe(() => {
    const now = inUse(store.get());
    if (now === held) return;
    held = now;
    if (now) hold();
    else release();
  });

  return {
    reset() {
      forget();
      held = inUse(store.get());
    },
    stop() {
      unsubscribe();
      forget();
    },
  };
}
