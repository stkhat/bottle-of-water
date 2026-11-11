import { describe, expect, it } from "vitest";
import { ENGLISH_RULES } from "./en";
import { SPANISH_RULES } from "./es";
import { NO_RULES, normalizeWord, parsePattern } from "./pattern";
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
