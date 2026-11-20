import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";
import {
  DOTTED_KNOWN,
  DOTTED_SENTENCE,
  DOTTED_WORDS,
  TRICKY_SENTENCE,
  TRICKY_WORDS,
} from "../../testing/tokenize-cases";

describe("tokenize in the browser", () => {
  it("splits the tricky sentence the same way as in Node", () => {
    const words = tokenize(TRICKY_SENTENCE, "en")
      .filter((token) => token.isWord)
      .map(({ text, start, end }) => ({ text, start, end }));
    expect(words).toEqual(TRICKY_WORDS);
  });

  // Chrome's segmenter splits "U.S." into "U", ".", "S", "." where Node's keeps "U.S".
  it("reads abbreviations with full stops inside the same way as in Node", () => {
    const words = tokenize(DOTTED_SENTENCE, "en", (word) =>
      DOTTED_KNOWN.includes(word.toLowerCase()),
    )
      .filter((token) => token.isWord)
      .map(({ text, start, end }) => `${text}@${start}-${end}`);
    expect(words).toEqual(DOTTED_WORDS);
  });
});
