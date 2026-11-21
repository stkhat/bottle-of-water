import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { termKeyOf, type PairSense } from "./recipe.ts";
import { recipeTags, TABLES_TAG } from "./recipes.ts";
import {
  fitsEnglishPos,
  namedTerm,
  readReverseGlosses,
  unbracketed,
  withoutOffensiveWords,
} from "./reverse-glosses.ts";
import { readReversedTables } from "./reversed-tables.ts";

const termKey = termKeyOf({
  vocab: new Set(["dog", "hound", "run", "love", "lovely", "bank", "big"]),
  lemmas: {},
  phrases: new Set(),
});
const pos = {
  dog: ["noun"],
  run: ["verb", "noun"],
  love: ["noun", "verb"],
  lovely: ["adjective"],
};
const THAI = /\p{Script=Thai}/u;

/** A kaikki file of `entries` in a fresh folder. */
function file(entries: object[]) {
  const path = join(mkdtempSync(join(tmpdir(), "reverse-")), "th.jsonl");
  writeFileSync(path, entries.map((x) => JSON.stringify(x)).join("\n"));
  return path;
}

describe("fitsEnglishPos", () => {
  const fits = fitsEnglishPos(pos);
  it("lets a native word stand for a term of its class only", () => {
    expect(fits("lovely", "noun")).toBe(false);
    expect(fits("lovely", "adverb")).toBe(true);
    expect(fits("love", "verb")).toBe(true);
    // Other parts of speech, and terms with none, fit any.
    expect(fits("dog", "classifier")).toBe(true);
    expect(fits("bank", "verb")).toBe(true);
  });
});

describe("namedTerm", () => {
  it("is the term an item names exactly, never a longer description", () => {
    expect(namedTerm(" dog.", termKey, false)).toBe("dog");
    expect(namedTerm("Dog", termKey, false)).toBe("dog");
    expect(namedTerm("to run", termKey, true)).toBe("run");
    expect(namedTerm("to run", termKey, false)).toBeUndefined();
    expect(namedTerm("a small dog", termKey, false)).toBeUndefined();
    expect(namedTerm("ไก่", termKey, false)).toBeUndefined();
  });
});

describe("unbracketed", () => {
  it("drops bracketed parts, and is empty with a bracket left open", () => {
    expect(unbracketed("dog (animal) [informal], hound")).toBe("dog, hound");
    expect(unbracketed("(of (a) dog) hound")).toBe("hound");
    expect(unbracketed("dog (animal")).toBe("");
  });
});

describe("readReverseGlosses", () => {
  it("gives a term the native words whose gloss names it, the gloss's first item first", async () => {
    const path = file([
      {
        word: "หมา",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["hound, dog"] }],
      },
      {
        word: "สุนัข",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["dog (animal)"] }],
      },
      {
        word: "วิ่ง",
        lang_code: "th",
        pos: "verb",
        senses: [{ glosses: ["to run."] }],
      },
      // A description names no term; a noun is no meaning of an adjective.
      {
        word: "ลูกหมา",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["a young dog"] }],
      },
      {
        word: "ความรัก",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["love; lovely"] }],
      },
      // No words, forms, and headwords without a Thai letter are left out.
      {
        word: "ด.",
        lang_code: "th",
        pos: "abbrev",
        senses: [{ glosses: ["dog"], tags: ["abbreviation"] }],
      },
      {
        word: "-หมา",
        lang_code: "th",
        pos: "suffix",
        senses: [{ glosses: ["dog"] }],
      },
      {
        word: "DOG",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["dog"] }],
      },
      {
        word: "ใหญ่",
        lang_code: "lo",
        pos: "adj",
        senses: [{ glosses: ["big"] }],
      },
    ]);
    const { terms } = await readReverseGlosses(path, {
      native: "th",
      termKey,
      letter: THAI,
      fits: fitsEnglishPos(pos),
    });
    expect(terms.get("dog")?.senses).toEqual([
      ["noun", "สุนัข"],
      ["noun", "หมา"],
    ]);
    expect(terms.get("hound")?.senses).toEqual([["noun", "หมา"]]);
    expect(terms.get("dog")?.senses).not.toContainEqual(["noun", "ส้นตีน"]);
    expect(terms.get("run")?.senses).toEqual([["verb", "วิ่ง"]]);
    expect(terms.get("love")?.senses).toEqual([["noun", "ความรัก"]]);
    expect(terms.has("lovely")).toBe(false);
    expect(terms.has("big")).toBe(false);
  });

  it("orders native words by frequency rank where the language has one", async () => {
    const path = file([
      {
        word: "หมา",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["dog"] }],
      },
      {
        word: "สุนัข",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["dog"] }],
      },
    ]);
    const rank = (word: string) => (word === "สุนัข" ? 1 : 2);
    const { terms } = await readReverseGlosses(path, {
      native: "th",
      termKey,
      rank,
    });
    expect(terms.get("dog")?.senses.map(([, word]) => word)).toEqual([
      "สุนัข",
      "หมา",
    ]);
  });

  it("leaves out a register or extended sense of a native word that has a plain sense", async () => {
    const path = file([
      // ร้อน is hot; its figurative "big" is no meaning of big.
      {
        word: "ร้อน",
        lang_code: "th",
        pos: "adj",
        senses: [
          { glosses: ["hot"] },
          { glosses: ["big"], tags: ["figuratively"] },
        ],
      },
      // A word with only marked senses keeps them, and so does a word glossed with the
      // term in a plain sense too.
      {
        word: "เจ๋ง",
        lang_code: "th",
        pos: "adj",
        senses: [
          { glosses: ["big"], tags: ["literary"] },
          { glosses: ["side"], tags: ["formal", "poetic"] },
        ],
      },
      {
        word: "หมา",
        lang_code: "th",
        pos: "noun",
        senses: [
          { glosses: ["dog"] },
          { glosses: ["hound"], tags: ["formal"] },
          { glosses: ["hound"] },
        ],
      },
      // An offensive sense is never a line, even a word's only one.
      {
        word: "ส้นตีน",
        lang_code: "th",
        pos: "noun",
        senses: [{ glosses: ["dog"], tags: ["vulgar"] }],
      },
      // Everyday speech is no register here: แบบ's colloquial sense stays.
      {
        word: "แบบ",
        lang_code: "th",
        pos: "adv",
        senses: [
          { glosses: ["pattern"] },
          { glosses: ["big"], tags: ["colloquial"] },
        ],
      },
    ]);
    const { terms, stats } = await readReverseGlosses(path, {
      native: "th",
      termKey,
    });
    expect(terms.get("big")?.senses).toEqual([
      ["adjective", "เจ๋ง"],
      ["adverb", "แบบ"],
    ]);
    expect(terms.get("hound")?.senses).toEqual([["noun", "หมา"]]);
    expect(terms.get("dog")?.senses).not.toContainEqual(["noun", "ส้นตีน"]);
    expect(stats.marked).toBe(1);
  });
});

describe("readReverseGlosses: Hindi's lesser senses (hi-2)", () => {
  const hiKey = termKeyOf({
    vocab: new Set(["may", "visible", "put", "down", "related", "bound"]),
    lemmas: {},
    phrases: new Set(["put down"]),
  });
  const hiPos = {
    may: ["verb"],
    visible: ["adjective"],
    put: ["verb"],
    related: ["adjective", "verb"],
  };
  const HINDI = /\p{Script=Devanagari}/u;

  it("gives a capitalised item that is another word to the capitalised headword", async () => {
    const path = file([
      {
        word: "मई",
        lang_code: "hi",
        pos: "noun",
        senses: [{ glosses: ["May"] }],
      },
      // Invented: the real entry glosses "to be able", "can", never "may", so en-hi has
      // no lowercase "may" and en-defs defines it (hi-4).
      {
        word: "सकना",
        lang_code: "hi",
        pos: "verb",
        senses: [{ glosses: ["may"] }],
      },
    ]);
    const { terms, capital } = await readReverseGlosses(path, {
      native: "hi",
      termKey: hiKey,
      letter: HINDI,
      capitalised: (written) => written === "May",
    });
    expect(terms.get("may")?.senses).toEqual([["verb", "सकना"]]);
    expect([...capital.values()][0]?.senses).toEqual([["noun", "मई"]]);
  });

  it("reads no verb's passive from a gloss that goes on from 'to be'", async () => {
    const path = file([
      {
        word: "चढ़ना",
        lang_code: "hi",
        pos: "verb",
        senses: [
          { glosses: ["to climb"] },
          { glosses: ["to be entered, put down"] },
        ],
      },
      {
        word: "जुड़ना",
        lang_code: "hi",
        pos: "verb",
        senses: [{ glosses: ["to be bound, related"] }],
      },
    ]);
    const { terms } = await readReverseGlosses(path, {
      native: "hi",
      termKey: hiKey,
      letter: HINDI,
      verbOnly: (word) => word === "put",
    });
    expect(terms.has("put down")).toBe(false);
    expect(terms.get("related")?.senses).toEqual([["verb", "जुड़ना"]]);
  });

  it("reads a word whose later sense names the term as rarer in that sense", async () => {
    const path = file([
      // लक्ष्य is mainly "aim"; its adjective's later sense is "visible".
      {
        word: "लक्ष्य",
        lang_code: "hi",
        pos: "noun",
        senses: [{ glosses: ["aim"] }],
      },
      {
        word: "लक्ष्य",
        lang_code: "hi",
        pos: "adj",
        senses: [{ glosses: ["aimed at"] }, { glosses: ["visible"] }],
      },
      {
        word: "दृश्य",
        lang_code: "hi",
        pos: "adj",
        senses: [{ glosses: ["visible"] }],
      },
    ]);
    const rank = (word: string) => (word === "लक्ष्य" ? 100 : 300);
    const { terms } = await readReverseGlosses(path, {
      native: "hi",
      termKey: hiKey,
      letter: HINDI,
      fits: fitsEnglishPos(hiPos),
      rank,
    });
    expect(terms.get("visible")?.senses.map(([, word]) => word)).toEqual([
      "दृश्य",
      "लक्ष्य",
    ]);
  });
});

describe("withoutOffensiveWords", () => {
  it("leaves out a word the native entries call offensive from a marked sense", () => {
    const terms = new Map([
      [
        "do",
        {
          short: "",
          senses: [
            ["verb", "करना"],
            ["verb", "चोदना", "(slang) to have sex with"],
          ] as PairSense[],
        },
      ],
      [
        "bullshit",
        {
          short: "",
          senses: [["noun", "चोदना", "(vulgar) nonsense"]] as PairSense[],
        },
      ],
    ]);
    expect(withoutOffensiveWords(terms, new Set(["चोदना"]))).toBe(1);
    expect(terms.get("do")?.senses).toEqual([["verb", "करना"]]);
    // A term whose every sense is so keeps them.
    expect(terms.get("bullshit")?.senses).toHaveLength(1);
  });
});

describe("readReversedTables with English rows", () => {
  it("gives an English term the native words whose tables list it, without its article or 'to'", async () => {
    const path = file([
      {
        word: "สุนัข",
        lang_code: "th",
        pos: "noun",
        senses: [],
        translations: [
          { lang_code: "en", word: "the dog" },
          { lang_code: "fr", word: "chien" },
        ],
      },
      {
        word: "วิ่ง",
        lang_code: "th",
        pos: "verb",
        senses: [{ translations: [{ lang_code: "en", word: "to run" }] }],
      },
      {
        word: "น่ารัก",
        lang_code: "th",
        pos: "verb",
        senses: [{ translations: [{ lang_code: "en", word: "lovely" }] }],
      },
      {
        word: "-หมา",
        lang_code: "th",
        pos: "suffix",
        translations: [{ lang_code: "en", word: "dog" }],
      },
    ]);
    const { terms } = await readReversedTables(
      path,
      {
        lang: "en",
        termKey,
        articles: new Set(["a", "an", "the", "to"]),
        reflexive: [],
      },
      { native: "th", letter: THAI, fits: fitsEnglishPos(pos) },
    );
    expect(terms.get("dog")?.senses).toEqual([["noun", "สุนัข"]]);
    expect(terms.get("run")?.senses).toEqual([["verb", "วิ่ง"]]);
    // A verb is no meaning of an adjective.
    expect(terms.has("lovely")).toBe(false);
  });
});

describe("recipeTags", () => {
  it("orders a recipe's sources: edition, tables, wordnets, reversed tables, reverse glosses", () => {
    expect(
      recipeTags({
        edition: { tag: "thwiktionary", file: "th.jsonl", afterTables: true },
        tables: { langCodes: ["th"] },
        wordnets: ["omw-th"],
        reversedTables: { tag: "thwiktionary-translations" },
        reverseGlosses: { tag: "enwiktionary-th", file: "kaikki-th.jsonl" },
      }),
    ).toEqual([
      TABLES_TAG,
      "thwiktionary",
      "omw-th",
      "thwiktionary-translations",
      "enwiktionary-th",
    ]);
    expect(
      recipeTags({
        edition: { tag: "eswiktionary", file: "es.jsonl" },
        tables: { langCodes: ["es"] },
      }),
    ).toEqual(["eswiktionary", TABLES_TAG]);
  });
});
