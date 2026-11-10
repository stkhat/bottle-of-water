import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, hostBlocked, mergeSettings } from "./settings";

describe("DEFAULT_SETTINGS", () => {
  it("match the spec and the mock", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      learningLang: "en",
      nativeLang: "ja",
      uiLocale: "en",
      knownLevel: 3000,
      highlight: { new: false, learning: true, known: false },
      offerSaveAllAtEnd: true,
      dictionaries: {
        cambridge: true,
        wiktionary: true,
        reverso: true,
        wordreference: true,
      },
      subtitlePosition: "inVideo",
      subtitleTranslation: true,
      transcriptTranslation: true,
      sites: { youtube: true, netflix: true, articles: true },
      neverRunOn: [],
      disabledSites: [],
      syncEnabled: true,
      sentenceHistory: true,
    });
  });
});

describe("mergeSettings", () => {
  it("fills missing keys from the defaults", () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps given values, merging nested groups key by key", () => {
    const merged = mergeSettings({
      knownLevel: 5000,
      highlight: { new: true },
      sites: { netflix: false },
      subtitlePosition: "belowVideo",
      neverRunOn: ["example.com"],
    });
    expect(merged.knownLevel).toBe(5000);
    expect(merged.highlight).toEqual({
      new: true,
      learning: true,
      known: false,
    });
    expect(merged.sites).toEqual({
      youtube: true,
      netflix: false,
      articles: true,
    });
    expect(merged.subtitlePosition).toBe("belowVideo");
    expect(merged.neverRunOn).toEqual(["example.com"]);
  });

  it("merges onto a given base instead of the defaults", () => {
    const base = mergeSettings({ knownLevel: 8000, highlight: { new: true } });
    const merged = mergeSettings({ highlight: { known: true } }, base);
    expect(merged.knownLevel).toBe(8000);
    expect(merged.highlight).toEqual({
      new: true,
      learning: true,
      known: true,
    });
  });

  it("clamps knownLevel to 1,000–20,000 in steps of 500", () => {
    expect(mergeSettings({ knownLevel: 0 }).knownLevel).toBe(1000);
    expect(mergeSettings({ knownLevel: 999_999 }).knownLevel).toBe(20000);
    expect(mergeSettings({ knownLevel: 3240 }).knownLevel).toBe(3000);
    expect(mergeSettings({ knownLevel: 3260 }).knownLevel).toBe(3500);
    expect(mergeSettings({ knownLevel: Number.NaN }).knownLevel).toBe(3000);
  });

  it("drops unknown keys", () => {
    const merged = mergeSettings({
      bogus: 1,
      highlight: { bogus: true },
    } as unknown);
    expect(merged).not.toHaveProperty("bogus");
    expect(merged.highlight).not.toHaveProperty("bogus");
  });

  it("replaces values of the wrong type with the base value", () => {
    const merged = mergeSettings({
      knownLevel: "5000",
      offerSaveAllAtEnd: "no",
      subtitlePosition: "aboveVideo",
      learningLang: "",
      highlight: { learning: 0 },
      neverRunOn: ["ok.com", 3],
      disabledSites: "x.com",
    } as unknown);
    expect(merged.knownLevel).toBe(3000);
    expect(merged.offerSaveAllAtEnd).toBe(true);
    expect(merged.subtitlePosition).toBe("inVideo");
    expect(merged.learningLang).toBe("en");
    expect(merged.highlight.learning).toBe(true);
    expect(merged.neverRunOn).toEqual(["ok.com"]);
    expect(merged.disabledSites).toEqual([]);
  });

  it("does not share arrays or groups with the defaults", () => {
    const merged = mergeSettings({});
    merged.neverRunOn.push("a.com");
    merged.highlight.new = true;
    expect(DEFAULT_SETTINGS.neverRunOn).toEqual([]);
    expect(DEFAULT_SETTINGS.highlight.new).toBe(false);
  });
});

describe("hostBlocked", () => {
  it("blocks hosts in neverRunOn or disabledSites and their subdomains", () => {
    const settings = mergeSettings({
      neverRunOn: ["example.com"],
      disabledSites: ["Example.org"],
    });
    expect(hostBlocked("example.com", settings)).toBe(true);
    expect(hostBlocked("news.EXAMPLE.com", settings)).toBe(true);
    expect(hostBlocked("www.example.org", settings)).toBe(true);
    expect(hostBlocked("notexample.com", settings)).toBe(false);
    expect(hostBlocked("example.net", settings)).toBe(false);
  });
});
