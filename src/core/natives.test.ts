import { describe, expect, it } from "vitest";
import { meaningLength } from "./explain/prompt";
import { translatedLine } from "./lexicon/short-lines";
import { DICTIONARY_PACKS, PACK_FORMATS } from "./packs/formats";
import { nativeLanguage, recipeNatives } from "./natives";
import { joinerFor } from "./subtitles/translation";

describe("the native-language registry", () => {
  it("gives each recipe native a pair pack with its format and a dictionary after Japanese", () => {
    expect(recipeNatives()).toEqual(["es", "pt"]);
    expect(PACK_FORMATS["en-es"]).toBe(1);
    expect(Object.keys(DICTIONARY_PACKS)).toEqual([
      "en-ja",
      "en-es",
      "en-pt",
      "es-en",
    ]);
    expect(DICTIONARY_PACKS["en-pt"]).toEqual(["en", "en-pt", "en-defs"]);
  });
  it("knows only native languages", () => {
    expect(nativeLanguage("pt")?.spaces).toBe(true);
    expect(nativeLanguage("xx")).toBeUndefined();
    expect(nativeLanguage("constructor")).toBeUndefined();
  });
  it("decides how lines are joined and capped by the language's script", () => {
    expect(joinerFor("ja-JP")).toBe("");
    expect(joinerFor("pt-BR")).toBe(" ");
    expect(joinerFor("xx")).toBe(" ");
    expect(meaningLength("ja")).toBe(25);
    expect(meaningLength("pt")).toBe(40);
    const long = "a".repeat(45);
    expect(translatedLine(long, "es")).toHaveLength(40);
  });
});
