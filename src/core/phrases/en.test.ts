import { describe, expect, it } from "vitest";
import { tokenize } from "../text/tokenize";
import { ENGLISH_RULES } from "./en";
import { createPhraseMatcher } from "./matcher";

/** The key that "with <word>" matches, against the one pattern "with <slot>". */
function matched(slot: string, word: string): string | undefined {
  const matcher = createPhraseMatcher({
    rules: ENGLISH_RULES,
    patterns: { detect: [], more: [`with ${slot}`], gap: [] },
    lemmas: () => [],
  });
  const input = matcher.prepare(tokenize(`with ${word}`, "en"));
  return matcher.longestAt(input, 0, "select")?.key;
}

describe("English rules", () => {
  it.each([
    ["one's", "my your his her its our their one's"],
    ["someone's", "my your his her its our their someone's Anna's Anna’s"],
    ["someone", "me you him her us them someone"],
    ["something", "it this that them something"],
    [
      "oneself",
      "myself yourself himself herself itself ourselves yourselves themselves oneself",
    ],
  ])("fills %s with: %s", (slot, words) => {
    for (const word of words.split(" "))
      expect(matched(slot, word), word).toBe(`with ${slot}`);
  });

  it.each([
    ["one's", "me Anna's someone's"],
    ["someone's", "it's let's that's he's"],
    ["someone", "my it someone's"],
    ["something", "him its"],
    ["oneself", "me self"],
  ])("does not fill %s with: %s", (slot, words) => {
    for (const word of words.split(" "))
      expect(matched(slot, word), word).toBeUndefined();
  });

  it("lets phrasal verbs have up to three words between their parts", () => {
    expect(ENGLISH_RULES.maxGap).toBe(3);
  });
});
