import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { importPhrases, type PhrasesResult } from "./phrases.mjs";

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
];
// EJDict multi-word headwords (and one single word).
const dict = {
  give: ["与える", ["与える"]],
  "look forward to": ["…を楽しみに待つ", ["…を楽しみに待つ"]],
  "in spite of": ["…にもかかわらず", ["…にもかかわらず"]],
  "make one's way": ["進む", ["進む"]],
  "kick the bucket": ["死ぬ", ["死ぬ"]],
  "x-ray machine": ["X線装置", ["X線装置"]],
} satisfies Record<string, [string, string[]]>;

describe("importPhrases", () => {
  let result: PhrasesResult;
  beforeAll(async () => {
    result = await importPhrases(fixture, vocab, dict);
  });

  it("lists kaikki phrases with an idiomatic, phrasal-verb, phrase or prepositional-phrase sense", () => {
    expect(result.phrases).toContain("give up");
    expect(result.phrases).toContain("figure out");
    expect(result.phrases).toContain("from scratch");
    expect(result.phrases).toContain("by heart");
  });
  it("lowercases the phrase key", () => {
    expect(result.phrases).toContain("see you later");
  });
  it("lists EJDict multi-word headwords whose words are all in the vocabulary", () => {
    expect(result.phrases).toContain("in spite of");
    expect(result.phrases).toContain("look forward to");
  });
  it("sorts the list by code unit, without duplicates or single words", () => {
    expect(result.phrases).toEqual([
      "by heart",
      "figure out",
      "from scratch",
      "give up",
      "in spite of",
      "look forward to",
      "see you later",
    ]);
  });
  it("leaves out entries whose only senses are form-of, alt-of or have no glosses", () => {
    expect(result.phrases).not.toContain("thrown away");
    expect(result.phrases).not.toContain("cut out");
  });
  it("leaves out phrases with a placeholder word", () => {
    expect(result.phrases).not.toContain("make up one's mind");
    expect(result.phrases).not.toContain("make one's way");
  });
  it("leaves out entries without an idiomatic or phrase sense", () => {
    expect(result.phrases).not.toContain("carbon copy");
  });
  it("leaves out phrases with a word outside the vocabulary or not made of letters", () => {
    expect(result.phrases).not.toContain("zonk out");
    expect(result.phrases).not.toContain("kick the bucket");
    expect(result.phrases).not.toContain("x-ray machine");
  });

  it("collects distinct Japanese translations for phrases EJDict lacks", () => {
    expect(result.ja).toEqual({
      "by heart": ["暗記して", ["暗記して", "そらで"]],
    });
  });
  it("gives English definitions only to phrases without EJDict or Japanese meanings", () => {
    expect(Object.keys(result.defs).sort()).toEqual([
      "figure out",
      "from scratch",
      "give up",
      "see you later",
    ]);
  });
  it("merges senses of entries with the same headword, up to 4, skipping archaic ones", () => {
    expect(result.defs["give up"]).toEqual([
      "To surrender (someone or something)",
      [
        [
          "verb",
          "To surrender (someone or something); to inform on (someone).",
        ],
        ["verb", "To stop or quit (an activity, etc.)."],
        ["adjective", "Become fully taken over by a certain quality."],
        ["adjective", "Too tired to go on."],
      ],
    ]);
  });
  it("labels the part of speech and drops the final period from the short meaning", () => {
    expect(result.defs["from scratch"]).toEqual([
      "From the beginning",
      [
        [
          "prepositional phrase",
          "From the beginning; starting with no advantage or prior preparation.",
        ],
        ["prepositional phrase", "From basic materials or raw ingredients."],
      ],
    ]);
    expect(result.defs["see you later"]).toEqual([
      "Goodbye",
      [["phrase", "Goodbye."]],
    ]);
  });
  it("keeps every usable sense, not only the idiomatic ones", () => {
    expect(result.defs["figure out"]?.[1]).toEqual([
      ["verb", "To come to understand; to discover or find a solution."],
      ["verb", "To calculate."],
    ]);
  });

  it("counts multi-word entries, unparsable lines and phrases", () => {
    expect(result.stats).toEqual({
      entries: 14,
      unparsable: 1,
      phrases: 7,
      fromEjdict: 2,
      fromKaikki: 6,
      ja: 1,
      defs: 4,
    });
  });
});
