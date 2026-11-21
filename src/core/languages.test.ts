import { describe, expect, it } from "vitest";
import {
  firstPair,
  learningLanguages,
  nativeLanguages,
  speechLang,
} from "./languages";

describe("learningLanguages", () => {
  it("lists English, then Spanish, French and German, in the packs' order", () => {
    expect(learningLanguages()).toEqual(["en", "es", "fr", "de"]);
  });
});

describe("nativeLanguages", () => {
  it("lists the languages each learning language has a dictionary into, from the lock", () => {
    expect(nativeLanguages("en")).toEqual([
      ...["ja", "es", "pt", "ru", "fr", "de"],
      ...["zh", "it", "pl", "th", "hi"],
    ]);
    expect(nativeLanguages("es")).toEqual(["en"]);
    expect(nativeLanguages("fr")).toEqual(["en"]);
    expect(nativeLanguages("de")).toEqual(["en", "fr"]);
  });

  it("has none for a language without a pack", () => {
    expect(nativeLanguages("nl")).toEqual([]);
    expect(nativeLanguages("toString")).toEqual([]);
  });
});

describe("speechLang", () => {
  it("picks a regional voice for each learning language", () => {
    expect(speechLang("en")).toBe("en-US");
    expect(speechLang("es")).toBe("es-ES");
    expect(speechLang("fr")).toBe("fr-FR");
    expect(speechLang("de")).toBe("de-DE");
  });

  it("keeps other codes as they are", () => {
    expect(speechLang("nl")).toBe("nl");
    expect(speechLang("constructor")).toBe("constructor");
  });
});

describe("firstPair", () => {
  const pair = (learningLang: string, nativeLang: string) => ({
    learningLang,
    nativeLang,
  });

  it("takes the UI language for the native language of an offered pair, learning English first", () => {
    expect(firstPair("ja")).toEqual(pair("en", "ja"));
    expect(firstPair("es-419")).toEqual(pair("en", "es"));
    expect(firstPair("pt-BR")).toEqual(pair("en", "pt"));
    expect(firstPair("pt_PT")).toEqual(pair("en", "pt"));
    // Chinese is offered in simplified characters, to every Chinese UI.
    expect(firstPair("zh-CN")).toEqual(pair("en", "zh"));
    expect(firstPair("zh-TW")).toEqual(pair("en", "zh"));
    expect(firstPair("pl")).toEqual(pair("en", "pl"));
    expect(firstPair("th-TH")).toEqual(pair("en", "th"));
    expect(firstPair("hi-IN")).toEqual(pair("en", "hi"));
    // English is the default learning language, before French → English.
    expect(firstPair("fr-FR")).toEqual(pair("en", "fr"));
    // …and before German → English.
    expect(firstPair("de-DE")).toEqual(pair("en", "de"));
  });

  it("gives an English UI another learning language that has English as its native one, the first in the packs' order", () => {
    expect(firstPair("en-US")).toEqual(pair("es", "en"));
    expect(firstPair("en-GB")).toEqual(pair("es", "en"));
  });

  it("gives the default pair to a UI language no offered pair has", () => {
    for (const ui of ["nl", "ko", "", "constructor"])
      expect(firstPair(ui)).toEqual(pair("en", "ja"));
  });

  it("is a rule over the offered pairs, not a list of languages", () => {
    const offered = { de: ["fr", "en"], en: ["fr"], it: ["en"] };
    // The default learning language (English) comes before the others, which keep
    // their order.
    expect(firstPair("fr-CA", offered)).toEqual(pair("en", "fr"));
    expect(firstPair("en", offered)).toEqual(pair("de", "en"));
    expect(firstPair("ja", offered)).toEqual(pair("en", "ja"));
    expect(firstPair("ja", { es: ["ja"] })).toEqual(pair("es", "ja"));
  });
});
