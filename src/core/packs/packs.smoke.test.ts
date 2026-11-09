// Smoke test over the generated pack files in public/packs/ (npm run data:build).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFreqIndex, rankOf } from "./frequency";
import { ipaFor } from "./ipa";
import { lemmatize } from "./lemmatize";
import { lookup } from "./lookup";
import type { DictPack, FreqPack, IpaPack, LemmaPack, PosPack } from "./types";
import { vocabularyOf } from "./vocabulary";

const packs = join(import.meta.dirname, "..", "..", "..", "public", "packs");
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(packs, path), "utf8")) as T;

const dict = read<DictPack>("en-ja/dict.json");
const lemmas = read<LemmaPack>("en/lemmas.json");
const ipa = read<IpaPack>("en/ipa.json");
const pos = read<PosPack>("en/pos.json");
const freq = read<FreqPack>("en/freq.json");
const vocab = vocabularyOf(dict);

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
