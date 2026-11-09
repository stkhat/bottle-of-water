import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { importKaikki, posLabel, type KaikkiResult } from "./kaikki.mjs";

const fixture = join(import.meta.dirname, "fixtures", "kaikki.jsonl");
const vocab = [
  "loaf",
  "loaves",
  "ferment",
  "dough",
  "colour",
  "color",
  "good",
  "well",
  "sheep",
  "may",
  "monday",
  "the",
];

describe("importKaikki", () => {
  let result: KaikkiResult;
  beforeAll(async () => {
    result = await importKaikki(fixture, vocab);
  });

  it("maps inflected forms to their base", () => {
    expect(result.lemmas.loaves).toBe("loaf");
    expect(result.lemmas.ferments).toBe("ferment");
    expect(result.lemmas.fermenting).toBe("ferment");
    expect(result.lemmas.loafed).toBe("loaf");
    expect(result.lemmas.colours).toBe("colour");
  });
  it("lists every base, sorted, when a form has several", () => {
    expect(result.lemmas.better).toEqual(["good", "well"]);
  });
  it("ignores alternative, obsolete, dialectal, misspelt and nonstandard forms", () => {
    for (const form of [
      "loafes",
      "fermente",
      "fermentit",
      "fermint",
      "sheeps",
    ]) {
      expect(result.lemmas).not.toHaveProperty(form);
    }
  });
  it("ignores forms equal to the base, multi-word forms and bases outside the vocabulary", () => {
    for (const form of ["sheep", "more good", "zzyzxes", "figures of speech"]) {
      expect(result.lemmas).not.toHaveProperty(form);
    }
  });
  it("skips entries that are not English", () => {
    expect(result.lemmas).not.toHaveProperty("doughe");
    expect(result.ipa.dough).not.toBe("/x/");
  });
  it("uses entries spelt like the vocabulary word, and other casings only when there are none", () => {
    expect(result.lemmas).not.toHaveProperty("mays");
    expect(result.lemmas.might).toBe("may");
    expect(result.pos.may).toEqual(["verb"]);
    expect(result.lemmas.mondays).toBe("monday");
    expect(result.pos.monday).toEqual(["proper noun"]);
    expect(result.ipa.monday).toBe("/ˈmʌndeɪ/");
  });
  it("chooses the General American or US IPA, preferring a phonemic /…/ one", () => {
    expect(result.ipa.loaf).toBe("/loʊf/");
    expect(result.ipa.dough).toBe("/doʊ/");
    expect(result.ipa.ferment).toBe("/fɚˈmɛnt/");
    expect(result.ipa.the).toBe("/ðiː/");
  });
  it("leaves out words with only a non-US IPA", () => {
    expect(result.ipa).not.toHaveProperty("colour");
    expect(result.ipa).not.toHaveProperty("may");
  });
  it("collects parts of speech in the order they appear", () => {
    expect(result.pos.loaf).toEqual(["noun", "verb"]);
    expect(result.pos.good).toEqual(["adjective"]);
    expect(result.pos.well).toEqual(["adverb"]);
    expect(result.pos.the).toEqual(["article"]);
    expect(result.pos).not.toHaveProperty("zzyzx");
  });
  it("counts lines it cannot parse instead of failing", () => {
    expect(result.stats).toEqual({ entries: 15, unparsable: 1 });
  });
});

describe("posLabel", () => {
  it.each([
    ["adj", "adjective"],
    ["adv", "adverb"],
    ["prep", "preposition"],
    ["pron", "pronoun"],
    ["conj", "conjunction"],
    ["intj", "interjection"],
    ["det", "determiner"],
    ["num", "numeral"],
    ["name", "proper noun"],
    ["prep_phrase", "prepositional phrase"],
    ["noun", "noun"],
    ["phrase", "phrase"],
  ])("labels %s as %s", (pos, label) => {
    expect(posLabel(pos)).toBe(label);
  });
});
