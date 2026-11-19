import { describe, expect, it } from "vitest";
import type { ContractionPack, DefsPack, PairPack } from "../packs/types";
import { expansionLine, withContractions } from "./contractions";
import { createEnJaDictionary, createPairDictionary } from "./dictionary";

const EXPANSIONS: ContractionPack = {
  "i'm": ["I am"],
  "that's": ["that is", "that has"],
  "there's": ["there is", "there has", "there does"],
  "we've": ["we have"],
  "don't": ["do not"],
};
const ENGLISH = new Set(
  ["i", "am", "that", "is", "has", "was", "there", "are", "we", "have"].concat([
    "do",
    "not",
    "does",
  ]),
);
const options = {
  expansions: (key: string) => EXPANSIONS[key] ?? [],
  english: (word: string) => ENGLISH.has(word),
};

/** English Wiktionary's definitions: a contraction's are its host's. */
const DEFS: DefsPack = {
  "we've": [
    "Excluding the person(s) being addressed. (This is the exclusive we.)",
    [
      [
        "contraction",
        "Excluding the person(s) being addressed. (This is the exclusive we.)",
      ],
    ],
  ],
};

/** As en-pl and en-ru have them (2026-11). */
const PAIR: PairPack = {
  "that's": [
    "that is",
    [
      ["contraction", "that is", null, "is"],
      ["contraction", "that has", null, "has"],
    ],
    0,
  ],
  "there's": [
    "there has",
    [
      ["contraction", "there has", null, "has"],
      ["contraction", "there are", null, "are"],
    ],
    0,
  ],
  are: ["ar, 100 m²", [["noun", "ar, 100 m²", "unit of area"]], 1],
  is: ["jest", [["verb", "jest", "be"]], 1],
  has: ["ma", [["verb", "ma", "have"]], 1],
  "don't": ["nie", [["verb", "nie", "do not"]], 1],
  loaf: ["bochenek", [["noun", "bochenek", "bread"]], 1],
};

const pair = withContractions(
  createPairDictionary({ dict: PAIR, defs: DEFS, ipa: {}, native: "pl" }),
  options,
);

describe("withContractions", () => {
  it("shows a contraction no source has by what it is short for (ru, pl I'm)", () => {
    expect(pair.entry("I'm")).toMatchObject({
      head: "i'm",
      kind: "word",
      short: "I am",
      lines: ["I am"],
      senses: [],
    });
    expect(pair.entry("I'm")).not.toHaveProperty("expansion");
  });
  it("leaves out lines that only write it out in English (pl that's)", () => {
    expect(pair.entry("that's")?.lines).toEqual(["that is / that has"]);
  });
  it("follows no pointer of a contraction (pl there's: not are's 'ar, 100 m²')", () => {
    const entry = pair.entry("there's");
    expect(entry?.lines).toEqual(["there is / there has"]);
    expect(entry?.lines.join(" ")).not.toContain("ar, 100 m²");
  });
  it("leaves out English definitions, which are its host's (we've)", () => {
    expect(pair.entry("we've")).toMatchObject({
      short: "we have",
      lines: ["we have"],
      senses: [],
    });
    expect(pair.entry("we've")).not.toHaveProperty("glossLang");
  });
  it("keeps its own native meaning and names what it is short for (pl don't)", () => {
    expect(pair.entry("don't")).toMatchObject({
      short: "nie",
      lines: ["nie"],
      expansion: "do not",
    });
    expect(pair.entry("don't")?.senses).toHaveLength(1);
  });
  it("leaves other words as they are", () => {
    const plain = createPairDictionary({ dict: PAIR, defs: DEFS, ipa: {} });
    expect(pair.entry("loaf")).toEqual(plain.entry("loaf"));
    expect(pair.entry("is")).toEqual(plain.entry("is"));
    expect(pair.entry("nothing")).toBeUndefined();
  });

  describe("over EJDict (ja)", () => {
    const ja = withContractions(
      createEnJaDictionary({
        dict: {
          "i'm": ["I amの短縮形", ["I amの短縮形"]],
          "that's": ["that is の短縮形", ["that is の短縮形"]],
          "that is": ["つまり,すなわち", ["つまり,すなわち"]],
        },
        sensePos: {},
        capital: {},
        phrases: {},
        defs: {},
        pos: {},
        ipa: {},
      }),
      options,
    );
    it("gives no note where its line writes the expansion out (I amの短縮形)", () => {
      expect(ja.entry("I'm")).toMatchObject({ lines: ["I amの短縮形"] });
      expect(ja.entry("I'm")).not.toHaveProperty("expansion");
    });
    it("shows no line followed from its pointer (that's: not つまり)", () => {
      expect(ja.entry("that's")?.lines).toEqual(["that is の短縮形"]);
    });
  });
});

describe("expansionLine", () => {
  it("names the first two expansions", () => {
    expect(expansionLine(["I am"])).toBe("I am");
    expect(expansionLine(["there is", "there has", "there does"])).toBe(
      "there is / there has",
    );
  });
});
