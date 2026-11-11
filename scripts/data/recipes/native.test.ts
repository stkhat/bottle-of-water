import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeShards } from "../common.ts";
import { buildPairDictionary, TABLES_TAG } from "./native.ts";
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
    expect(result.stats).toEqual({ unparsable: 1, terms: 3 });
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
});
