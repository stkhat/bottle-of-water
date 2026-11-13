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
      unsavedAtEnd: "keep",
      articleMainOnly: true,
      dictionaries: {
        cambridge: true,
        wiktionary: true,
        reverso: true,
        wordreference: true,
      },
      subtitlePosition: "inVideo",
      subtitleTranslation: true,
      subtitleSize: 100,
      subtitleOpacity: 80,
      transcriptTranslation: true,
      transcriptShown: true,
      sites: {
        youtube: true,
        youtubeComments: true,
        netflix: true,
        articles: true,
      },
      videoOn: { youtube: true, netflix: true },
      neverRunOn: [],
      disabledSites: [],
      syncEnabled: true,
      sentenceHistory: true,
      theme: "system",
    });
  });
});

describe("mergeSettings", () => {
  it("keeps the transcript closed once the user closed it, and open for anything but a boolean", () => {
    expect(mergeSettings({ transcriptShown: false }).transcriptShown).toBe(
      false,
    );
    expect(mergeSettings({ transcriptShown: "no" }).transcriptShown).toBe(true);
  });

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
      videoOn: { youtube: false },
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
      youtubeComments: true,
      netflix: false,
      articles: true,
    });
    expect(merged.videoOn).toEqual({ youtube: false, netflix: true });
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

  it("clamps the subtitle size to 50–200% in steps of 10", () => {
    expect(mergeSettings({ subtitleSize: 10 }).subtitleSize).toBe(50);
    expect(mergeSettings({ subtitleSize: 900 }).subtitleSize).toBe(200);
    expect(mergeSettings({ subtitleSize: 134 }).subtitleSize).toBe(130);
    expect(mergeSettings({ subtitleSize: "150" }).subtitleSize).toBe(100);
  });

  it("clamps the subtitle opacity to 0–100% in steps of 5", () => {
    expect(mergeSettings({ subtitleOpacity: -20 }).subtitleOpacity).toBe(0);
    expect(mergeSettings({ subtitleOpacity: 140 }).subtitleOpacity).toBe(100);
    expect(mergeSettings({ subtitleOpacity: 42 }).subtitleOpacity).toBe(40);
    expect(mergeSettings({ subtitleOpacity: Number.NaN }).subtitleOpacity).toBe(
      80,
    );
  });

  it("drops unknown keys", () => {
    const merged = mergeSettings({
      bogus: 1,
      highlight: { bogus: true },
    } as unknown);
    expect(merged).not.toHaveProperty("bogus");
    expect(merged.highlight).not.toHaveProperty("bogus");
  });

  it("keeps a boolean articleMainOnly and drops other values", () => {
    expect(mergeSettings({ articleMainOnly: false }).articleMainOnly).toBe(
      false,
    );
    expect(mergeSettings({ articleMainOnly: "no" }).articleMainOnly).toBe(true);
  });

  it("keeps a valid unsavedAtEnd and drops the old end-card switch", () => {
    const merged = mergeSettings({
      unsavedAtEnd: "known",
      offerSaveAllAtEnd: false,
    } as unknown);
    expect(merged.unsavedAtEnd).toBe("known");
    expect(merged).not.toHaveProperty("offerSaveAllAtEnd");
  });

  it("keeps a valid theme", () => {
    expect(mergeSettings({ theme: "dark" }).theme).toBe("dark");
    expect(mergeSettings({ theme: "light" }).theme).toBe("light");
  });

  it("replaces values of the wrong type with the base value", () => {
    const merged = mergeSettings({
      knownLevel: "5000",
      unsavedAtEnd: "forget",
      subtitlePosition: "aboveVideo",
      theme: "sepia",
      learningLang: "",
      highlight: { learning: 0 },
      neverRunOn: ["ok.com", 3],
      disabledSites: "x.com",
    } as unknown);
    expect(merged.knownLevel).toBe(3000);
    expect(merged.unsavedAtEnd).toBe("keep");
    expect(merged.subtitlePosition).toBe("inVideo");
    expect(merged.theme).toBe("system");
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
