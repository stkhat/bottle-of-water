import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { writeShards } from "./common.ts";
import { buildEnDefs } from "./en-defs.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-phrases.jsonl");
const packs = {
  vocab: ["give", "up", "from", "scratch", "figure", "out", "make", "mind"],
  lemmas: { given: "give" },
  phrases: {
    detect: ["figure out", "from scratch", "give up"],
    more: ["make up one's mind", "pull someone's leg"],
    gap: ["figure out", "give up"],
  },
};

describe("buildEnDefs", () => {
  let result: Awaited<ReturnType<typeof buildEnDefs>>;
  beforeAll(async () => {
    result = await buildEnDefs(fixture, packs);
  });

  it("defines vocabulary words and every phrase pattern, detected or not", () => {
    expect(Object.keys(result.defs).sort()).toEqual([
      "figure out",
      "from scratch",
      "give",
      "give up",
      "make up one's mind",
    ]);
    expect(result.defs["give"]).toEqual([
      "To transfer the possession of something",
      [["verb", "To transfer the possession of something."]],
    ]);
  });
  it("merges senses of entries with the same headword, up to 4, skipping archaic ones", () => {
    expect(result.defs["give up"]).toEqual([
      "To surrender (someone or something)",
      [
        [
          "verb",
          "To surrender (someone or something); to inform on (someone).",
        ],
        ["verb", "To stop or quit (an activity, etc.)."],
        ["adjective", "Become fully taken over by a certain quality."],
        ["adjective", "Too tired to go on."],
      ],
    ]);
  });
  it("labels the part of speech and drops the final period from the short meaning", () => {
    expect(result.defs["from scratch"]).toEqual([
      "From the beginning",
      [
        [
          "prepositional phrase",
          "From the beginning; starting with no advantage or prior preparation.",
        ],
        ["prepositional phrase", "From basic materials or raw ingredients."],
      ],
    ]);
  });
  it("counts the words and phrases", () => {
    expect(result.stats).toMatchObject({ words: 1, phrases: 4, unparsable: 1 });
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
      { file: "dict-1.json", first: "figure out", last: "make up one's mind" },
    ]);
  });
});
