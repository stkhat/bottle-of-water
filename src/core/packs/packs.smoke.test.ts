// Smoke test over the generated pack files in public/packs/ (npm run data:build),
// read through the real pack loader.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

const { lemmas, ipa, pos, freq, vocab: vocabList } = await loadPack("en");
const { dict } = await loadPack("en-ja");
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
