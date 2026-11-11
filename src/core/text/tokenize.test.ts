import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";
import { TRICKY_SENTENCE, TRICKY_WORDS } from "../../testing/tokenize-cases";

describe("tokenize", () => {
  it("splits text into word and non-word tokens with offsets", () => {
    expect(tokenize("Hi, you.", "en")).toEqual([
      { text: "Hi", start: 0, end: 2, isWord: true },
      { text: ",", start: 2, end: 3, isWord: false },
      { text: " ", start: 3, end: 4, isWord: false },
      { text: "you", start: 4, end: 7, isWord: true },
      { text: ".", start: 7, end: 8, isWord: false },
    ]);
  });

  it("keeps apostrophes inside words and splits at hyphens and dashes", () => {
    const words = tokenize(TRICKY_SENTENCE, "en")
      .filter((token) => token.isWord)
      .map(({ text, start, end }) => ({ text, start, end }));
    expect(words).toEqual(TRICKY_WORDS);
  });

  it("gives offsets that slice back to each token", () => {
    for (const token of tokenize(TRICKY_SENTENCE, "en"))
      expect(TRICKY_SENTENCE.slice(token.start, token.end)).toBe(token.text);
  });

  it("gives nothing for empty text", () => {
    expect(tokenize("", "en")).toEqual([]);
  });
});
