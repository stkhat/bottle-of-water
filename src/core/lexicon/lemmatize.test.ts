import type { LemmaShards } from "../packs/types";
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
  it("reads a word the segmenter cut before its last period with that period", () => {
    const dotted = new Set(["u.s.", "p.m.", "ph.d.", "i.d.", "us"]);
    // How the vocabulary writes the ones with capitals.
    const written = new Map([
      ["u.s.", ["U.S."]],
      ["ph.d.", ["Ph.D."]],
    ]);
    expect(lemmatize("U.S", {}, dotted, written)).toEqual(["u.s."]);
    expect(lemmatize("p.m", {}, dotted, written)).toEqual(["p.m."]);
    expect(lemmatize("Ph.D", {}, dotted, written)).toEqual(["ph.d."]);
    expect(lemmatize("boot.dev", {}, dotted, written)).toEqual([]);
    // Its case matters: "i.d." is inside diameter, not "I.D." (identification).
    expect(lemmatize("i.d", {}, dotted, written)).toEqual(["i.d."]);
    expect(lemmatize("I.D", {}, dotted, written)).toEqual([]);
    expect(lemmatize("U.S", {}, dotted)).toEqual([]);
    // A word with no period inside is not an abbreviation for it ("Jan." ends a sentence).
    expect(lemmatize("US", {}, dotted)).toEqual(["us"]);
    expect(lemmatize("Jan", {}, new Set(["jan."]))).toEqual([]);
  });
  it("knows a capital-only word where it is written as such, with its forms", () => {
    const capitals = new Map([
      ["ai", ["AI"]],
      ["grammy", ["Grammy"]],
    ]);
    const forms = { grammys: "grammy", ais: "ai" };
    expect(lemmatize("AI", forms, vocab, capitals)).toEqual(["ai"]);
    expect(lemmatize("AIs", forms, vocab, capitals)).toEqual(["ai"]);
    expect(lemmatize("AI's", forms, vocab, capitals)).toEqual(["ai"]);
    expect(lemmatize("Grammys", forms, vocab, capitals)).toEqual(["grammy"]);
    expect(lemmatize("ai", forms, vocab, capitals)).toEqual([]);
    expect(lemmatize("Ai", forms, vocab, capitals)).toEqual([]);
    expect(lemmatize("AIS", forms, vocab, capitals)).toEqual([]);
    expect(lemmatize("grammys", forms, vocab, capitals)).toEqual([]);
  });
  it("reads a lemma table in shards", () => {
    const shards: LemmaShards = [
      { better: ["good", "well"] },
      { left: "leave" },
    ];
    expect(lemmatize("better", shards, vocab)).toEqual(["good", "well"]);
    expect(lemmatize("left", shards, vocab)).toEqual(["left", "leave"]);
    expect(lemmatize("loaves", shards, vocab)).toEqual([]);
  });
});
