import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeSources,
  readEdition,
  readTranslationTables,
  termKeyOf,
  withoutStressMarks,
  type SourceTerm,
} from "./recipe.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const termKey = termKeyOf({
  vocab: new Set(["light", "upset", "give", "up"]),
  lemmas: { lights: "light" },
  phrases: new Set(["give up"]),
});

describe("withoutStressMarks", () => {
  it("drops the stress marks over Cyrillic letters, as natives write", () => {
    expect(withoutStressMarks("де\u0301ньги")).toBe("деньги");
    expect(withoutStressMarks("бро\u0301сить pf")).toBe("бросить pf");
    expect(withoutStressMarks("ёлка")).toBe("ёлка");
    expect(withoutStressMarks("й")).toBe("й");
    // A grave marks secondary stress: "ѝ" is one code point, a stressed и.
    expect(withoutStressMarks("\u045dдол")).toBe("идол");
  });
  it("keeps a mark that makes a letter, and accents in Latin text", () => {
    expect(withoutStressMarks("\u0453")).toBe("\u0453"); // Macedonian ѓ
    expect(withoutStressMarks("ге\u0301")).toBe("ге");
    expect(withoutStressMarks("e\u0301te\u0301")).toBe("\u00e9t\u00e9");
    expect(withoutStressMarks("été")).toBe("été");
  });
});

describe("termKeyOf", () => {
  it("keys a lowercase vocabulary word as it is", () => {
    expect(termKey("light")).toBe("light");
  });
  it("skips a capitalized headword (a name), an inflected form and an unknown word", () => {
    expect(termKey("Light")).toBeUndefined();
    expect(termKey("lights")).toBeUndefined();
    expect(termKey("zzyzx")).toBeUndefined();
  });
  it("keys a multi-word headword by its pattern key when it is a known phrase", () => {
    expect(termKey("Give  up")).toBe("give up");
    expect(termKey("give in")).toBeUndefined();
  });
});

describe("readEdition", () => {
  it("reads the edition's English entries: senses in the native language, each once, no single-word proper nouns", async () => {
    const { terms, stats } = await readEdition(
      join(FIXTURES, "edition-pt.jsonl"),
      termKey,
    );
    expect(Object.fromEntries(terms)).toEqual({
      light: {
        short: "leve",
        senses: [
          ["adjective", "leve"],
          ["adjective", "claro; luminoso"],
          ["noun", "luz"],
        ],
      },
      "give up": {
        short: "desistir",
        senses: [
          ["verb", "desistir"],
          ["proper noun", "nome de um lugar"],
        ],
      },
      upset: {
        short: "Chatear",
        senses: [
          ["verb", "Chatear."],
          ["verb", "Fazer algo. Depois outra coisa."],
        ],
      },
    });
    expect(stats).toEqual({ entries: 10, unparsable: 1 });
  });

  it("drops the period ending a one-sentence gloss with `trimPeriod`", async () => {
    const { terms } = await readEdition(
      join(FIXTURES, "edition-pt.jsonl"),
      termKey,
      { trimPeriod: true },
    );
    expect(terms.get("upset")?.senses).toEqual([
      ["verb", "Chatear"],
      ["verb", "Fazer algo. Depois outra coisa."],
    ]);
  });
});

describe("readTranslationTables", () => {
  it("groups each English entry's translations by sense, with the sense as a hint", async () => {
    const { terms } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      { langCodes: ["pt"], termKey },
    );
    expect(Object.fromEntries(terms)).toEqual({
      light: {
        short: "luz",
        senses: [
          ["noun", "luz", "electromagnetic radiation"],
          ["noun", "luz, lâmpada, lanterna", "source of illumination"],
          ["adjective", "leve", "having little weight"],
          ["adjective", "claro", "Pale in colour"],
        ],
      },
      upset: {
        short: "chatear",
        senses: [["verb", "chatear", "to make unhappy"]],
      },
      "give up": {
        short: "render-se",
        senses: [["verb", "render-se", "to surrender"]],
      },
    });
  });
  it("rewrites or drops a translated word with `word`", async () => {
    const { terms } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      {
        langCodes: ["pt"],
        termKey,
        word: (w) => (w === "luz" ? undefined : w.toUpperCase()),
      },
    );
    expect(terms.get("light")?.senses[0]).toEqual([
      "noun",
      "LÂMPADA, LANTERNA, FAROL",
      "source of illumination",
    ]);
  });
});

describe("mergeSources", () => {
  it("takes each term from the first source that has it and records that source", () => {
    const edition = new Map<string, SourceTerm>([
      ["light", { short: "leve", senses: [["adjective", "leve"]] }],
    ]);
    const tables = new Map<string, SourceTerm>([
      ["light", { short: "luz", senses: [["noun", "luz", "radiation"]] }],
      ["upset", { short: "chatear", senses: [["verb", "chatear", "unhappy"]] }],
    ]);
    expect(
      mergeSources([
        { tag: "ptwiktionary", terms: edition },
        { tag: "enwiktionary-translations", terms: tables },
      ]),
    ).toEqual({
      dict: {
        light: ["leve", [["adjective", "leve"]], 0],
        upset: ["chatear", [["verb", "chatear", "unhappy"]], 1],
      },
      sources: ["ptwiktionary", "enwiktionary-translations"],
      counts: { ptwiktionary: 1, "enwiktionary-translations": 1 },
    });
  });
});
