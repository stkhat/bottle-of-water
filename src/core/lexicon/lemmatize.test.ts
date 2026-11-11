import { describe, expect, it } from "vitest";
import { lemmatize } from "./lemmatize";

const lemmas = { loaves: "loaf", better: ["good", "well"], left: "leave" };
const vocab = new Set([
  "loaf",
  "good",
  "well",
  "left",
  "leave",
  "mark",
  "it's",
]);

describe("lemmatize", () => {
  it("returns the base of an inflected form", () => {
    expect(lemmatize("loaves", lemmas, vocab)).toEqual(["loaf"]);
  });
  it("returns every base of a form with several", () => {
    expect(lemmatize("better", lemmas, vocab)).toEqual(["good", "well"]);
  });
  it("returns a vocabulary word first, then its bases", () => {
    expect(lemmatize("left", lemmas, vocab)).toEqual(["left", "leave"]);
    expect(lemmatize("loaf", lemmas, vocab)).toEqual(["loaf"]);
  });
  it("lowercases the form", () => {
    expect(lemmatize("Loaves", lemmas, vocab)).toEqual(["loaf"]);
  });
  it("treats ’ like '", () => {
    expect(lemmatize("it’s", lemmas, vocab)).toEqual(["it's"]);
  });
  it("strips a trailing possessive 's", () => {
    expect(lemmatize("Mark's", lemmas, vocab)).toEqual(["mark"]);
    expect(lemmatize("mark’s", lemmas, vocab)).toEqual(["mark"]);
  });
  it("returns nothing for an unknown word", () => {
    expect(lemmatize("zzyzx", lemmas, vocab)).toEqual([]);
    expect(lemmatize("zzyzx's", lemmas, vocab)).toEqual([]);
  });
});
