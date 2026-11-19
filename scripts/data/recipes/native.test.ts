import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeShards } from "../common.ts";
import {
  buildPairDictionary,
  lesserLowercase,
  withPointerPos,
} from "./native.ts";
import { TABLES_TAG } from "./recipes.ts";
import { termKeyOf } from "./recipe.ts";

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
