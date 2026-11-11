import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { setSettings } from "../background/settings-store";
import { PACK_STATE_KEY, type PackStates } from "../core/packs/state";
import { watchPackState, watchSettings } from "./storage";

beforeEach(() => {
  fakeBrowser.reset();
});

const DOWNLOADING: PackStates = {
  es: { state: "downloading", received: 10, total: 30 },
};
const READY: PackStates = {
  es: { state: "ready", received: 30, total: 30 },
};

describe("watchPackState", () => {
  it("gives the stored states, then each change, until unsubscribed", async () => {
    await browser.storage.local.set({ [PACK_STATE_KEY]: DOWNLOADING });
    const seen = vi.fn();
    const unwatch = watchPackState(seen);
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(seen).toHaveBeenLastCalledWith(DOWNLOADING);

    await browser.storage.local.set({ [PACK_STATE_KEY]: READY });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(2));
    expect(seen).toHaveBeenLastCalledWith(READY);

    unwatch();
    await browser.storage.local.set({ [PACK_STATE_KEY]: DOWNLOADING });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("gives no states when none are stored, or what is stored is not states", async () => {
    const seen = vi.fn();
    watchPackState(seen);
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith({}));

    await browser.storage.local.set({ [PACK_STATE_KEY]: "broken" });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(2));
    expect(seen).toHaveBeenLastCalledWith({});
  });

  it("ignores other keys and other storage areas", async () => {
    const seen = vi.fn();
    watchPackState(seen);
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    await browser.storage.local.set({ other: 1 });
    await browser.storage.sync.set({ [PACK_STATE_KEY]: READY });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("gives nothing after an unsubscribe before the stored states arrive", async () => {
    await browser.storage.local.set({ [PACK_STATE_KEY]: READY });
    const seen = vi.fn();
    watchPackState(seen)();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("watchSettings", () => {
  it("notifies watchers of changes until they unsubscribe", async () => {
    const seen = vi.fn();
    const unwatch = watchSettings(seen);

    await setSettings({ knownLevel: 7000 });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(seen.mock.calls[0]![0].knownLevel).toBe(7000);

    unwatch();
    await setSettings({ knownLevel: 8000 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("gives the settings before the change too", async () => {
    await setSettings({ neverRunOn: ["a.com"] });
    const seen = vi.fn();
    watchSettings(seen);
    await setSettings({ neverRunOn: ["a.com", "b.com"] });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    const [next, previous] = seen.mock.calls[0]!;
    expect(next.neverRunOn).toEqual(["a.com", "b.com"]);
    expect(previous.neverRunOn).toEqual(["a.com"]);
  });

  it("ignores changes to other keys and other storage areas", async () => {
    const seen = vi.fn();
    watchSettings(seen);
    await browser.storage.sync.set({ other: 1 });
    await browser.storage.local.set({ settings: { knownLevel: 9000 } });
    expect(seen).not.toHaveBeenCalled();
  });

  it("stops watching quietly in a content script whose extension was reloaded", () => {
    const unwatch = watchSettings(vi.fn());
    // Chrome takes `storage` away from a content script cut off by a reload.
    const storage = Object.getOwnPropertyDescriptor(fakeBrowser, "storage")!;
    Object.defineProperty(fakeBrowser, "storage", {
      value: undefined,
      configurable: true,
    });
    try {
      expect(() => unwatch()).not.toThrow();
    } finally {
      Object.defineProperty(fakeBrowser, "storage", storage);
    }
  });
});
