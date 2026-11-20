import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capitalEntryKey,
  capitalMeanings,
  tableMeanings,
} from "./capital-words.ts";
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

describe("tableMeanings", () => {
  const abbreviations = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-abbreviations.jsonl",
  );
  it("gives an abbreviation the Japanese of what it stands for, hinted by that", async () => {
    const meanings = await tableMeanings(abbreviations, [
      { key: "GPU", written: "GPU", capital: true },
      { key: "HR", written: "HR", capital: true },
    ]);
    expect(meanings).toEqual({
      GPU: ["画像処理装置", ["《graphics processing unit》画像処理装置"], "n"],
      // A sense under a parent gloss that names what it abbreviates.
      HR: ["人事", ["《human resources》人事"], "n"],
    });
  });
  it("reads a lower-case word's own entries, not a proper noun written alike", async () => {
    expect(
      await tableMeanings(abbreviations, [
        { key: "hitman", written: "hitman", capital: false },
      ]),
    ).toEqual({ hitman: ["殺し屋", ["《A hired killer》殺し屋"], "n"] });
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
