import { describe, expect, it } from "vitest";
import { instructions, meaningLength } from "./explain/prompt";
import { languageName, languageOption } from "../i18n/languages";
import { translatedLine } from "./lexicon/short-lines";
import { DICTIONARY_PACKS, PACK_FORMATS } from "./packs/formats";
import { nativeLanguage, recipeNatives } from "./natives";
import { joinerFor } from "./subtitles/translation";

describe("the native-language registry", () => {
  it("gives each recipe native a pair pack with its format and a dictionary after Japanese", () => {
    expect(recipeNatives()).toEqual([
      "es",
      "pt",
      "ru",
      "fr",
      "de",
      "zh",
      "it",
      "pl",
    ]);
    expect(PACK_FORMATS["en-es"]).toBe(3);
    expect(PACK_FORMATS["en-ru"]).toBe(3);
    expect(Object.keys(DICTIONARY_PACKS)).toEqual([
      "en-ja",
      "en-es",
      "en-pt",
      "en-ru",
      "en-fr",
      "en-de",
      "en-zh",
      "en-it",
      "en-pl",
      "es-en",
      "fr-en",
      "de-en",
    ]);
    expect(DICTIONARY_PACKS["en-pt"]).toEqual(["en", "en-pt", "en-defs"]);
    expect(DICTIONARY_PACKS["en-de"]).toEqual(["en", "en-de", "en-defs"]);
  });
  it("names each native language in menus and sentences, and asks the prompt in the languages Chrome answers in", () => {
    expect(languageOption("ru")).toBe("Russian (Русский)");
    expect(languageName("de")).toBe("German");
    expect(languageOption("fr")).toBe("French (Français)");
    // Chrome's Prompt API has no Russian: meaning in context stays unavailable.
    expect(nativeLanguage("ru")?.examples).toBeNull();
    expect(instructions({ learning: "en", native: "fr" })).toContain(
      "rive (d'une rivière)",
    );
    expect(instructions({ learning: "en", native: "de" })).toContain(
      "das Geheimnis verraten",
    );
  });
  it("knows only native languages", () => {
    expect(nativeLanguage("pt")?.spaces).toBe(true);
    expect(nativeLanguage("xx")).toBeUndefined();
    expect(nativeLanguage("constructor")).toBeUndefined();
  });
  it("decides how lines are joined and capped by the language's script", () => {
    expect(joinerFor("ja-JP")).toBe("");
    expect(joinerFor("pt-BR")).toBe(" ");
    expect(joinerFor("ru")).toBe(" ");
    expect(joinerFor("xx")).toBe(" ");
    expect(meaningLength("ja")).toBe(25);
    expect(meaningLength("pt")).toBe(40);
    // Cyrillic letters are as wide as Latin ones.
    expect(meaningLength("ru")).toBe(40);
    // A translated line takes the native cap: 50 Latin or Cyrillic characters.
    expect(translatedLine("д".repeat(55), "ru")).toHaveLength(50);
    const long = "a".repeat(55);
    expect(translatedLine(long, "es")).toHaveLength(50);
    // Chinese, like Japanese: no spaces between joined lines, a dense script.
    expect(joinerFor("zh-CN")).toBe("");
    expect(joinerFor("zh-Hant")).toBe("");
    expect(meaningLength("zh")).toBe(25);
    expect(translatedLine("面".repeat(30), "zh")).toBe(`${"面".repeat(24)}…`);
    expect(meaningLength("pl")).toBe(40);
  });
  it("names Chinese, Italian and Polish; Chrome's Prompt API answers in none of them", () => {
    expect(languageOption("zh")).toBe("Chinese, Simplified (简体中文)");
    expect(languageName("zh")).toBe("Chinese");
    expect(languageOption("it")).toBe("Italian (Italiano)");
    expect(languageOption("pl")).toBe("Polish (Polski)");
    for (const code of ["zh", "it", "pl"])
      expect(nativeLanguage(code)?.examples).toBeNull();
    // The prompt does not ask a Chinese answer to avoid Chinese.
    expect(instructions({ learning: "en", native: "zh" })).toContain(
      'Write "meaning" in Chinese only, never in English or any other language.',
    );
  });
});
