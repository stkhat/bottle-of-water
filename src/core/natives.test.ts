import { describe, expect, it } from "vitest";
import { instructions, meaningLength } from "./explain/prompt";
import { languageName, languageOption } from "../i18n/languages";
import { translatedLine } from "./lexicon/short-lines";
import { DICTIONARY_PACKS, PACK_FORMATS } from "./packs/formats";
import {
  arabicSpelling,
  arabicWritten,
  bidiIsolated,
  nativeLanguage,
  recipeNatives,
  writtenRightToLeft,
} from "./natives";
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
      "th",
      "hi",
      "ar",
      "id",
      "tr",
    ]);
    expect(PACK_FORMATS["en-es"]).toBe(4);
    expect(PACK_FORMATS["en-ru"]).toBe(4);
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
      "en-th",
      "en-hi",
      "en-ar",
      "en-id",
      "en-tr",
      "es-en",
      "fr-en",
      "de-en",
      "de-fr",
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
    // Thai: no spaces between joined lines, letters as wide as Latin ones.
    expect(languageOption("th")).toBe("Thai (ภาษาไทย)");
    expect(languageName("th")).toBe("Thai");
    expect(joinerFor("th-TH")).toBe("");
    expect(meaningLength("th")).toBe(40);
    expect(instructions({ learning: "en", native: "th" })).toContain(
      "เปิดเผยความลับ",
    );
    // Hindi: spaces between joined lines, Devanagari as wide as Latin letters.
    expect(languageOption("hi")).toBe("Hindi (हिन्दी)");
    expect(languageName("hi")).toBe("Hindi");
    expect(joinerFor("hi-IN")).toBe(" ");
    expect(meaningLength("hi")).toBe(40);
    expect(instructions({ learning: "en", native: "hi" })).toContain(
      "राज़ खोल देना",
    );
    // Arabic: spaces between joined lines, letters as wide as Latin ones, right to left.
    expect(languageOption("ar")).toBe("Arabic (العربية)");
    expect(languageName("ar")).toBe("Arabic");
    expect(joinerFor("ar-EG")).toBe(" ");
    expect(meaningLength("ar")).toBe(40);
    expect(instructions({ learning: "en", native: "ar" })).toContain(
      "أفشى السر",
    );
    expect(writtenRightToLeft("ar")).toBe(true);
    expect(writtenRightToLeft("ar-SA")).toBe(true);
    // Indonesian: Latin letters with spaces between words.
    expect(languageOption("id")).toBe("Indonesian (Bahasa Indonesia)");
    expect(languageName("id")).toBe("Indonesian");
    expect(joinerFor("id-ID")).toBe(" ");
    expect(meaningLength("id")).toBe(40);
    expect(instructions({ learning: "en", native: "id" })).toContain(
      "membocorkan rahasia",
    );
    expect(writtenRightToLeft("id")).toBe(false);
    // Turkish: Latin letters with spaces between words.
    expect(languageOption("tr")).toBe("Turkish (Türkçe)");
    expect(languageName("tr")).toBe("Turkish");
    expect(joinerFor("tr-TR")).toBe(" ");
    expect(meaningLength("tr")).toBe(40);
    expect(instructions({ learning: "en", native: "tr" })).toContain(
      "ağzından kaçırmak",
    );
    expect(writtenRightToLeft("tr")).toBe(false);
    expect(writtenRightToLeft("hi")).toBe(false);
    expect(writtenRightToLeft("en")).toBe(false);
    // The prompt does not ask a Chinese answer to avoid Chinese.
    expect(instructions({ learning: "en", native: "zh" })).toContain(
      'Write "meaning" in Chinese only, never in English or any other language.',
    );
  });
});

describe("Arabic text", () => {
  it("is written without harakat and tatweel, its hamza and madda letters kept", () => {
    expect(arabicWritten("كَلْب")).toBe("كلب");
    expect(arabicWritten("اِنْتِقَاد")).toBe("انتقاد");
    expect(arabicWritten("قَاسٍ")).toBe("قاس");
    expect(arabicWritten("هٰذا")).toBe("هذا");
    expect(arabicWritten("جـمـيل")).toBe("جميل");
    expect(arabicWritten("أَسْقَى، آخِر، إِلَى")).toBe("أسقى، آخر، إلى");
    // Decomposed hamza and madda compose first, so they stay.
    expect(arabicWritten("ا\u0653خر")).toBe("آخر");
  });

  it("spells an alef with a hamza or a madda as a bare one, for dedupe and ranking", () => {
    expect(arabicSpelling("أَسْقَى")).toBe("اسقى");
    expect(arabicSpelling("إلى")).toBe(arabicSpelling("الى"));
    expect(arabicSpelling("آخِر")).toBe("اخر");
    expect(arabicSpelling("ٱلْكِتَاب")).toBe("الكتاب");
  });

  it("is isolated right to left inside a line of English", () => {
    expect(bidiIsolated("رقم، شكل…", "ar")).toBe("\u2067رقم، شكل…\u2069");
    expect(bidiIsolated("数字", "ja")).toBe("数字");
  });
});
