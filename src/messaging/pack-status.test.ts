import { describe, expect, it, vi } from "vitest";
import type { PackStates } from "../core/packs/state";
import { DEFAULT_SETTINGS, mergeSettings } from "../core/settings";
import { settingsListeners } from "../testing/stubs";
import type { send } from "./client";
import { followPackStatus, pairNote } from "./pack-status";
import type { PackStatus, Request } from "./protocol";

const STATUS: PackStatus = {
  pair: {
    packs: [
      { pack: "es", size: 30, state: "ready", received: 30, total: 30 },
      {
        pack: "es-en",
        size: 70,
        state: "downloading",
        received: 7,
        total: 70,
      },
    ],
  },
  others: [],
};

/** A background answering `packStatus` with `answers` in turn, and a `packState` to change. */
function fake(answers: PackStatus[]) {
  const asked: Request[] = [];
  const resolvers: ((status: PackStatus) => void)[] = [];
  let listener: ((states: PackStates) => void) | undefined;
  const settings = settingsListeners(DEFAULT_SETTINGS);
  const deps = {
    send: ((request: Request) => {
      asked.push(request);
      const answer = answers.shift();
      return answer
        ? Promise.resolve(answer)
        : new Promise<PackStatus>((resolve) => resolvers.push(resolve));
    }) as typeof send,
    watchPackState(next: (states: PackStates) => void) {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    watchSettings: settings.watch,
  };
  return {
    deps,
    asked,
    /** Settings changed elsewhere. */
    changeSettings: (patch: Parameters<typeof mergeSettings>[0]) =>
      settings.emit(mergeSettings(patch, DEFAULT_SETTINGS)),
    /** Answers the oldest request still waiting. */
    answer: (status: PackStatus) => resolvers.shift()!(status),
    change: (states: PackStates) => listener?.(states),
    watching: () => listener !== undefined,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("followPackStatus", () => {
  it("gives the background's status, then applies each change of the pack states", async () => {
    const f = fake([STATUS]);
    const seen = vi.fn();
    followPackStatus(f.deps, seen);
    await flush();
    expect(f.asked).toEqual([{ type: "packStatus" }]);
    expect(seen).toHaveBeenLastCalledWith(STATUS);

    f.change({
      "es-en": { state: "downloading", received: 35, total: 70 },
      other: { state: "failed", received: 0, total: 5, error: "x" },
    });
    expect(seen).toHaveBeenLastCalledWith({
      ...STATUS,
      pair: {
        packs: [
          STATUS.pair.packs[0],
          {
            pack: "es-en",
            size: 70,
            state: "downloading",
            received: 35,
            total: 70,
          },
        ],
      },
    });
  });

  it("asks again on refresh and drops an answer that comes after a newer one", async () => {
    const f = fake([]);
    const seen = vi.fn();
    const follower = followPackStatus(f.deps, seen);
    follower.refresh();
    const newer = { ...STATUS, others: [{ pack: "en-ja", size: 9 }] };
    f.answer(STATUS);
    f.answer(newer);
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenLastCalledWith(newer);
  });

  it("asks again when another language pair is chosen, not on other changes", async () => {
    const f = fake([STATUS, STATUS]);
    followPackStatus(f.deps, vi.fn());
    f.changeSettings({ theme: "dark" });
    expect(f.asked).toHaveLength(1);
    f.changeSettings({ theme: "dark", learningLang: "es", nativeLang: "en" });
    expect(f.asked).toHaveLength(2);
  });

  it("keeps a pack marked as a fallback through the changes of its state", async () => {
    const english: PackStatus = {
      pair: {
        packs: [
          { pack: "en", size: 10, state: "ready", received: 10, total: 10 },
          {
            pack: "en-defs",
            size: 30,
            state: "downloading",
            received: 0,
            total: 30,
            fallback: true,
          },
        ],
      },
      others: [],
    };
    const f = fake([english]);
    const seen = vi.fn();
    followPackStatus(f.deps, seen);
    await flush();
    f.change({ "en-defs": { state: "downloading", received: 9, total: 30 } });
    expect(seen.mock.lastCall?.[0].pair.packs[1]).toEqual({
      pack: "en-defs",
      size: 30,
      fallback: true,
      state: "downloading",
      received: 9,
      total: 30,
    });
  });

  it("stops: no more status, no more watching", async () => {
    const f = fake([]);
    const seen = vi.fn();
    const follower = followPackStatus(f.deps, seen);
    follower.stop();
    f.answer(STATUS);
    await flush();
    expect(seen).not.toHaveBeenCalled();
    expect(f.watching()).toBe(false);
  });
});

describe("pairNote", () => {
  it("is the note on the chosen pair's packs", () => {
    expect(pairNote(STATUS)).toEqual({ state: "downloading", percent: 37 });
    expect(
      pairNote({
        ...STATUS,
        pair: { packs: [] },
      }),
    ).toBeNull();
    expect(pairNote(undefined)).toBeNull();
  });

  it("goes once the packs before the fallbacks can be used", () => {
    const pair = (
      defs: PackStatus["pair"]["packs"][number]["state"],
    ): PackStatus => ({
      pair: {
        packs: [
          { pack: "en", size: 10, state: "ready", received: 10, total: 10 },
          { pack: "en-ja", size: 10, state: "ready", received: 10, total: 10 },
          {
            pack: "en-defs",
            size: 30,
            state: defs,
            received: 3,
            total: 30,
            fallback: true,
          },
        ],
      },
      others: [],
    });
    expect(pairNote(pair("downloading"))).toBeNull();
    expect(pairNote(pair("failed"))).toEqual({ state: "failed" });
  });
});
