import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";
import { TRICKY_SENTENCE, TRICKY_WORDS } from "../../testing/tokenize-cases";

describe("tokenize in the browser", () => {
  it("splits the tricky sentence the same way as in Node", () => {
    const words = tokenize(TRICKY_SENTENCE, "en")
      .filter((token) => token.isWord)
      .map(({ text, start, end }) => ({ text, start, end }));
    expect(words).toEqual(TRICKY_WORDS);
  });
});
