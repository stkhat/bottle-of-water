import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeSenseLabels } from "../../src/core/lexicon/sense-labels.ts";
import { phrasePosIndex } from "../../src/core/phrases/pattern.ts";
import { importPhrases, patternKey, type PhrasesResult } from "./phrases.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-phrases.jsonl");
const vocab = [
  ...["give", "up", "come", "back", "you", "know", "kind", "of", "digital"],
  ...["signature", "instant", "coffee", "red", "tape", "new", "york", "god"],
  ...["sake", "kick", "in", "the", "it", "from", "heart", "make", "one's"],
  ...["mind", "pull", "leg", "be", "on", "spill", "for", "carbon", "copy"],
  ...["cut", "machine", "away", "look", "forward", "to", "x-ray"],
];
// Inflected forms outside the vocabulary, with their base forms.
const lemmas = { beans: ["bean"], thrown: "throw" };
// EJDict: a multi-word headword kaikki lacks, and a single word.
const dict = {
  give: ["与える", ["与える"]],
  "look forward to": ["…を楽しみに待つ", ["…を楽しみに待つ"]],
} satisfies Record<string, [string, string[]]>;

describe("importPhrases", () => {
  let result: PhrasesResult;
  beforeAll(async () => {
    // The fixture's gloss vocabulary is small: its few most frequent tokens are its
    // stopwords.
    result = await importPhrases(fixture, {
      vocab,
      lemmas,
      dict,
      stopwords: { gloss: 6, function: 3 },
    });
  });
  const all = () => [...result.phrases.detect, ...result.phrases.more];
  const verdict = (key: string) => result.verdicts.find((v) => v.key === key)!;

  describe("B1: every multi-word entry", () => {
    it("imports entries of any part of speech, whatever their words' ranks", () => {
      for (const key of ["you know", "kind of", "in it", "come back"])
        expect(all()).toContain(key);
    });
    it("accepts inflected forms and possessives of vocabulary words", () => {
      expect(all()).toContain("spill the beans");
      expect(all()).toContain("for god's sake");
    });
    it("keeps a multi-word noun or name with a translation table or an example", () => {
      expect(all()).toContain("digital signature");
      expect(all()).toContain("red tape");
      expect(all()).toContain("new york");
      expect(all()).not.toContain("carbon copy");
      expect(result.stats.unattested).toBe(1);
    });
    it("leaves out non-constituents, pointers, literal notes and words outside the vocabulary", () => {
      for (const key of [
        "from the heart",
        "thrown away",
        "cut in",
        "x-ray machine",
        "zonk out",
      ])
        expect(all()).not.toContain(key);
    });
    it("keeps EJDict's multi-word headwords", () => {
      expect(all()).toContain("look forward to");
    });
    it("sorts both lists by code unit, apart", () => {
      expect(result.phrases.detect).toEqual([...result.phrases.detect].sort());
      expect(result.phrases.more).toEqual([...result.phrases.more].sort());
      expect(
        result.phrases.detect.filter((key) =>
          result.phrases.more.includes(key),
        ),
      ).toEqual([]);
    });
  });

  describe("B2: highlighting by idiomaticity", () => {
    it("detects a pattern whose meaning is not its words' (an idiom, a discourse marker)", () => {
      for (const key of ["red tape", "spill the beans", "you know", "kind of"])
        expect(result.phrases.detect).toContain(key);
    });
    it("leaves a pattern whose definition says what its words say to selections", () => {
      expect(verdict("come back").score).toBeLessThan(
        verdict("come back").threshold,
      );
      expect(result.phrases.more).toContain("come back");
    });
    it("detects the source's phrasal verbs whatever their score", () => {
      expect(result.phrases.detect).toContain("give up");
      expect(result.phrases.detect).toContain("kick in");
    });
    it("raises the threshold with a pattern's count in the example corpus", () => {
      expect(verdict("you know").evidence.count).toBe(5);
      expect(verdict("you know").threshold).toBeGreaterThan(
        verdict("spill the beans").threshold,
      );
    });
    it("never detects a slot pattern or one starting with an auxiliary", () => {
      for (const key of ["make up one's mind", "pull someone's leg", "be on"])
        expect(result.phrases.more).toContain(key);
    });
  });

  describe("B2b and B4: transparent compounds and named entities", () => {
    it("leaves a compound whose definition names every content word to selections", () => {
      expect(verdict("digital signature")).toMatchObject({
        transparent: true,
        detect: false,
      });
    });
    it("leaves a compound glossed by a loanword to selections", () => {
      expect(verdict("instant coffee")).toMatchObject({
        transparent: true,
        detect: false,
      });
      expect(verdict("instant coffee").evidence.loanword).toBe(true);
    });
    it("leaves a proper noun to selections", () => {
      expect(verdict("new york")).toMatchObject({ named: true, detect: false });
    });
    it("leaves an EJDict headword written in Title Case to selections", async () => {
      const titled = await importPhrases(fixture, {
        vocab,
        lemmas,
        dict,
        titleCase: new Set(["look forward to"]),
        stopwords: { gloss: 6, function: 3 },
      });
      expect(titled.phrases.more).toContain("look forward to");
    });
  });

  describe("pattern data", () => {
    it("flags the phrasal verbs, which may have a gap", () => {
      expect(result.phrases.gap).toEqual(["be on", "give up", "kick in"]);
    });
    it("gives each pattern the source's parts of speech, the one with the most senses first", () => {
      const pos = phrasePosIndex(result.phrases);
      expect(pos.get("you know")).toEqual(["intj", "phrase"]);
      expect(pos.get("give up")).toEqual(["verb"]);
      expect(pos.has("look forward to")).toBe(false);
    });
    it("lists the verb patterns whose senses are intransitive and never transitive", () => {
      expect(result.phrases.intransitive).toEqual(["come back", "kick in"]);
    });
  });

  describe("C1: Japanese meanings from the translation tables", () => {
    it("keeps the senses with their English hint, best first, each word once", () => {
      expect(result.ja["give up"]).toEqual([
        "降参する",
        [
          "《To surrender (someone or something)》降参する",
          "《To stop or quit an activity》やめる,諦める",
        ],
        "v v",
      ]);
    });
    it("files an entry-level table under its label, with the sense's part of speech", () => {
      const [short, senses, labels] = result.ja["you know"]!;
      expect([short, senses]).toEqual([
        "あのね",
        ["《pause or hesitation》あのね"],
      ]);
      expect(decodeSenseLabels(labels)).toEqual([{ pos: "interjection" }]);
    });
    it("leaves EJDict's phrases to EJDict", () => {
      expect(result.ja).not.toHaveProperty("look forward to");
    });
  });

  it("counts entries, unparsable lines and patterns", () => {
    expect(result.stats).toMatchObject({
      entries: 22,
      unparsable: 1,
      detect: 9,
      more: 7,
      named: 1,
      transparent: 2,
      gap: 3,
      fromEjdict: 1,
      ja: 3,
    });
  });
});

describe("patternKey", () => {
  const isWord = (word: string) =>
    ["take", "up", "with", "pull", "leg", "x-ray", "god's"].includes(word);

  it("lowercases the words and joins them with single spaces", () => {
    expect(patternKey(" Take  up ", isWord)).toBe("take up");
    expect(patternKey("God’s leg", isWord)).toBe("god's leg");
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
