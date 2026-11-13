import { describe, expect, it } from "vitest";
import { ENGLISH_RULES } from "./en";
import { SPANISH_RULES } from "./es";
import { normalizeWord } from "../text/tokenize";
import { NO_RULES, parsePattern, phrasePosIndex } from "./pattern";
import { decodePhrasePos, encodePhrasePos } from "./phrase-pos";
import { rulesFor } from "./rules";

describe("parsePattern", () => {
  it("marks the language's slot words", () => {
    expect(parsePattern("make up one's mind", ENGLISH_RULES)).toEqual({
      key: "make up one's mind",
      words: [
        { text: "make", slot: false },
        { text: "up", slot: false },
        { text: "one's", slot: true },
        { text: "mind", slot: false },
      ],
    });
  });

  it("keeps the key and normalizes the words' case and apostrophes", () => {
    expect(parsePattern("Pull Someone’s leg", ENGLISH_RULES)).toEqual({
      key: "Pull Someone’s leg",
      words: [
        { text: "pull", slot: false },
        { text: "someone's", slot: true },
        { text: "leg", slot: false },
      ],
    });
  });

  it("reads every word literally without slots", () => {
    expect(parsePattern("someone else", NO_RULES).words).toEqual([
      { text: "someone", slot: false },
      { text: "else", slot: false },
    ]);
  });

  it("uses Spanish slots for Spanish", () => {
    const slots = (key: string) =>
      parsePattern(key, SPANISH_RULES).words.map((word) => word.slot);
    expect(slots("tomar el pelo a alguien")).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(slots("dar algo por sentado")).toEqual([false, true, false, false]);
  });
});

describe("normalizeWord", () => {
  it("lowercases and writes ’ as '", () => {
    expect(normalizeWord("Anna’s")).toBe("anna's");
  });
});

describe("rulesFor", () => {
  it("returns each language's rules", () => {
    expect(rulesFor("en")).toBe(ENGLISH_RULES);
    expect(rulesFor("es")).toBe(SPANISH_RULES);
  });

  it("has no slots and no gaps for a language without rules", () => {
    expect(rulesFor("fr")).toBe(NO_RULES);
    expect(NO_RULES.slots.size).toBe(0);
    expect(NO_RULES.maxGap).toBe(0);
  });

  it("does not read inherited properties as languages", () => {
    expect(rulesFor("constructor")).toBe(NO_RULES);
  });
});

describe("phrasePosIndex", () => {
  it("reads each pattern's parts of speech, main one first, by its key", () => {
    const index = phrasePosIndex({
      detect: ["come on", "give up", "up to"],
      more: ["thank you"],
      gap: [],
      pos: { detect: "vi va -", more: "h" },
    });
    expect(index.get("come on")).toEqual(["verb", "intj"]);
    expect(index.get("give up")).toEqual(["verb", "adj"]);
    expect(index.get("thank you")).toEqual(["phrase"]);
    expect(index.has("up to")).toBe(false);
  });
  it("is empty for patterns without parts of speech", () => {
    expect(phrasePosIndex({ detect: ["a b"], more: [], gap: [] }).size).toBe(0);
  });
});

describe("encodePhrasePos", () => {
  it("writes a letter per part of speech it knows, and - for none", () => {
    expect(encodePhrasePos(["prep_phrase", "noun"])).toBe("Pn");
    expect(encodePhrasePos(["suffix"])).toBe("-");
    expect(decodePhrasePos(encodePhrasePos(["intj", "particle"]))).toEqual([
      "intj",
      "particle",
    ]);
  });
});
