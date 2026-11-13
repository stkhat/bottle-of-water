import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { writeShards } from "./common.ts";
import { buildEnDefs } from "./en-defs.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-defs.jsonl");
const packs = {
  vocab: [
    ...["cool", "give", "gave", "colour", "color", "kinda", "light", "aka"],
    // The phrases' words, which the fixture does not define.
    ...["kind", "of", "knock", "on", "send", "out", "all", "right"],
    ...["not", "to", "mention", "i", "mean"],
  ],
  lemmas: {},
  phrases: {
    detect: ["kind of", "knock on", "send out"],
    more: ["all right", "not to mention", "i mean"],
    gap: ["knock on", "send out"],
  },
};

describe("buildEnDefs", () => {
  let result: Awaited<ReturnType<typeof buildEnDefs>>;
  beforeAll(async () => {
    result = await buildEnDefs(fixture, packs);
  });

  it('takes no sense from a gloss without a word (".")', () => {
    expect(result.defs).not.toHaveProperty("light");
  });
  it("defines vocabulary words and every phrase pattern, detected or not", () => {
    expect(Object.keys(result.defs).sort()).toEqual([
      "aka",
      "all right",
      "color",
      "colour",
      "cool",
      "give",
      "i mean",
      "kind of",
      "kinda",
      "knock on",
      "not to mention",
      "send out",
    ]);
    expect(result.defs["give"]).toEqual([
      "To transfer the possession of a thing",
      [["verb", "To transfer the possession of a thing."]],
    ]);
  });
  it("leaves out inflections, archaic senses and single-word proper nouns", () => {
    expect(result.defs).not.toHaveProperty("gave");
    expect(result.defs).not.toHaveProperty("light");
    expect(result.defs["cool"]![1].map(([, text]) => text)).not.toContain(
      "Slightly cold.",
    );
  });

  describe("C2: senses ranked by the source's labels", () => {
    it("moves a register-labelled sense down, for words too", () => {
      expect(result.defs["cool"]).toEqual([
        "Having a low temperature",
        [
          ["adjective", "Having a low temperature."],
          ["adjective", "Fashionable; excellent."],
        ],
      ]);
    });
    it("moves a phrase's domain senses and usage notes down", () => {
      expect(result.defs["knock on"]![1][0]).toEqual([
        "verb",
        "To have an effect on something else.",
      ]);
      expect(result.defs["all right"]![1][0]).toEqual([
        "adjective",
        "In acceptable condition.",
      ]);
    });
    it("puts first the part of speech the source translates most", () => {
      expect(result.defs["send out"]![1].map(([pos]) => pos)).toEqual([
        "verb",
        "noun",
      ]);
    });
    it("gives a pointer sense the best definition of the term it names", () => {
      expect(result.defs["kinda"]).toEqual([
        "Slightly",
        [["adverb", "Slightly; somewhat."]],
      ]);
      expect(result.defs["colour"]![1]).toEqual([
        ["noun", "The spectral composition of visible light."],
      ]);
      // A letter-case form names another entry ("aka" → "AKA").
      expect(result.defs["aka"]![1]).toEqual([
        ["noun", "The New Zealand vine Metrosideros fulgens."],
        [
          "preposition",
          "Used to introduce an explanation or clarification: in other words, i.e.",
        ],
      ]);
      expect(result.stats.resolved).toBe(3);
    });
    it("moves a definition that describes the expression down", () => {
      expect(result.defs["not to mention"]![0]).toBe("And also");
    });
    it("moves a phrase's definitions that only name its function down, as usage notes", () => {
      // The intensifier and the indication have the bigger translation tables.
      expect(result.defs["i mean"]![1].map(([, text]) => text)).toEqual([
        "Used to correct an error or slip of the tongue.",
        "A mild intensifier.",
        "An indication of approximation or uncertainty.",
        "A delaying filler.",
      ]);
    });
  });

  it("leaves out a term every pair dictionary has", async () => {
    const pairs = await buildEnDefs(fixture, {
      ...packs,
      everyPair: (key) => key === "cool" || key === "send out",
    });
    expect(pairs.defs).not.toHaveProperty("cool");
    expect(pairs.defs).not.toHaveProperty("send out");
    expect(pairs.defs).toHaveProperty("give");
    expect(pairs.stats.left).toBe(2);
  });
  it("counts the words and phrases", () => {
    expect(result.stats).toMatchObject({ words: 6, phrases: 6, unparsable: 1 });
  });
  it("writes the shards and their index", () => {
    const dir = mkdtempSync(join(tmpdir(), "en-defs-"));
    writeShards("en-defs", result.defs, dir);
    expect(readdirSync(join(dir, "en-defs")).sort()).toEqual([
      "dict-1.json",
      "index.json",
    ]);
    const index = JSON.parse(
      readFileSync(join(dir, "en-defs", "index.json"), "utf8"),
    );
    expect(index.shards).toEqual([
      { file: "dict-1.json", first: "aka", last: "send out" },
    ]);
  });
});
