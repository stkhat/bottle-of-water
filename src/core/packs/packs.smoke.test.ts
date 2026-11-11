// Smoke test over the generated pack files in public/packs/ (npm run data:build),
// read through the real pack loader.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefsDictionary, createEnJaDictionary } from "../dictionary";
import { createLanguagePack } from "../language-pack";
import { buildFreqIndex, rankOf } from "./frequency";
import { ipaFor } from "./ipa";
import { lemmatize } from "./lemmatize";
import { createPackLoader } from "./load";
import { lookup } from "./lookup";
import type { DictPack, ShardIndex } from "./types";

const publicDir = join(import.meta.dirname, "..", "..", "..", "public");
const read = (path: string): unknown =>
  JSON.parse(readFileSync(join(publicDir, path), "utf8"));
const loadPack = createPackLoader(async (path) => read(path));

const {
  lemmas,
  ipa,
  pos,
  freq,
  vocab: vocabList,
  phrases,
} = await loadPack("en");
const { dict, phrases: jaPhrases } = await loadPack("en-ja");
const { defs } = await loadPack("en-defs");
const vocab = new Set(vocabList);
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
    const index = buildFreqIndex(freq);
    expect(rankOf("the", index)).toBeLessThanOrEqual(5);
    expect(rankOf("you", index)).toBe(1);
    expect(freq.length).toBeGreaterThan(15000);
    expect(rankOf("thi", index)).toBeGreaterThan(5000);
  });
});

describe("generated phrases", () => {
  const dictionary = createEnJaDictionary({
    dict,
    phrases: jaPhrases,
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
      (phrase) => !dictionary.short(phrase),
    );
    expect(missing).toEqual([]);
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
    phrases: new Set(es.phrases.detect),
  });
  const dictionary = createDefsDictionary({
    from: "es",
    to: "en",
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
      expect(dictionary.short(phrase), phrase).toBeTruthy();
  });

  it("keep patterns with a slot for selections only, without gaps", () => {
    expect(es.phrases.more).toContain("la pelota está en el tejado de alguien");
    expect(es.phrases.detect).not.toContain(
      "la pelota está en el tejado de alguien",
    );
    expect(es.phrases.gap).toEqual([]);
  });
});
