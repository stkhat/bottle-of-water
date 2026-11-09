import { describe, expect, it } from "vitest";
import { matchesLearningLanguage } from "./page-language";

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
