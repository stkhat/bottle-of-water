import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  joinCapitals,
  learningKeyOf,
  readReversedTables,
  tableWord,
  type LearningWords,
} from "./learning-pairs.ts";
import { termKeyOf, withOpeningLabel } from "./recipe.ts";
import { learningSlimEntry } from "./learning-slim.ts";
import type { KaikkiEntry } from "../common.ts";

const words: LearningWords = {
  lang: "de",
  termKey: termKeyOf({
    vocab: new Set(["hund", "gehen", "befinden", "essen", "sie"]),
    lemmas: {},
    phrases: new Set(),
  }),
  vocab: new Set(["hund", "gehen", "befinden", "essen", "sie"]),
  lemmas: {},
  pos: {},
  articles: new Set(["der", "die", "das"]),
  english: {
    essen: [
      ["verb", "to eat"],
      ["noun", "meal", "capital"],
    ],
    sie: [
      ["pronoun", "she"],
      ["pronoun", "you (polite)", "capital"],
    ],
  },
};

describe("tableWord", () => {
  it("drops notes in brackets and words with a bracket left open", () => {
    expect(tableWord("plier ( tente )")).toBe("plier");
    expect(tableWord("(ganz) sicher")).toBe("sicher");
    expect(tableWord("démonter ( camp")).toBeUndefined();
    expect(tableWord("Drang)")).toBeUndefined();
    expect(tableWord("se réjouir")).toBe("se réjouir");
  });
  it("writes the words of a row between commas as a list, without the items a note empties", () => {
    expect(
      tableWord("relayer (quelqu'un), prendre la relève (de quelqu'un)"),
    ).toBe("relayer, prendre la relève");
    expect(tableWord("écraser , s’ abattre")).toBe("écraser, s’ abattre");
    expect(tableWord("casse-pattes , ( casse-patte ), tord-boyaux")).toBe(
      "casse-pattes, tord-boyaux",
    );
    expect(tableWord("cliqueter , ( cliquer ),")).toBe("cliqueter");
    expect(tableWord("1,5 Liter")).toBe("1,5 Liter");
  });
});

describe("learningKeyOf", () => {
  it("files a word, a capitalised noun, a noun with its article and a pronominal verb", () => {
    expect(learningKeyOf("gehen", words)).toEqual({
      key: "gehen",
      capital: false,
      reflexive: false,
    });
    expect(learningKeyOf("Hund", words)).toEqual({
      key: "hund",
      capital: true,
      reflexive: false,
    });
    expect(learningKeyOf("der Hund", words)?.key).toBe("hund");
    expect(learningKeyOf("sich befinden", words)).toEqual({
      key: "befinden",
      capital: false,
      reflexive: true,
    });
    expect(learningKeyOf("Zug", words)).toBeUndefined();
  });
});

describe("joinCapitals", () => {
  it("joins a capitalised headword's senses to its key, marked as the English pair marks them", () => {
    const { terms, capitals } = joinCapitals(
      {
        terms: new Map([
          ["essen", { short: "manger", senses: [["verb", "manger"]] }],
        ]),
        capital: new Map([
          ["essen", { short: "repas", senses: [["noun", "repas"]] }],
          ["hund", { short: "chien", senses: [["noun", "chien"]] }],
        ]),
      },
      words,
    );
    expect(terms.get("essen")?.senses).toEqual([
      ["verb", "manger"],
      ["noun", "repas"],
    ]);
    expect(capitals.get("essen")).toEqual([1]);
    // A key the English pair lacks, with only a capitalised headword: marked, first.
    expect(terms.get("hund")?.short).toBe("chien");
    expect(capitals.get("hund")).toEqual([0]);
  });
  it("leaves capitalised headwords out where the language does not capitalise its nouns", () => {
    const { terms } = joinCapitals(
      {
        terms: new Map(),
        capital: new Map([["paris", { short: "Paris", senses: [] }]]),
      },
      { lang: "fr", english: {} },
    );
    expect(terms.size).toBe(0);
  });
});

describe("withOpeningLabel", () => {
  it("brackets a label the extraction left before a sentence-case gloss", () => {
    expect(withOpeningLabel("transitif Ouvrir, défaire")).toBe(
      "(transitif) Ouvrir, défaire",
    );
    expect(withOpeningLabel("ouvrir, défaire")).toBe("ouvrir, défaire");
    expect(withOpeningLabel("aller à Paris")).toBe("aller à Paris");
  });
});

describe("readReversedTables", () => {
  it("gives a learning word the native words whose tables list it, the widest tables first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reversed-"));
    const path = join(dir, "edition.jsonl");
    const entry = (word: string, pos: string, rows: object[]) =>
      JSON.stringify({
        word,
        lang_code: "fr",
        pos,
        senses: [],
        translations: rows,
      });
    writeFileSync(
      path,
      [
        entry("cabot", "noun", [
          { lang_code: "de", word: "Hund", sense: "chien (familier)" },
        ]),
        entry("chien", "noun", [
          { lang_code: "de", word: "Hund", sense: "Mammifère" },
          { lang_code: "es", word: "perro", sense: "Mammifère" },
          { lang_code: "it", word: "cane", sense: "Mammifère" },
        ]),
        entry("se trouver", "verb", [
          { lang_code: "de", word: "sich befinden", sense: "Être situé" },
        ]),
        entry("Allemagne", "name", [{ lang_code: "de", word: "Deutschland" }]),
      ].join("\n"),
    );
    const { terms, capital } = await readReversedTables(path, words, {
      native: "fr",
    });
    expect(capital.get("hund")?.senses).toEqual([
      ["noun", "chien"],
      ["noun", "cabot"],
    ]);
    expect(terms.get("befinden")?.senses).toEqual([
      ["reflexive", "se trouver"],
    ]);
    expect(terms.has("deutschland")).toBe(false);
    // An undocumented import's pages are left out, and the links to them.
    const without = await readReversedTables(path, words, {
      native: "fr",
      leftOut: new Set(["cabot", "befinden"]),
    });
    expect(without.capital.get("hund")?.senses).toEqual([["noun", "chien"]]);
    expect(without.terms.has("befinden")).toBe(false);
  });
});

describe("learningSlimEntry", () => {
  it("keeps a learning word's senses and the edition's own words' rows into offered languages", () => {
    const hund = {
      word: "Hund",
      lang_code: "de",
      pos: "noun",
      senses: [{ glosses: ["Chien."], examples: [{ text: "…" }] }],
      sounds: [{ ipa: "hʊnt" }],
    } as unknown as KaikkiEntry;
    expect(learningSlimEntry(hund, "fr")).toEqual({
      word: "Hund",
      lang_code: "de",
      pos: "noun",
      senses: [{ glosses: ["Chien."] }],
    });
    const pies = {
      word: "pies",
      lang_code: "pl",
      pos: "noun",
      senses: [],
      translations: [
        { lang_code: "de", word: "Hund" },
        { lang_code: "nl", word: "hond" },
      ],
    } as unknown as KaikkiEntry;
    expect(learningSlimEntry(pies, "pl")?.translations).toEqual([
      { lang_code: "de", word: "Hund" },
    ]);
    // In its own edition, a learning word keeps the other rows' languages, to count.
    const own = {
      ...hund,
      translations: [{ lang_code: "nl", word: "hond", sense: "Tier" }],
    } as unknown as KaikkiEntry;
    expect(learningSlimEntry(own, "de")?.translations).toEqual([
      { lang_code: "nl", sense: "Tier" },
    ]);
    const english = { ...pies, lang_code: "en" } as KaikkiEntry;
    expect(learningSlimEntry(english, "pl")).toBeUndefined();
  });
});
