import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { phrasePosIndex } from "../../src/core/phrases/pattern.ts";
import { importPhrases, patternKey, type PhrasesResult } from "./phrases.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-phrases.jsonl");
const vocab = [
  "give",
  "up",
  "from",
  "scratch",
  "figure",
  "out",
  "thrown",
  "away",
  "make",
  "one's",
  "mind",
  "carbon",
  "copy",
  "by",
  "heart",
  "look",
  "forward",
  "to",
  "see",
  "you",
  "later",
  "x-ray",
  "machine",
  "cut",
  "in",
  "spite",
  "of",
  "way",
  "kick",
  "the",
  "it",
  "be",
  "on",
  "have",
  "do",
  "with",
  "for",
  "pull",
  "leg",
  "spill",
  "all",
  "very",
  "well",
  "back",
];
// Inflected forms outside the vocabulary, with their base forms.
const lemmas = { beans: ["bean"], ears: "ear", given: "give" };
// Frequency ranks: the first words are in the top 100, "later" and "figure" in the top
// 1000 but not the top 100 (as are "very", "well" and "back"); "scratch", "heart", "kick" and
// "bean" are outside the list.
const freq = [
  "the",
  "you",
  "to",
  "it",
  "in",
  "give",
  "up",
  "see",
  "out",
  "from",
  "by",
  ...Array.from({ length: 100 }, (_, i) => `filler${i}`),
  "later",
  "figure",
  "very",
  "well",
  "back",
];
// EJDict multi-word headwords (and one single word).
const dict = {
  give: ["与える", ["与える"]],
  "look forward to": ["…を楽しみに待つ", ["…を楽しみに待つ"]],
  "in spite of": ["…にもかかわらず", ["…にもかかわらず"]],
  "make one's way": ["進む", ["進む"]],
  "kick the bucket": ["死ぬ", ["死ぬ"]],
  "do away with": ["…を廃止する", ["…を廃止する"]],
  "x-ray machine": ["X線装置", ["X線装置"]],
  "up to": ["…まで", ["…まで"]],
} satisfies Record<string, [string, string[]]>;

describe("importPhrases", () => {
  let result: PhrasesResult;
  beforeAll(async () => {
    result = await importPhrases(fixture, vocab, dict, freq, lemmas);
  });
  const all = () => [...result.phrases.detect, ...result.phrases.more];

  it("detects kaikki phrases with an idiomatic, phrasal-verb, phrase or prepositional-phrase sense", () => {
    expect(result.phrases.detect).toContain("give up");
    expect(result.phrases.detect).toContain("figure out");
    expect(result.phrases.detect).toContain("from scratch");
    expect(result.phrases.detect).toContain("by heart");
  });
  it("lowercases the pattern key", () => {
    expect(result.phrases.detect).toContain("from scratch");
  });
  it("keeps phrasal verbs made of very common words", () => {
    expect(result.phrases.detect).toContain("give up");
  });
  it("does not detect two-word phrasal verbs of common words ending in a preposition, but keeps them for selections", () => {
    expect(result.phrases.more).toContain("see to");
    expect(result.phrases.detect).not.toContain("see to");
    expect(result.phrases.gap).toContain("see to");
  });
  it("does not detect two-word idioms of common words that do not end in an adverb particle", () => {
    expect(result.phrases.more).toContain("very well");
    expect(result.phrases.detect).not.toContain("very well");
  });
  it("detects two-word idioms of common words ending in an adverb particle, phrasal verbs or not", () => {
    expect(result.phrases.detect).toContain("later back");
    expect(result.phrases.gap).not.toContain("later back");
  });
  it("detects two-word phrasal verbs ending in a preposition when a word is rarer", () => {
    expect(result.phrases.detect).toContain("kick in");
  });
  it("detects two-word EJDict headwords of common words", () => {
    expect(result.phrases.detect).toContain("up to");
  });
  it("leaves out idiomatic entries whose words are all in the top 100", () => {
    expect(all()).not.toContain("in it");
  });
  it("leaves out phrase entries whose words are all in the top 1000", () => {
    expect(all()).not.toContain("see you later");
  });
  it("leaves out entries in a non-constituents category, at entry or sense level", () => {
    expect(all()).not.toContain("give out");
    expect(all()).not.toContain("from the heart");
    expect(result.phrases.gap).not.toContain("give out");
  });
  it("does not detect kaikki patterns that start with an auxiliary, but keeps them for selections", () => {
    expect(result.phrases.more).toContain("be on");
    expect(result.phrases.more).toContain("have it in for");
    expect(result.phrases.more).toContain("be all ears");
    expect(result.phrases.detect).not.toContain("be on");
  });
  it("detects EJDict multi-word headwords without a slot, even when they start with an auxiliary", () => {
    expect(result.phrases.detect).toContain("do away with");
    expect(result.phrases.detect).toContain("in spite of");
    expect(result.phrases.detect).toContain("look forward to");
  });
  it("does not count literal-use glosses as senses", () => {
    expect(all()).not.toContain("cut in");
  });
  it("keeps slot patterns, from kaikki and EJDict, for selections only", () => {
    expect(result.phrases.more).toContain("make up one's mind");
    expect(result.phrases.more).toContain("make one's way");
    expect(result.phrases.detect).not.toContain("make up one's mind");
  });
  it("writes Wiktionary's somebody / sb / sth as the slots someone / something", () => {
    expect(result.phrases.more).toContain("pull someone's leg");
    expect(all()).not.toContain("pull somebody's leg");
  });
  it("accepts inflected forms of vocabulary words as pattern words", () => {
    expect(result.phrases.detect).toContain("spill the beans");
    expect(result.phrases.more).toContain("be all ears");
  });
  it("ranks an inflected word as its base form", () => {
    // "given" ranks as "give" (6) and "to" is 3: both in the top 100.
    expect(all()).not.toContain("given to");
  });
  it("sorts the detected and the other patterns by code unit, apart, without single words", () => {
    expect(result.phrases.detect).toEqual([
      "by heart",
      "do away with",
      "figure out",
      "from scratch",
      "give up",
      "in spite of",
      "kick in",
      "later back",
      "look forward to",
      "spill the beans",
      "up to",
    ]);
    expect(result.phrases.more).toEqual([
      "be all ears",
      "be on",
      "have it in for",
      "make one's way",
      "make up one's mind",
      "pull someone's leg",
      "see to",
      "very well",
    ]);
  });
  it("flags the phrasal verbs, which may have a gap, among both", () => {
    expect(result.phrases.gap).toEqual([
      "be on",
      "figure out",
      "give up",
      "kick in",
      "see to",
    ]);
  });
  it("leaves out entries whose only senses are form-of, alt-of or have no glosses", () => {
    expect(all()).not.toContain("thrown away");
    expect(all()).not.toContain("cut out");
  });
  it("leaves out entries without an idiomatic or phrase sense", () => {
    expect(all()).not.toContain("carbon copy");
  });
  it("leaves out patterns with a word outside the vocabulary and its forms, or not made of letters", () => {
    expect(all()).not.toContain("zonk out");
    expect(all()).not.toContain("kick the bucket");
    expect(all()).not.toContain("x-ray machine");
  });

  it("collects distinct Japanese translations for phrases EJDict lacks, senses first", () => {
    expect(result.ja).toEqual({
      "by heart": ["そらで", ["そらで", "暗記して"]],
    });
  });
  it("gives each pattern the source's parts of speech, the one with the most usable senses first", () => {
    const pos = phrasePosIndex(result.phrases);
    // give up: three adjective senses, two usable verb senses (one is archaic).
    expect(pos.get("give up")).toEqual(["adj", "verb"]);
    expect(pos.get("from scratch")).toEqual(["prep_phrase"]);
    expect(pos.get("very well")).toEqual(["adv"]);
    expect(pos.get("make up one's mind")).toEqual(["verb"]);
    // EJDict's alone.
    expect(pos.has("up to")).toBe(false);
    expect(result.phrases.pos?.detect.split(" ")).toHaveLength(
      result.phrases.detect.length,
    );
  });
  it("lists the verb patterns whose senses are intransitive and never transitive", () => {
    expect(result.phrases.intransitive).toEqual(["kick in"]);
  });
  it("counts multi-word entries, unparsable lines and patterns", () => {
    expect(result.stats).toEqual({
      entries: 28,
      unparsable: 1,
      detect: 11,
      more: 8,
      trivial: 2,
      withPos: 15,
      gap: 5,
      fromEjdict: 5,
      fromKaikki: 15,
      ja: 1,
    });
  });
});

describe("patternKey", () => {
  const isWord = (word: string) =>
    ["take", "up", "with", "pull", "leg", "x-ray"].includes(word);

  it("lowercases the words and joins them with single spaces", () => {
    expect(patternKey(" Take  up ", isWord)).toBe("take up");
  });
  it("writes Wiktionary's other slot spellings as the slots", () => {
    expect(patternKey("take sth up with SB", isWord)).toBe(
      "take something up with someone",
    );
    expect(patternKey("pull sb's leg", isWord)).toBe("pull someone's leg");
    expect(patternKey("pull somebody's leg", isWord)).toBe(
      "pull someone's leg",
    );
  });
  it("needs at least two words, one of them not a slot", () => {
    expect(patternKey("take", isWord)).toBeUndefined();
    expect(patternKey("someone's something", isWord)).toBeUndefined();
  });
  it("rejects words that are not accepted or not made of letters", () => {
    expect(patternKey("take over", isWord)).toBeUndefined();
    expect(patternKey("x-ray up", isWord)).toBeUndefined();
  });
});
