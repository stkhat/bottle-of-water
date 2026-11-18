import { beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS } from "../core/settings";
import {
  getSettings,
  setSettings,
  settingsStored,
  storeStartingPair,
} from "./settings-store";

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
});

describe("storeStartingPair", () => {
  const pair = async () => {
    const { learningLang, nativeLang } = await getSettings();
    return `${learningLang}>${nativeLang}`;
  };

  it("stores the pair the UI language suggests on a new install", async () => {
    expect(await settingsStored()).toBe(false);
    await storeStartingPair("install", "es-419");
    expect(await settingsStored()).toBe(true);
    expect(await pair()).toBe("en>es");
    const stored = await browser.storage.sync.get("settings");
    expect(stored.settings).toEqual({
      ...DEFAULT_SETTINGS,
      learningLang: "en",
      nativeLang: "es",
    });
  });

  it("stores the default pair after an update", async () => {
    await storeStartingPair("update", "en-US");
    expect(await settingsStored()).toBe(true);
    expect(await pair()).toBe("en>ja");
  });

  it("keeps the settings stored already, from this device or another", async () => {
    await setSettings({ knownLevel: 5000 });
    await storeStartingPair("install", "en-US");
    expect(await pair()).toBe("en>ja");
    expect((await getSettings()).knownLevel).toBe(5000);

    fakeBrowser.reset();
    await browser.storage.sync.set({
      settings: { learningLang: "en", nativeLang: "pt" },
    });
    await storeStartingPair("install", "ja");
    expect(await pair()).toBe("en>pt");
  });
});
