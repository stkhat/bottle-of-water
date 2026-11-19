import { describe, expect, it } from "vitest";
import { splitElisions, tokenize } from "./tokenize";
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

describe("splitElisions", () => {
  it("splits French elided words off the word they are joined to", () => {
    expect(splitElisions("l'homme", "fr")).toEqual(["l'", "homme"]);
    expect(splitElisions("qu’aujourd'hui", "fr")).toEqual([
      "qu’",
      "aujourd'hui",
    ]);
    expect(splitElisions("jusqu'à", "fr")).toEqual(["jusqu'", "à"]);
    expect(splitElisions("aujourd'hui", "fr")).toEqual(["aujourd'hui"]);
    expect(splitElisions("l'", "fr")).toEqual(["l'"]);
  });

  it("leaves words alone in a language without elisions", () => {
    expect(splitElisions("don't", "en")).toEqual(["don't"]);
  });
});

describe("tokenize with elisions", () => {
  const words = (text: string, whole?: (word: string) => boolean) =>
    tokenize(text, "fr", whole)
      .filter((token) => token.isWord)
      .map(({ text, start, end }) => `${text}@${start}-${end}`);

  it("gives each elided word a token of its own, with offsets", () => {
    expect(words("L'homme qu’il a vu")).toEqual([
      "L'@0-2",
      "homme@2-7",
      "qu’@8-11",
      "il@11-13",
      "a@14-15",
      "vu@16-18",
    ]);
    expect(words("j'l'ai")).toEqual(["j'@0-2", "l'@2-4", "ai@4-6"]);
  });

  it("keeps a word whole that `whole` knows, or the rest of one", () => {
    const known = (word: string) =>
      ["d'accord", "aujourd'hui"].includes(word.toLowerCase());
    expect(words("D'accord", known)).toEqual(["D'accord@0-8"]);
    expect(words("qu'aujourd'hui", known)).toEqual([
      "qu'@0-3",
      "aujourd'hui@3-14",
    ]);
  });
});

describe("tokenize with hyphenated compounds", () => {
  const words = (text: string, lang: string, known: string[]) =>
    tokenize(text, lang, (word) => known.includes(word.toLowerCase()))
      .filter((token) => token.isWord)
      .map(({ text, start, end }) => `${text}@${start}-${end}`);

  it("joins a compound `whole` knows, the longest one, and splits the others", () => {
    expect(
      words("Peut-être, c'est-à-dire est-ce", "fr", [
        "peut-être",
        "c'est-à-dire",
      ]),
    ).toEqual(["Peut-être@0-9", "c'est-à-dire@11-23", "est@24-27", "ce@28-30"]);
    expect(words("a well-known well-to-do man", "en", ["well-known"])).toEqual([
      "a@0-1",
      "well-known@2-12",
      "well@13-17",
      "to@18-20",
      "do@21-23",
      "man@24-27",
    ]);
  });

  it("keeps hyphens splitting words without `whole`", () => {
    expect(words("well-known", "en", [])).toEqual(["well@0-4", "known@5-10"]);
  });
});
