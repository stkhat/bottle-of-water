import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS } from "../core/settings";
import { getSettings, setSettings, watchSettings } from "./settings-store";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("settings store", () => {
  it("gives the defaults when nothing is stored", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a patch through storage.sync under the key settings", async () => {
    const saved = await setSettings({
      knownLevel: 5000,
      highlight: { new: true },
    });
    expect(saved.knownLevel).toBe(5000);
    expect(saved.highlight).toEqual({
      new: true,
      learning: true,
      known: false,
    });
    expect(await getSettings()).toEqual(saved);

    const stored = await browser.storage.sync.get("settings");
    expect(stored.settings).toEqual(saved);
  });

  it("applies a later patch on top of the stored settings", async () => {
    await setSettings({ knownLevel: 5000 });
    const saved = await setSettings({ sites: { netflix: false } });
    expect(saved.knownLevel).toBe(5000);
    expect(saved.sites.netflix).toBe(false);
  });

  it("keeps both of two patches sent at the same time", async () => {
    await Promise.all([
      setSettings({ knownLevel: 5000 }),
      setSettings({ syncEnabled: false }),
    ]);
    const settings = await getSettings();
    expect(settings.knownLevel).toBe(5000);
    expect(settings.syncEnabled).toBe(false);
  });

  it("cleans up what it reads (clamps, drops unknown keys)", async () => {
    await browser.storage.sync.set({
      settings: { knownLevel: 50, bogus: true },
    });
    const settings = await getSettings();
    expect(settings.knownLevel).toBe(1000);
    expect(settings).not.toHaveProperty("bogus");
  });

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
