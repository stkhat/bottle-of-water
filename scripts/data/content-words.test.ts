import { describe, expect, it } from "vitest";
import { contentWords, isFunctionWord } from "./content-words.ts";

describe("isFunctionWord", () => {
  it("is true for a word with a function part of speech", () => {
    expect(isFunctionWord("him", ["pronoun"])).toBe(true);
    expect(isFunctionWord("into", ["preposition", "adverb"])).toBe(true);
    expect(isFunctionWord("the", ["article", "adverb"])).toBe(true);
    expect(isFunctionWord("and", ["conjunction", "noun"])).toBe(true);
  });
  it("is true for an auxiliary whatever its parts of speech", () => {
    expect(isFunctionWord("can", ["verb", "noun"])).toBe(true);
    expect(isFunctionWord("would", ["verb"])).toBe(true);
  });
  it("is false for a content word", () => {
    expect(isFunctionWord("light", ["noun", "verb", "adjective"])).toBe(false);
    expect(isFunctionWord("upset", ["verb", "adjective", "noun"])).toBe(false);
    expect(isFunctionWord("zzyzx", [])).toBe(false);
  });
});

describe("contentWords", () => {
  const freq = [
    "you",
    "the",
    "go",
    "light",
    "can",
    "went",
    "doesn't",
    "j",
    "house",
    "lights",
  ];
  const pos = {
    you: ["pronoun"],
    the: ["article"],
    go: ["verb", "noun"],
    light: ["noun", "adjective"],
    can: ["verb", "noun"],
    house: ["noun"],
    went: ["verb"],
    "doesn't": ["verb"],
    j: ["character", "noun"],
  };
  const lemmas = { went: "go", lights: ["light"] };
  const vocab = new Set([
    "you",
    "the",
    "go",
    "light",
    "can",
    "went",
    "doesn't",
    "j",
    "house",
  ]);

  it("keeps the top base forms in rank order, without function words or repeats", () => {
    expect(contentWords({ freq, pos, lemmas, vocab, top: 10 })).toEqual({
      words: ["go", "light", "house"],
      excluded: ["you", "the", "can", "doesn't", "j"],
    });
  });
  it("stops at `top` content words", () => {
    expect(contentWords({ freq, pos, lemmas, vocab, top: 2 }).words).toEqual([
      "go",
      "light",
    ]);
  });
  it("leaves out names", () => {
    expect(
      contentWords({
        freq,
        pos,
        lemmas,
        vocab,
        top: 10,
        names: new Set(["house"]),
      }).words,
    ).toEqual(["go", "light"]);
  });
  it("leaves out words outside the vocabulary", () => {
    expect(
      contentWords({ freq, pos, lemmas, vocab: new Set(["go"]), top: 10 })
        .words,
    ).toEqual(["go"]);
  });
});
