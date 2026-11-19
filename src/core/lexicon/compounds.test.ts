import { describe, expect, it } from "vitest";
import { COMPOUND_RULES, splitCompound, type CompoundWords } from "./compounds";

/** A tiny German: word → [its bases, likeliest first]; each base's parts of speech. */
const FORMS: Record<string, readonly string[]> = {
  bahn: ["bahn"],
  system: ["system"],
  systeme: ["system"],
  verdauung: ["verdauung"],
  enzym: ["enzym"],
  enzyme: ["enzym"],
  bund: ["bund"],
  bundes: ["bund"],
  präsident: ["präsident"],
  schreiben: ["schreiben"],
  tisch: ["tisch"],
  schule: ["schule"],
  buch: ["buch"],
  welt: ["welt"],
  klima: ["klima"],
  konferenz: ["konferenz"],
  lösung: ["lösung"],
  angeboten: ["angeboten", "anbieten", "angebot"],
  summen: ["summen"],
  ende: ["ende"],
  les: ["lesen"],
  eil: ["eilen"],
  hell: ["hell"],
  blau: ["blau"],
  euren: ["euer"],
  opa: ["opa"],
};
const POS: Record<string, readonly string[]> = {
  bahn: ["noun"],
  system: ["noun"],
  verdauung: ["noun"],
  enzym: ["noun"],
  bund: ["noun"],
  präsident: ["noun"],
  schreiben: ["verb", "noun"],
  tisch: ["noun"],
  schule: ["noun"],
  buch: ["noun"],
  welt: ["noun"],
  klima: ["noun"],
  konferenz: ["noun"],
  lösung: ["noun"],
  angeboten: ["adjective"],
  anbieten: ["verb"],
  angebot: ["noun"],
  summen: ["verb"],
  ende: ["noun"],
  lesen: ["noun", "verb"],
  eilen: ["verb"],
  hell: ["adjective"],
  blau: ["adjective"],
  euer: ["determiner"],
  opa: ["noun"],
};
const words: CompoundWords = {
  lemmas: (word) => FORMS[word] ?? [],
  partsOfSpeech: (word) => POS[word] ?? [],
};
const split = (word: string, noun = true) =>
  splitCompound(word, words, COMPOUND_RULES.de!, noun);

describe("splitCompound (German)", () => {
  it("reads a word as a known modifier and its longest known head", () => {
    expect(split("bahnsystem")).toEqual({
      key: "bahnsystem",
      parts: ["bahn", "system"],
      noun: true,
    });
    // Keyed by the head's base: an inflected compound is its base's form.
    expect(split("bahnsysteme")).toEqual({
      key: "bahnsystem",
      parts: ["bahn", "system"],
      noun: true,
    });
  });
  it("reads linking elements, verb stems, a dropped e and compound modifiers", () => {
    expect(split("verdauungsenzyme")?.parts).toEqual(["verdauung", "enzym"]);
    expect(split("bundespräsident")?.parts).toEqual(["bund", "präsident"]);
    expect(split("schreibtisch")?.parts).toEqual(["schreiben", "tisch"]);
    expect(split("schulbuch")?.parts).toEqual(["schule", "buch"]);
    expect(split("weltklimakonferenz")?.parts).toEqual([
      "welt",
      "klima",
      "konferenz",
    ]);
  });
  it("reads a verb by its stem only, and a stem that is also a noun as the more frequent", () => {
    // A tiny German with ranks: "sprach" is sprechen's past, "schul" schulen's
    // imperative; Sprache, Schule and messen are the more frequent.
    const more: Record<string, readonly string[]> = {
      ...FORMS,
      sprach: ["sprechen"],
      sprache: ["sprache"],
      kurs: ["kurs"],
      schul: ["schulen"],
      mess: [],
      messe: ["messe"],
      zahl: ["zahl"],
    };
    const morePos: Record<string, readonly string[]> = {
      ...POS,
      sprechen: ["verb"],
      sprache: ["noun"],
      kurs: ["noun"],
      schulen: ["verb"],
      messen: ["verb"],
      messe: ["noun"],
      zahl: ["noun"],
    };
    const ranks: Record<string, number> = {
      sprechen: 234,
      sprache: 1324,
      schule: 363,
      schulen: 13977,
      messen: 3776,
      messe: 5336,
    };
    const ranked: CompoundWords = {
      lemmas: (word) => (word === "messen" ? ["messen"] : (more[word] ?? [])),
      partsOfSpeech: (word) => morePos[word] ?? [],
      rank: (base) => ranks[base] ?? Infinity,
    };
    const parts = (word: string) =>
      splitCompound(word, ranked, COMPOUND_RULES.de!, true)?.parts;
    expect(parts("sprachkurs")).toEqual(["sprache", "kurs"]);
    expect(parts("schulbuch")).toEqual(["schule", "buch"]);
    expect(parts("messzahl")).toEqual(["messen", "zahl"]);
    expect(parts("schreibtisch")).toEqual(["schreiben", "tisch"]);
  });
  it("takes a capitalised word's noun base for its head", () => {
    expect(split("lösungsangeboten")).toMatchObject({
      key: "lösungsangebot",
      parts: ["lösung", "angebot"],
    });
  });
  it("says whether the head is a noun", () => {
    expect(split("hellblau", false)).toMatchObject({
      parts: ["hell", "blau"],
      noun: false,
    });
    // The classifier leaves a noun written in lower case unknown in a document that
    // capitalises its nouns ("summende" is the participle there).
    expect(split("summende", false)).toMatchObject({
      parts: ["summen", "ende"],
      noun: true,
    });
  });
  it("takes no function word for a modifier, nor a verb's stem for a head", () => {
    expect(split("europa")).toBeUndefined();
    expect(split("eilles")).toBeUndefined();
  });
  it("leaves short and unknown words alone", () => {
    expect(split("bahn")).toBeUndefined();
    expect(split("xyzsystem")).toBeUndefined();
    expect(split("bahn-system")).toBeUndefined();
  });
});
