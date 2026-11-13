// Smoke test over the generated pack files in public/packs/ and data/packs/
// (npm run data:build, npm run data:es), read through the real pack loader.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { byCodeUnit } from "../../../scripts/data/common.ts";
import { packSourcePath } from "../../../scripts/data/formats.ts";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
} from "../lexicon/dictionary";
import { createLanguagePack } from "../lexicon/language-pack";
import { ipaFor } from "../lexicon/ipa";
import { lemmatize } from "../lexicon/lemmatize";
import { displayWidth } from "../lexicon/short-lines";
import { createPackLoader } from "./load";
import { lookup } from "../lexicon/lookup";
import type { DictPack, ShardIndex } from "./types";

const read = (path: string): unknown =>
  JSON.parse(readFileSync(packSourcePath(path), "utf8"));
const loadPack = createPackLoader(async (path) => read(path));

const {
  lemmas,
  ipa,
  pos,
  freq,
  vocab: vocabList,
  phrases,
} = await loadPack("en");
const { dict, phrases: jaPhrases, capital } = await loadPack("en-ja");
const { defs } = await loadPack("en-defs");
const vocab = new Set(vocabList);

describe("generated dictionary shards", () => {
  const index = read("packs/en-ja/index.json") as ShardIndex;
  const shards = index.shards.map(
    (s) => read(`packs/en-ja/${s.file}`) as DictPack,
  );

  it("are listed in order with their first and last headwords", () => {
    expect(index.shards.length).toBeGreaterThan(1);
    index.shards.forEach((entry, i) => {
      const keys = Object.keys(shards[i]!).sort(byCodeUnit);
      expect(entry).toEqual({
        file: `dict-${i + 1}.json`,
        first: keys[0],
        last: keys.at(-1),
      });
      if (i > 0) expect(entry.first > index.shards[i - 1]!.last).toBe(true);
    });
  });
  it("hold every headword once", () => {
    const total = shards.reduce((n, s) => n + Object.keys(s).length, 0);
    expect(Object.keys(dict)).toHaveLength(total);
    expect(total).toBeGreaterThan(40000);
  });
});

describe("generated vocabulary", () => {
  it("is the dictionary's single-word headwords, sorted", () => {
    const singleWords = Object.keys(dict)
      .filter((key) => !key.includes(" "))
      .sort(byCodeUnit);
    expect(vocabList).toEqual(singleWords);
  });
});

describe("generated packs", () => {
  it("lemmatize inflected forms", () => {
    expect(lemmatize("ferments", lemmas, vocab)).toContain("ferment");
    expect(lemmatize("loaves", lemmas, vocab)).toContain("loaf");
    expect(lemmatize("Fermented", lemmas, vocab)).toContain("ferment");
  });
  it("map vocabulary forms only to confirmed bases", () => {
    expect(lemmatize("is", lemmas, vocab)).toEqual(["is", "be"]);
    expect(lemmatize("does", lemmas, vocab)).toEqual(["does", "do"]);
    expect(lemmatize("has", lemmas, vocab)).toEqual(["has", "have"]);
    expect(lemmatize("this", lemmas, vocab)).toEqual(["this"]);
    expect(lemmatize("news", lemmas, vocab)).toEqual(["news"]);
    expect(lemmatize("better", lemmas, vocab)).toEqual([
      "better",
      "good",
      "well",
    ]);
  });
  it("have the US IPA of dough", () => {
    expect(ipaFor("dough", ipa)).toBe("/doʊ/");
  });
  it("have English → Japanese entries for words and multi-word headwords", () => {
    expect(lookup("dough", dict, pos)?.short).toBe("練り粉,こね粉,生パン");
    expect(lookup("figure of speech", dict, pos)).toBeDefined();
  });
  it("label senses with parts of speech", () => {
    const labels = lookup("ferment", dict, pos)?.senses.map((s) => s.pos);
    expect(labels).toContain("verb");
  });
  it("rank the most common words first", () => {
    const rank = (word: string) => freq.indexOf(word) + 1 || Infinity;
    expect(rank("the")).toBeLessThanOrEqual(5);
    expect(rank("you")).toBe(1);
    expect(freq.length).toBeGreaterThan(15000);
    expect(rank("thi")).toBeGreaterThan(5000);
  });
});

describe("generated phrases", () => {
  const dictionary = createEnJaDictionary({
    dict,
    phrases: jaPhrases,
    capital,
    defs,
    pos,
    ipa,
  });

  const isSorted = (list: readonly string[]) =>
    list.every((key, i) => i === 0 || byCodeUnit(list[i - 1]!, key) < 0);

  it("detect dictionary phrases", () => {
    for (const phrase of ["from scratch", "figure out", "give up"])
      expect(phrases.detect).toContain(phrase);
  });

  it("detect phrases with an inflected word", () => {
    expect(phrases.detect).toContain("spill the beans");
  });

  it("keep patterns with a slot for selections only", () => {
    expect(phrases.more).toContain("make up one's mind");
    expect(phrases.more).toContain("pull someone's leg");
    expect(phrases.detect).not.toContain("make up one's mind");
  });

  it("flag phrasal verbs as patterns with a gap", () => {
    expect(phrases.gap).toContain("figure out");
    expect(phrases.gap).not.toContain("from scratch");
  });

  it("list each pattern once, sorted, with the gap ones among them", () => {
    expect(isSorted(phrases.detect)).toBe(true);
    expect(isSorted(phrases.more)).toBe(true);
    expect(isSorted(phrases.gap)).toBe(true);
    const detect = new Set(phrases.detect);
    expect(phrases.more.filter((key) => detect.has(key))).toEqual([]);
    const all = new Set([...phrases.detect, ...phrases.more]);
    expect(phrases.gap.filter((key) => !all.has(key))).toEqual([]);
  });

  it("have a meaning for each of those phrases", () => {
    for (const phrase of [
      "from scratch",
      "figure out",
      "give up",
      "spill the beans",
      "make up one's mind",
      "pull someone's leg",
    ])
      expect(dictionary.entry(phrase)?.short, phrase).toBeTruthy();
  });

  it("have a meaning for every pattern", () => {
    const missing = [...phrases.detect, ...phrases.more].filter(
      (phrase) => !dictionary.entry(phrase)?.short,
    );
    expect(missing).toEqual([]);
  });

  const lines = (term: string) => dictionary.entry(term)?.lines ?? [];

  it("give a capitalised word its capitalised senses first, and a lowercase one none", () => {
    expect(dictionary.entry("japan", "capital")?.lines[0]).toBe("日本");
    expect(dictionary.entry("japan", "lower")?.lines).not.toContain("日本");
    expect(dictionary.entry("china", "capital")?.lines[0]).toMatch(/^中国/);
    expect(dictionary.entry("china", "lower")?.lines[0]).toMatch(/^磁器/);
    expect(dictionary.entry("june", "capital")?.lines[0]).toMatch(/^6月/);
    expect(dictionary.entry("us", "upper")?.lines[0]).toMatch(/合衆国/);
    expect(dictionary.entry("oh", "lower")?.lines.join()).not.toMatch(/Ohio/);
    // The word list does not say how the word was written: every sense.
    expect(dictionary.entry("japan")?.lines).toContain("日本");
  });

  it("say which capitalised meanings a name keeps", () => {
    expect(dictionary.capitalMeaning("june")).toBe("word");
    expect(dictionary.capitalMeaning("france")).toBeDefined();
    expect(dictionary.capitalMeaning("mark")).toBeUndefined();
    expect(dictionary.capitalMeaning("frank")).toBeUndefined();
  });

  it("follow a form or a cross-reference to the word it names for the hover card", () => {
    const go = lines("go");
    expect(lines("went")).toEqual(["goの過去", go[0], go[1]]);
    expect(lines("found")).toEqual([
      "findの過去・過去分詞",
      lines("find")[0],
      "…を創設する,設立する(establish)",
    ]);
    expect(lines("has")).toEqual([
      "haveの三人称単数現在",
      ...lines("have").slice(0, 2),
    ]);
    expect(lines("anyway")).toEqual(lines("anyhow"));
    // The dictionary window and word lists keep the entry's own short meaning.
    expect(dictionary.entry("went")?.short).toBe("goの過去");
  });

  it("give hover lines of one sense within 25 Japanese characters", () => {
    expect(lines("of")[0]).toBe("…の,…のものである,…に属する");
    expect(lines("so")[0]).toBe("そういうふうに,そのように");
    expect(lines("should")[0]).toBe(
      "すべきである,するのが当然である,しなくてはならない",
    );
    for (const term of ["went", "found", "anyway", "has", "of", "so", "should"])
      for (const line of lines(term))
        expect(displayWidth(line), line).toBeLessThanOrEqual(50);
  });

  it("take Japanese translations before English definitions", () => {
    expect(dictionary.entry("give up")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("from scratch")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("figure out")).toMatchObject({
      glossLang: "en",
      short: "To come to understand",
      ipa: expect.stringMatching(/^\/\S+ \S+\/$/),
    });
  });
});

const es = await loadPack("es");
const { defs: esEn } = await loadPack("es-en");

describe("generated Spanish pack and es-en dictionary", () => {
  const pack = createLanguagePack("es", {
    lemmas: es.lemmas,
    freq: es.freq,
    ipa: es.ipa,
    vocab: new Set(es.vocab),
    patterns: es.phrases,
  });
  const dictionary = createDefsDictionary({
    defs: esEn,
    ipa: es.ipa,
  });

  it("lemmatize inflected forms to their bases", () => {
    expect(pack.lemmas("comiendo")).toEqual(["comer"]);
    expect(pack.lemmas("casas")).toEqual(["casa", "casar"]);
  });

  it("have English meanings with parts of speech", () => {
    expect(dictionary.entry("comer")).toMatchObject({
      head: "comer",
      kind: "word",
      short: "to eat",
    });
    expect(dictionary.entry("comer")?.senses[0]).toEqual({
      pos: "verb",
      text: "to eat",
    });
    expect(dictionary.entry("comer")).not.toHaveProperty("glossLang");
  });

  it("have the IPA of comer", () => {
    expect(pack.ipa("comer")).toBe("/koˈmeɾ/");
    expect(dictionary.entry("comer")?.ipa).toBe("/koˈmeɾ/");
  });

  it("rank common words first", () => {
    expect(pack.rank("de")).toBeLessThanOrEqual(5);
    expect(pack.rank("comer")).toBeLessThan(pack.rank("manzana"));
  });

  it("have a meaning for every phrase pattern", () => {
    expect(es.phrases.detect.length).toBeGreaterThan(0);
    for (const phrase of [...es.phrases.detect, ...es.phrases.more])
      expect(dictionary.entry(phrase)?.short, phrase).toBeTruthy();
  });

  it("keep patterns with a slot for selections only, without gaps", () => {
    expect(es.phrases.more).toContain("la pelota está en el tejado de alguien");
    expect(es.phrases.detect).not.toContain(
      "la pelota está en el tejado de alguien",
    );
    expect(es.phrases.gap).toEqual([]);
  });
});

const { dict: enEs } = await loadPack("en-es");

describe("generated en-es dictionary", () => {
  const dictionary = createPairDictionary({
    dict: enEs,
    defs,
    ipa,
  });
  const index = read("packs/en-es/index.json") as ShardIndex;

  it("names its sources, the Spanish Wiktionary first", () => {
    expect(index.sources).toEqual([
      "eswiktionary",
      "enwiktionary-translations",
    ]);
  });

  it("has Spanish meanings from the Spanish Wiktionary", () => {
    expect(dictionary.entry("light")).toMatchObject({
      head: "light",
      short: "Luz",
      ipa: expect.any(String),
    });
    expect(dictionary.entry("light")).not.toHaveProperty("glossLang");
  });

  it("keeps the English sense as the hint of translation-table senses", () => {
    const fromTables = Object.entries(enEs).filter(
      ([, [, , source]]) =>
        index.sources?.[source] === "enwiktionary-translations",
    );
    expect(fromTables.length).toBeGreaterThan(10000);
    for (const [, [, senses]] of fromTables.slice(0, 100))
      for (const [, , hint] of senses) expect(hint).toBeTruthy();
    expect(enEs.tangy).toEqual([
      "acidulado",
      [["adjective", "acidulado, acídulo", "having a sharp, pungent flavor"]],
      index.sources!.indexOf("enwiktionary-translations"),
    ]);
  });

  it("falls back to English definitions for a term without a Spanish meaning", () => {
    const englishOnly = Object.keys(defs).find(
      (term) => !Object.hasOwn(enEs, term),
    );
    expect(englishOnly).toBeDefined();
    expect(dictionary.entry(englishOnly!)?.glossLang).toBe("en");
  });
});
