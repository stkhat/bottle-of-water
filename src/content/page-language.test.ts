import { describe, expect, it } from "vitest";
import { inOtherLanguage, matchesLearningLanguage } from "./page-language";

describe("matchesLearningLanguage", () => {
  it.each(["en", "en-US", "EN", "en_GB"])("matches %s against en", (lang) => {
    expect(matchesLearningLanguage(lang, "en")).toBe(true);
  });

  it("compares case-insensitively on the learning language too", () => {
    expect(matchesLearningLanguage("en-US", "EN")).toBe(true);
  });

  it.each(["ja", "ja-JP", "", null, undefined])("does not match %s", (lang) => {
    expect(matchesLearningLanguage(lang, "en")).toBe(false);
  });
});

describe("inOtherLanguage", () => {
  const result = (language: string, isReliable = true) => ({
    isReliable,
    languages: [{ language, percentage: 90 }],
  });

  it("is true when the detector reliably names another language", () => {
    expect(inOtherLanguage(result("ja"), "en")).toBe(true);
  });

  it("is false for the learning language, in any form", () => {
    expect(inOtherLanguage(result("en"), "en")).toBe(false);
    expect(inOtherLanguage(result("en-GB"), "en")).toBe(false);
  });

  it("is false when the detector is unsure or names nothing", () => {
    expect(inOtherLanguage(result("ja", false), "en")).toBe(false);
    expect(inOtherLanguage({ isReliable: true, languages: [] }, "en")).toBe(
      false,
    );
    expect(inOtherLanguage(result("und"), "en")).toBe(false);
  });
});
