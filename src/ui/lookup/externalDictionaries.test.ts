import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { dictionaryLinks } from "./externalDictionaries";

const enJa = { from: "en", to: "ja" };
const all = DEFAULT_SETTINGS.dictionaries;

describe("dictionaryLinks", () => {
  it("links a phrase to the four dictionaries in order", () => {
    expect(dictionaryLinks("figure out", all, enJa)).toEqual([
      {
        id: "cambridge",
        label: "Cambridge",
        href: "https://dictionary.cambridge.org/dictionary/english/figure-out",
      },
      {
        id: "wiktionary",
        label: "Wiktionary",
        href: "https://en.wiktionary.org/wiki/figure%20out",
      },
      {
        id: "reverso",
        label: "Reverso",
        href: "https://context.reverso.net/translation/english-japanese/figure%20out",
      },
      {
        id: "wordreference",
        label: "WordReference",
        href: "https://www.wordreference.com/enja/figure%20out",
      },
    ]);
  });

  it("keeps only the enabled dictionaries", () => {
    const links = dictionaryLinks(
      "dough",
      {
        cambridge: false,
        wiktionary: true,
        reverso: false,
        wordreference: true,
      },
      enJa,
    );
    expect(links.map((l) => l.id)).toEqual(["wiktionary", "wordreference"]);
  });

  it("returns nothing when every dictionary is off", () => {
    const none = {
      cambridge: false,
      wiktionary: false,
      reverso: false,
      wordreference: false,
    };
    expect(dictionaryLinks("dough", none, enJa)).toEqual([]);
  });

  it("encodes characters that are not safe in a URL path", () => {
    const [cambridge, wiktionary] = dictionaryLinks("rock & roll?", all, enJa);
    expect(cambridge!.href).toBe(
      "https://dictionary.cambridge.org/dictionary/english/rock-%26-roll%3F",
    );
    expect(wiktionary!.href).toBe(
      "https://en.wiktionary.org/wiki/rock%20%26%20roll%3F",
    );
  });

  it("leaves out dictionaries that do not cover the language pair", () => {
    const links = dictionaryLinks("Brot", all, { from: "de", to: "ja" });
    expect(links.map((l) => l.id)).toEqual(["wiktionary"]);
  });

  it("links Spanish to English, with Wiktionary's Spanish section", () => {
    expect(
      dictionaryLinks("a escondidas", all, { from: "es", to: "en" }),
    ).toEqual([
      {
        id: "cambridge",
        label: "Cambridge",
        href: "https://dictionary.cambridge.org/dictionary/spanish-english/a-escondidas",
      },
      {
        id: "wiktionary",
        label: "Wiktionary",
        href: "https://en.wiktionary.org/wiki/a%20escondidas#Spanish",
      },
      {
        id: "reverso",
        label: "Reverso",
        href: "https://context.reverso.net/translation/spanish-english/a%20escondidas",
      },
      {
        id: "wordreference",
        label: "WordReference",
        href: "https://www.wordreference.com/esen/a%20escondidas",
      },
    ]);
  });

  it("encodes accented Spanish words", () => {
    const [cambridge] = dictionaryLinks("canción", all, {
      from: "es",
      to: "en",
    });
    expect(cambridge!.href).toBe(
      "https://dictionary.cambridge.org/dictionary/spanish-english/canci%C3%B3n",
    );
  });

  it("has no Cambridge dictionary from Spanish into other languages", () => {
    const links = dictionaryLinks("casa", all, { from: "es", to: "ja" });
    expect(links.map((l) => l.id)).toEqual(["wiktionary", "reverso"]);
  });
});
