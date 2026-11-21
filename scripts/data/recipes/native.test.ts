import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeShards } from "../common.ts";
import { devanagariSpelling } from "../../../src/core/natives.ts";
import {
  alternativeSpelling,
  buildPairDictionary,
  byFrequency,
  spellingsOf,
  withInflections,
  withPointerPos,
} from "./native.ts";
import { TABLES_TAG } from "./recipes.ts";
import {
  lesserLowercase,
  tableCoverage,
  termKeyOf,
  type PairSense,
} from "./recipe.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const termKey = termKeyOf({
  vocab: new Set(["light", "upset", "give", "up"]),
  lemmas: {},
  phrases: new Set(["give up"]),
});

describe("buildPairDictionary", () => {
  it("takes terms from the edition first, then from the translation tables", async () => {
    // The fixture edition stands in for the Spanish one; the tables give "upset" in es.
    const result = await buildPairDictionary("es", {
      termKey,
      rawDir: FIXTURES,
      englishPath: join(FIXTURES, "tables-en.jsonl"),
    });
    expect(result.sources).toEqual(["eswiktionary", TABLES_TAG]);
    expect(result.dict["light"]?.[2]).toBe(0);
    expect(result.dict["upset"]).toEqual([
      "molestar",
      [["verb", "molestar", "to make unhappy"]],
      1,
    ]);
    expect(result.counts).toEqual({ eswiktionary: 2, [TABLES_TAG]: 1 });
    expect(result.stats).toMatchObject({ unparsable: 1, terms: 3 });
  });
  it("keeps capitalised headwords apart, from the same sources in the same order", async () => {
    const build = (names = {}) =>
      buildPairDictionary("es", {
        termKey,
        rawDir: FIXTURES,
        englishPath: join(FIXTURES, "tables-en.jsonl"),
        names,
      });
    const { capital, dict, stats } = await build();
    expect(capital).toEqual({
      Light: [
        "sobrenome",
        [
          ["proper noun", "sobrenome"],
          ["proper noun", "apelido"],
        ],
        0,
        "word",
      ],
      Upset: ["Revés", [["proper noun", "Revés", "village"]], 1, "name"],
    });
    // No lowercase copies: "upset" is the tables' verb.
    expect(dict["upset"]?.[0]).toBe("molestar");
    expect(stats.capitals).toEqual({
      classSenses: 0,
      personSenses: 0,
      word: 1,
      name: 1,
      none: 0,
    });
    // A surname first: "sobrenome" is a use of the name, not what Light means.
    expect((await build({ light: "sx" })).capital["Light"]?.[3]).toBe(
      undefined,
    );
  });
  it("builds a recipe without an edition from the tables, then its wordnets", async () => {
    const result = await buildPairDictionary("pt", {
      termKey: termKeyOf({
        vocab: new Set(["light", "upset", "give", "up", "bank"]),
        lemmas: {},
        phrases: new Set(["give up"]),
      }),
      rawDir: FIXTURES,
      englishPath: join(FIXTURES, "tables-en.jsonl"),
      recipe: { tables: { langCodes: ["pt"] }, wordnets: ["omw-it"] },
    });
    expect(result.sources).toEqual([TABLES_TAG, "omw-it"]);
    // The tables have light, upset and give up; only bank comes from the wordnet.
    expect(result.counts).toEqual({ [TABLES_TAG]: 3, "omw-it": 1 });
    expect(result.dict["light"]?.[0]).toBe("luz");
    expect(result.dict["bank"]?.slice(0, 1)).toEqual(["riva"]);
    expect(result.dict["bank"]?.[2]).toBe(1);
    expect(result.stats).toMatchObject({ unparsable: 0, terms: 4 });
  });
  it("puts an edition after the tables when its recipe says so: it fills only what they lack", async () => {
    const result = await buildPairDictionary("es", {
      termKey,
      rawDir: FIXTURES,
      englishPath: join(FIXTURES, "tables-en.jsonl"),
      recipe: {
        edition: {
          tag: "eswiktionary",
          file: "kaikki-es-edition.jsonl",
          afterTables: true,
        },
        tables: { langCodes: ["es"] },
      },
    });
    expect(result.sources).toEqual([TABLES_TAG, "eswiktionary"]);
    // The tables have light and upset; the edition gives only "give up".
    expect(result.dict["upset"]?.[2]).toBe(0);
    expect(result.dict["light"]?.[0]).toBe("luz");
    expect(result.dict["give up"]?.[2]).toBe(1);
    expect(result.counts).toEqual({ [TABLES_TAG]: 2, eswiktionary: 1 });
  });
  it("writes a simplified recipe in simplified characters: the rows' simplified form, the rest converted", async () => {
    const result = await buildPairDictionary("zh", {
      termKey,
      rawDir: FIXTURES,
      englishPath: join(FIXTURES, "tables-en.jsonl"),
      recipe: {
        tables: { langCodes: ["cmn", "zh"], langs: ["Chinese Mandarin"] },
        simplified: true,
      },
    });
    expect(result.dict["light"]).toEqual([
      "光",
      [
        ["noun", "光", "electromagnetic radiation"],
        // "燈 /灯" gives its simplified form, "燈光" is converted.
        ["noun", "灯, 灯光", "source of illumination"],
      ],
      0,
    ]);
  });
  describe("words English capitalises, and terms' main parts of speech", () => {
    const orderKey = termKeyOf({
      vocab: new Set(["january", "better", "english"]),
      lemmas: {},
      phrases: new Set(),
    });
    const build = (native: string, pos = {}) =>
      buildPairDictionary(native, {
        termKey: orderKey,
        rawDir: FIXTURES,
        englishPath: join(FIXTURES, "tables-order.jsonl"),
        recipe: {
          edition: {
            tag: `${native}wiktionary`,
            file: "edition-uncased.jsonl",
          },
          tables: { langCodes: [native] },
        },
        pos,
      });
    it("leaves out an edition's lowercase entry of a word English writes only capitalised", async () => {
      // ru "january" → январский: English writes the month January.
      const { dict, capital, stats } = await build("ru");
      expect(dict["january"]).toBeUndefined();
      expect(capital["January"]?.[0]).toBe("январь");
      expect(stats.uncased).toEqual(["january"]);
    });
    it("takes a term from the tables when the edition has no meaning in its main part of speech", async () => {
      // pl better: the edition's verb only; the tables' most translated sense, an
      // adjective, is English Wiktionary's first part of speech too.
      const { dict, stats } = await build("pl", {
        better: ["adjective", "verb"],
      });
      expect(dict["better"]?.[0]).toBe("lepszy");
      expect(stats.lacking).toEqual(["better"]);
      // Where English Wiktionary lists another part of speech first, the edition stays.
      expect(
        (await build("pl", { better: ["verb", "adjective"] })).dict["better"],
      ).toEqual(["poprawić, ulepszyć", [["verb", "poprawić, ulepszyć"]], 0]);
    });
  });
  it("knows a lowercase headword English uses far less than the capitalised one", () => {
    const coverage = new Map([
      ["French", 180],
      ["french", 4],
      ["China", 224],
      ["china", 17],
      ["Numbers", 88],
      ["Rose", 40],
    ]);
    // french, to cut in strips: 4 languages against 180.
    expect(lesserLowercase("french", coverage, {})).toBe(true);
    // china, porcelain: a use of its own (17 against 224).
    expect(lesserLowercase("china", coverage, {})).toBe(false);
    // An inflected form's tables are its base's.
    expect(lesserLowercase("numbers", coverage, { numbers: "number" })).toBe(
      false,
    );
    // A capitalised headword translated into few languages says nothing.
    expect(lesserLowercase("rose", coverage, {})).toBe(false);
  });
  it("gives a pointer sense with no part of speech the word's main one in English", () => {
    const dict: Parameters<typeof withPointerPos>[0] = {
      could: [
        "Präteritum des Hilfsverbs can",
        [["unknown", "Präteritum des Hilfsverbs can", null, "can"]],
        1,
      ],
      can: ["können", [["unknown", "können"]], 0],
    };
    expect(
      withPointerPos(dict, { could: ["verb", "noun"], can: ["verb"] }),
    ).toBe(1);
    expect(dict.could![1]).toEqual([
      ["verb", "Präteritum des Hilfsverbs can", null, "can"],
    ]);
    // Only pointers.
    expect(dict.can![1]).toEqual([["unknown", "können"]]);
  });
  it("refuses a native language without a recipe", async () => {
    await expect(buildPairDictionary("xx", { termKey })).rejects.toThrow(
      "No recipe for en-xx",
    );
  });
});

describe("writeShards", () => {
  it("writes the shards and an index naming the sources", () => {
    const dir = mkdtempSync(join(tmpdir(), "pair-pack-"));
    writeShards("en-es", { luz: ["luz", [["noun", "luz"]], 0] }, dir, {
      sources: ["eswiktionary"],
    });
    expect(
      JSON.parse(readFileSync(join(dir, "en-es", "index.json"), "utf8")),
    ).toEqual({
      shards: [{ file: "dict-1.json", first: "luz", last: "luz" }],
      sources: ["eswiktionary"],
    });
  });
  it("writes capitalised headwords to capital.json, listed first", () => {
    const dir = mkdtempSync(join(tmpdir(), "pair-pack-"));
    const japan = ["Japón", [["proper noun", "Japón"]], 0, "name"];
    writeShards(
      "en-es",
      { luz: ["luz", [["noun", "luz"]], 0] },
      dir,
      { sources: ["eswiktionary"] },
      { Japan: japan },
    );
    const read = (file: string) =>
      JSON.parse(readFileSync(join(dir, "en-es", file), "utf8")) as unknown;
    expect(read("index.json")).toEqual({
      shards: [
        { file: "capital.json", first: "Japan", last: "Japan" },
        { file: "dict-1.json", first: "luz", last: "luz" },
      ],
      sources: ["eswiktionary"],
    });
    expect(read("capital.json")).toEqual({ Japan: japan });
  });
});

describe("spellingsOf (hi-4)", () => {
  it("pairs the spellings an entry links, and lists the headwords", async () => {
    const { heads, same } = await spellingsOf(
      join(FIXTURES, "kaikki-hi-spellings.jsonl"),
      "hi",
      devanagariSpelling,
    );
    // खबर: "nuqtaless form of ख़बर".
    expect(same.has("ख़बर\tखबर") || same.has("खबर\tख़बर")).toBe(true);
    // ज़ाती, "inherent", is not जाती, "goes": no entry links them.
    expect(same.size).toBe(1);
    expect(heads.has("जाती")).toBe(true);
    // मुकदमा has no entry: it is only मुक़दमा spelled without the nukta.
    expect(heads.has("मुकदमा")).toBe(false);
  });
});

describe("tableCoverage", () => {
  it("counts the languages of an entry's most translated sense", () => {
    const row = (lang_code: string, sense?: string) => ({
      lang_code,
      word: "x",
      ...(sense && { sense }),
    });
    expect(
      tableCoverage({
        word: "may",
        pos: "verb",
        lang_code: "en",
        senses: [
          {
            glosses: ["To have permission to."],
            translations: [row("fr"), row("de")],
          },
        ],
        translations: [
          row("fr", "month"),
          row("de", "month"),
          row("es", "month"),
        ],
      } as Parameters<typeof tableCoverage>[0]),
    ).toBe(3);
  });
});

describe("alternativeSpelling (ar-2)", () => {
  const ranks: Record<string, number> = {
    إنجليزي: 900,
    إنكليزي: 4000,
    موسيقى: 700,
  };
  const rank = (word: string) => ranks[word] ?? Infinity;
  it("shows an alternative spelling as its main one when that one is no rarer", () => {
    const shown = alternativeSpelling(
      new Map([
        ["إِنْكِلِيزِيّ", "إِنْجْلِيزِيّ"],
        ["موسيقا", "موسيقى"],
        // The main spelling is rarer: the alternative stays.
        ["إنجليزي", "إنقليزي"],
      ]),
      rank,
      (text) => text.replace(/[\u064B-\u0652]/gu, ""),
    );
    expect(shown("إنكليزي, موسيقا")).toBe("إنجليزي, موسيقى");
    expect(shown("إنجليزي")).toBe("إنجليزي");
  });
});

describe("byFrequency (id-2)", () => {
  const ranks: Record<string, number> = {
    si: 305,
    sang: 603,
    itu: 6,
    sebuah: 118,
    seorang: 84,
  };
  const ordered = byFrequency((word) => ranks[word] ?? Infinity);
  it("puts a line's words in order of frequency, a step of four ranks apart", () => {
    expect(ordered("si, sang, itu")).toBe("itu, si, sang");
    // 118 and 84 are in the same step: the order stays.
    expect(ordered("sebuah, seorang")).toBe("sebuah, seorang");
    // A word the list lacks goes last.
    expect(ordered("refleksi, itu")).toBe("itu, refleksi");
  });
  it("leaves a line with a phrase as it is", () => {
    expect(ordered("tidak pernah, itu")).toBe("tidak pernah, itu");
  });
  it("orders a phrase by its rarest word, two steps rarer per word, where the language says many words so (tr-2)", () => {
    const tr: Record<string, number> = {
      bir: 1,
      zamanlar: 838,
      o: 8,
      zaman: 37,
      öğretmek: 12387,
      ders: 1285,
      vermek: 641,
      ocak: 6361,
      büyük: 79,
      ay: 359,
    };
    const rank = (text: string) =>
      Math.max(...text.split(" ").map((word) => tr[word] ?? Infinity));
    const phrases = byFrequency(rank, undefined, { phrases: true });
    expect(phrases("bir zamanlar, o zaman")).toBe("o zaman, bir zamanlar");
    // Two steps more for the phrase's second word: ders (1285) is a step from öğretmek.
    expect(phrases("öğretmek, ders vermek")).toBe("öğretmek, ders vermek");
    // January's "great month" (ay, 359) does not pass the month's name (6361).
    expect(phrases("ocak, büyük ay")).toBe("ocak, büyük ay");
    // A space before a comma is the source's, not the word's.
    expect(phrases("bir zamanlar , o zaman")).toBe("o zaman, bir zamanlar");
    // An item of three words describes: it goes after the words.
    expect(phrases("bir zamanlar o zaman, zaman")).toBe(
      "zaman, bir zamanlar o zaman",
    );
  });
});

describe("withInflections (id-2)", () => {
  it("gives an inflection with no entry its base's sense of the same part of speech", () => {
    const dict: Record<string, [string, PairSense[], number]> = {
      this: [
        "ini",
        [
          ["adverb", "begini"],
          ["determiner", "ini"],
        ],
        0,
      ],
      that: ["itu", [["determiner", "itu"]], 0],
      hade: ["x", [["noun", "x"]], 0],
    };
    const formOf = new Map([
      ["these", { target: "this", pos: "determiner", gloss: "plural of this" }],
      ["those", { target: "that", pos: "pronoun", gloss: "plural of that" }],
      // Lemmatised, capitalised in English, or with no base: left alone.
      ["went", { target: "that", pos: "verb", gloss: "past of go" }],
      ["hades", { target: "hade", pos: "noun", gloss: "plural of hade" }],
      ["oxen", { target: "ox", pos: "noun", gloss: "plural of ox" }],
    ]);
    const added = withInflections(dict, formOf, {
      lemmatised: (key) => key === "went",
      capitalised: (key) => key === "hades",
    });
    expect(added).toBe(2);
    expect(dict.these).toEqual([
      "ini",
      [["determiner", "ini", "plural of this"]],
      0,
    ]);
    // No sense of the same part of speech: the first.
    expect(dict.those).toEqual([
      "itu",
      [["determiner", "itu", "plural of that"]],
      0,
    ]);
    expect(dict.went).toBeUndefined();
    expect(dict.hades).toBeUndefined();
  });
});

describe("byFrequency: spellings of one word (id-2)", () => {
  it("moves the spellings of one word as one, in the source's order", () => {
    const ranks: Record<string, number> = { अंग्रेजी: 900, अंग्रेज़ी: 20000 };
    const ordered = byFrequency(
      (word) => ranks[word] ?? Infinity,
      (word) => word.replace("़", ""),
    );
    expect(ordered("अंग्रेज़ी, अंग्रेजी")).toBe("अंग्रेज़ी, अंग्रेजी");
    expect(ordered("x, अंग्रेज़ी, अंग्रेजी")).toBe("अंग्रेज़ी, अंग्रेजी, x");
  });
});
