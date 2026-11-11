import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { PACK_STATE_KEY, type PackStates } from "../core/packs/state";
import { watchPackState } from "./pack-state";

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
