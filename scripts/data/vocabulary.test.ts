import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { importKaikki } from "./kaikki.ts";
import { createVocabularyRule } from "./vocabulary.ts";

// The first entry's examples are the corpus; the others are the headwords.
const fixture = join(
  import.meta.dirname,
  "fixtures",
  "kaikki-vocabulary.jsonl",
);
const vocab = ["story", "the", "and", "a", "base", "year", "god", "under"];
const withRule = (options?: Parameters<typeof createVocabularyRule>[1]) =>
  importKaikki(
    fixture,
    [...vocab, "come", "came"],
    {},
    createVocabularyRule(undefined, { minExamples: 5, ...options }),
  );

describe("rule E: the vocabulary from the example corpus", () => {
  let result: Awaited<ReturnType<typeof importKaikki>>;
  beforeAll(async () => {
    result = await withRule();
  });

  it("adds headwords written in lower case at least five times in other entries' examples", () => {
    expect(result.added).toEqual(["app", "joey", "omg", "um", "website"]);
  });
  it("counts a word with its inflected forms, but not its own examples", () => {
    // app 5 times and apps once; "I love this app." is app's own example.
    expect(result.examples.app).toBe(6);
  });
  it("collects the new words like vocabulary words", () => {
    expect(result.pos.app).toEqual(["noun"]);
    expect(result.ipa.app).toBe("/æp/");
    expect(result.lemmas.apps).toBe("app");
    expect(result.pos.um).toEqual(["interjection"]);
  });
  it("leaves out words written fewer times, and a form's count to another word ('coom' lists 'came')", () => {
    expect(result.added).not.toContain("zyzzyva");
    expect(result.added).not.toContain("coom");
  });
  it("leaves out forms the vocabulary has, inflections and possessives", () => {
    for (const word of ["based", "years", "god's"])
      expect(result.added).not.toContain(word);
  });
  it("leaves out words whose only senses are obsolete", () => {
    expect(result.added).not.toContain("trie");
  });
  it("does not count quotations from before 1900", async () => {
    expect(result.added).not.toContain("vnder");
    expect((await withRule({ since: 1600 })).added).toContain("vnder");
  });
  it("leaves out a word the examples write more often as an acronym, unless its entry is that acronym", () => {
    expect(result.added).not.toContain("ai");
    expect(result.added).toContain("omg");
  });
  it("takes a common word that is also a name, and lists it as a name", () => {
    expect(result.added).toContain("joey");
    expect(result.names.joey).toBe("g");
  });
  it("counts every vocabulary word for the frequency list", () => {
    expect(result.examples.came).toBe(6);
    expect(result.examples.website).toBe(5);
    // based, the form of base.
    expect(result.examples.base).toBe(5);
  });
  it("asks for eight examples by default", async () => {
    const result = await importKaikki(
      fixture,
      vocab,
      {},
      createVocabularyRule(),
    );
    expect(result.added).toEqual([]);
  });
  it("takes its threshold as an option", async () => {
    expect((await withRule({ minExamples: 6 })).added).toEqual(["app"]);
  });
});

describe("importKaikki without rule E", () => {
  it("keeps the vocabulary it is given", async () => {
    const result = await importKaikki(fixture, vocab);
    expect(result.added).toEqual([]);
    expect(result.examples).toEqual({});
    expect(result.pos).not.toHaveProperty("app");
  });
});
