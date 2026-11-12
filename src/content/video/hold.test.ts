import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "../store";
import { holdPlayback, RESUME_DELAY_MS } from "./hold";
import type { VideoState } from "./state";

/** The parts of a video element the hold reads: `paused` and the `play` event. */
class FakeVideo extends EventTarget {
  paused = false;
  /** The user (or the site) plays or pauses it. */
  set(playing: boolean) {
    this.paused = !playing;
    this.dispatchEvent(new Event(playing ? "play" : "pause"));
  }
}

const SHOWN = {} as NonNullable<VideoState["hover"]>;
const OPEN = {} as NonNullable<VideoState["panel"]>;

function setup(options: { playing?: boolean } = {}) {
  const store = createStore({
    status: "ready",
    enabled: true,
    hover: null,
    panel: null,
    phrase: null,
    selecting: false,
  } as unknown as VideoState);
  let video = new FakeVideo();
  video.paused = options.playing === false;
  let ad = false;
  const calls: ("pause" | "play")[] = [];
  const hold = holdPlayback({
    store,
    adapter: {
      video: () => video as unknown as HTMLVideoElement,
      adShowing: () => ad,
      async pause() {
        calls.push("pause");
        video.set(false);
      },
      async play() {
        calls.push("play");
        video.set(true);
      },
    },
  });
  return {
    store,
    hold,
    calls,
    video: () => video,
    newVideo() {
      video = new FakeVideo();
    },
    setAd(showing: boolean) {
      ad = showing;
    },
  };
}

/** Lets the adapter's promises settle and the resume delay pass. */
async function later(ms = RESUME_DELAY_MS) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("holdPlayback", () => {
  it("pauses a playing video while a card shows and plays it again after the last one closed", async () => {
    const t = setup();
    t.store.set({ hover: SHOWN });
    expect(t.calls).toEqual(["pause"]);
    // From the hover card to the window, and a selection: still held.
    t.store.set({ panel: OPEN });
    t.store.set({ hover: null });
    t.store.set({ selecting: true });
    t.store.set({ panel: null });
    await later();
    expect(t.calls).toEqual(["pause"]);
    t.store.set({ selecting: false });
    await later(RESUME_DELAY_MS - 1);
    expect(t.calls).toEqual(["pause"]);
    await later(1);
    expect(t.calls).toEqual(["pause", "play"]);
    expect(t.video().paused).toBe(false);
  });

  it("does not play and pause again when a card shows within the delay", async () => {
    const t = setup();
    t.store.set({ hover: SHOWN });
    t.store.set({ hover: null });
    await later(RESUME_DELAY_MS / 2);
    t.store.set({ hover: SHOWN });
    await later();
    expect(t.calls).toEqual(["pause"]);
    t.store.set({ hover: null });
    await later();
    expect(t.calls).toEqual(["pause", "play"]);
  });

  it("leaves a paused video paused", async () => {
    const t = setup({ playing: false });
    t.store.set({ panel: OPEN });
    t.store.set({ panel: null });
    await later();
    expect(t.calls).toEqual([]);
  });

  it("does not play the video again after the user played it while held", async () => {
    const t = setup();
    t.store.set({ panel: OPEN });
    t.video().set(true);
    // Pausing again stays the user's.
    t.video().set(false);
    t.store.set({ panel: null });
    await later();
    expect(t.calls).toEqual(["pause"]);
    expect(t.video().paused).toBe(true);
  });

  it("does not play the video the user played within the delay", async () => {
    const t = setup();
    t.store.set({ hover: SHOWN });
    t.store.set({ hover: null });
    t.video().set(true);
    t.video().set(false);
    await later();
    expect(t.calls).toEqual(["pause"]);
  });

  it("forgets its pause on reset (another video) and on stop", async () => {
    const t = setup();
    t.store.set({ panel: OPEN });
    t.store.set({ panel: null });
    t.hold.reset();
    await later();
    expect(t.calls).toEqual(["pause"]);

    t.video().set(true);
    t.store.set({ panel: OPEN });
    t.store.set({ panel: null });
    t.hold.stop();
    await later();
    expect(t.calls).toEqual(["pause", "pause"]);
    // Stopped: no longer follows the cards.
    t.video().set(true);
    t.store.set({ panel: OPEN });
    expect(t.calls).toEqual(["pause", "pause"]);
  });

  it("does not play another video element than the one it paused", async () => {
    const t = setup();
    t.store.set({ panel: OPEN });
    t.newVideo();
    t.video().paused = true;
    t.store.set({ panel: null });
    await later();
    expect(t.calls).toEqual(["pause"]);
  });

  it("does not pause during an ad, while Lingo is off, or before the subtitles are ready", async () => {
    const t = setup();
    t.setAd(true);
    t.store.set({ panel: OPEN });
    t.store.set({ panel: null });
    t.setAd(false);
    t.store.set({ enabled: false, hover: SHOWN });
    t.store.set({ hover: null, enabled: true, status: "loading" });
    t.store.set({ selecting: true });
    t.store.set({ selecting: false });
    await later();
    expect(t.calls).toEqual([]);
    expect(t.video().paused).toBe(false);
  });

  it("forgets a pause that failed", async () => {
    const t = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = holdPlayback({
      store: t.store,
      adapter: {
        video: () => t.video() as unknown as HTMLVideoElement,
        adShowing: () => false,
        pause: () => Promise.reject(new Error("No player")),
        play: async () => {
          t.calls.push("play");
        },
      },
    });
    t.hold.stop();
    t.store.set({ panel: OPEN });
    await later(0);
    // The site paused it meanwhile: still not Lingo's to play.
    t.video().paused = true;
    t.store.set({ panel: null });
    await later();
    expect(t.calls).toEqual([]);
    expect(warn).toHaveBeenCalled();
    failing.stop();
    warn.mockRestore();
  });
});
