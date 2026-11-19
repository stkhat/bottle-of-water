import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capitalEntryKey, capitalMeanings } from "./capital-words.ts";
import { dottedCapitals } from "./ejdict.ts";
import { rankCapitalSenses, type SourceSense } from "./senses.ts";

const fixture = join(
  import.meta.dirname,
  "fixtures",
  "kaikki-vocabulary.jsonl",
);

describe("capitalMeanings", () => {
  it("gives the capital-only words the tables' Japanese, an acronym under its capitals", async () => {
    const meanings = await capitalMeanings(fixture, ["AED", "AI", "Tokyo"]);
    expect(meanings).toEqual({
      // AED's only translation is in Latin letters ("AED (ē-ī-dī)"): none.
      AI: [
        "人工知能",
        ["《Initialism of artificial intelligence》人工知能"],
        "n",
      ],
      tokyo: ["東京", ["《The capital city of Japan》東京"], "n"],
    });
  });
  it("keys an acronym by its capitals, another word in lower case", () => {
    expect(capitalEntryKey("AI")).toBe("AI");
    expect(capitalEntryKey("iPhone")).toBe("iphone");
    expect(capitalEntryKey("Tokyo")).toBe("tokyo");
  });
});

describe("rankCapitalSenses", () => {
  const sense = (
    order: number,
    pos: string,
    gloss: string,
    tables: number,
    target?: string,
  ): SourceSense => ({
    pos,
    gloss,
    tags: [],
    topics: [],
    categories: [],
    contraction: false,
    partial: false,
    inflection: false,
    tables,
    ja: [],
    order,
    ...(target !== undefined && { target }),
  });

  it("puts what more languages translate first, then keeps the source's order", () => {
    const cnc = [
      sense(0, "noun", "Initialism of consensual non-consent.", 0),
      sense(1, "noun", "Initialism of computer numerical control.", 1),
      sense(2, "noun", "Initialism of cellulose nanocrystal.", 0),
    ];
    expect(rankCapitalSenses(cnc).map((s) => s.order)).toEqual([1, 0, 2]);
    const ebola = [
      sense(0, "name", "A river in the Congo.", 2),
      sense(1, "noun", "The Ebola virus.", 30),
    ];
    expect(rankCapitalSenses(ebola).map((s) => s.order)).toEqual([1, 0]);
  });
});

describe("dottedCapitals", () => {
  it("lists the abbreviations with a period inside EJDict writes with capitals", () => {
    const text = [
      "U.S.,US\tUnited States 合衆国",
      "AM,A.M.,a.m.\tante meridiem 午前",
      "i.d.\tinside diameter 内径",
      "Mr.,Mr\tMister",
      "Ph.D.\tDoctor of Philosophy",
    ].join("\n");
    expect(dottedCapitals(text)).toEqual(["A.M.", "Ph.D.", "U.S."]);
  });
});
