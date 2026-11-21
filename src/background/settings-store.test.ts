import { beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS } from "../core/settings";
import {
  getSettings,
  getTimedSettings,
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
describe("field times", () => {
  const at = (time: number) => () => time;
  const storedTimes = async () =>
    (await browser.storage.sync.get("settingsTimes")).settingsTimes;

  it("stores the time of each field a change sets, beside the plain settings", async () => {
    const saved = await setSettings(
      { knownLevel: 5000, sites: { netflix: false } },
      at(10),
    );
    expect(await storedTimes()).toEqual({
      values: saved,
      times: { knownLevel: 10, "sites.netflix": 10 },
    });
    // Older versions read the settings item as before.
    expect((await browser.storage.sync.get("settings")).settings).toEqual(
      saved,
    );
    expect(await getTimedSettings()).toEqual({
      values: saved,
      times: { knownLevel: 10, "sites.netflix": 10 },
    });
  });

  it("keeps the other fields' times, and times a change after the previous one", async () => {
    await setSettings({ knownLevel: 5000 }, at(10));
    await setSettings({ syncEnabled: false }, at(20));
    // The clock is behind: the change still comes after the one it replaces.
    await setSettings({ knownLevel: 8000 }, at(5));
    // A patch that changes nothing changes no time.
    await setSettings({ syncEnabled: false }, at(30));
    expect((await getTimedSettings()).times).toEqual({
      knownLevel: 11,
      syncEnabled: 20,
    });
  });

  it("times the changed fields of settings stored before field times, once", async () => {
    await browser.storage.sync.set({ settings: { knownLevel: 5000 } });
    expect((await getTimedSettings(at(50))).times).toEqual({ knownLevel: 50 });
    expect((await getTimedSettings(at(60))).times).toEqual({ knownLevel: 50 });
  });

  it("times a field another device changed without field times when it is read", async () => {
    const saved = await setSettings({ knownLevel: 5000 }, at(10));
    // An older version on another device, through browser sync.
    await browser.storage.sync.set({
      settings: { ...saved, syncEnabled: false },
    });
    expect(await getTimedSettings(at(30))).toEqual({
      values: { ...saved, syncEnabled: false },
      times: { knownLevel: 10, syncEnabled: 30 },
    });
  });

  it("reads damaged times as none", async () => {
    await browser.storage.sync.set({
      settings: { knownLevel: 5000 },
      settingsTimes: { values: 3, times: { knownLevel: "x", syncEnabled: -1 } },
    });
    expect((await getTimedSettings(at(40))).times).toEqual({ knownLevel: 40 });
  });

  it("gives the starting pair time 0, so any device's choice wins over it", async () => {
    await storeStartingPair("install", "es-419");
    expect(await storedTimes()).toEqual({
      values: { ...DEFAULT_SETTINGS, learningLang: "en", nativeLang: "es" },
      times: {},
    });
  });
});
