import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { shortOfSenses } from "../../src/core/lexicon/short-lines.ts";
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
      ["verb", "To transfer the possession of a thing."],
    ]);
  });
  it("leaves out inflections, archaic senses and single-word proper nouns", () => {
    expect(result.defs).not.toHaveProperty("gave");
    expect(result.defs).not.toHaveProperty("light");
    expect(result.defs["cool"]!.map(([, text]) => text)).not.toContain(
      "Slightly cold.",
    );
  });

  describe("C2: senses ranked by the source's labels", () => {
    it("moves a register-labelled sense down, for words too", () => {
      expect(result.defs["cool"]).toEqual([
        ["adjective", "Having a low temperature."],
        ["adjective", "Fashionable; excellent."],
      ]);
    });
    it("moves a phrase's domain senses and usage notes down", () => {
      expect(result.defs["knock on"]![0]).toEqual([
        "verb",
        "To have an effect on something else.",
      ]);
      expect(result.defs["all right"]![0]).toEqual([
        "adjective",
        "In acceptable condition.",
      ]);
    });
    it("puts first the part of speech the source translates most", () => {
      expect(result.defs["send out"]!.map(([pos]) => pos)).toEqual([
        "verb",
        "noun",
      ]);
    });
    it("gives a pointer sense the best definition of the term it names", () => {
      expect(result.defs["kinda"]).toEqual([["adverb", "Slightly; somewhat."]]);
      expect(result.defs["colour"]!).toEqual([
        ["noun", "The spectral composition of visible light."],
      ]);
      // A letter-case form names another entry ("aka" → "AKA").
      expect(result.defs["aka"]!).toEqual([
        ["noun", "The New Zealand vine Metrosideros fulgens."],
        [
          "preposition",
          "Used to introduce an explanation or clarification: in other words, i.e.",
        ],
      ]);
      expect(result.stats.resolved).toBe(3);
    });
    it("moves a definition that describes the expression down", () => {
      expect(shortOfSenses(result.defs["not to mention"]!)).toBe("And also");
    });
    it("moves a phrase's definitions that only name its function down, as usage notes", () => {
      // The intensifier and the indication have the bigger translation tables.
      expect(result.defs["i mean"]!.map(([, text]) => text)).toEqual([
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

describe("buildEnDefs on contractions (U1-5)", () => {
  const contractions = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-contractions.jsonl",
  );
  let defs: Awaited<ReturnType<typeof buildEnDefs>>["defs"];
  beforeAll(async () => {
    ({ defs } = await buildEnDefs(contractions, {
      vocab: ["we", "we've", "that's", "am"],
      lemmas: {},
      phrases: { detect: [], more: [], gap: [] },
    }));
  });

  it("keeps a contraction's own gloss where its pointer names only its host (we've)", () => {
    // Not "we"'s definition, "Excluding the person(s) being addressed".
    expect(defs["we've"]).toEqual([
      ["contraction", "Contraction of we + have."],
    ]);
  });
  it("ranks a contraction's own senses first (that's)", () => {
    // The dialectal determiner comes first in the source.
    expect(shortOfSenses(defs["that's"]!)).toBe("That is");
    expect(defs["that's"]!.map(([pos]) => pos)).toEqual([
      "contraction",
      "contraction",
      "contraction",
      "determiner",
    ]);
  });
  it("keeps the senses of a word with a contraction sense among others in their order (am)", () => {
    expect(defs["am"]!.map(([pos]) => pos)).toEqual(["adverb", "contraction"]);
  });
});

describe("buildEnDefs: capital-only words", () => {
  it("defines them by the entries written so, proper nouns too, under their keys", async () => {
    const { defs } = await buildEnDefs(
      join(import.meta.dirname, "fixtures", "kaikki-vocabulary.jsonl"),
      {
        vocab: ["story", "the"],
        lemmas: {},
        phrases: { detect: [], more: [], gap: [] },
        capitals: ["AI", "Tokyo"],
      },
    );
    // AI's initialism, not the sloth "ai".
    expect(defs.ai).toEqual([
      ["noun", "Initialism of artificial intelligence."],
    ]);
    expect(defs.tokyo).toEqual([["proper noun", "The capital city of Japan."]]);
    expect(defs).not.toHaveProperty("vito");
  });
  it("defines a word that joined from Wikidata by its item first, then the entries written so", async () => {
    const entity = (description: string) => ({
      id: "Q1",
      sitelinks: 50,
      examples: 9,
      label: { en: "x" },
      description: { en: description },
    });
    const { defs } = await buildEnDefs(
      join(import.meta.dirname, "fixtures", "kaikki-vocabulary.jsonl"),
      {
        vocab: ["story", "the"],
        lemmas: {},
        phrases: { detect: [], more: [], gap: [] },
        capitals: ["Nvidia", "Tokyo"],
        entities: {
          Nvidia: {
            ...entity("American technology company"),
            label: { en: "Nvidia" },
          },
          Tokyo: { ...entity("capital of Japan"), label: { en: "Tokyo" } },
        },
      },
    );
    expect(defs.nvidia).toEqual([
      ["proper noun", "American technology company."],
    ]);
    expect(defs.tokyo).toEqual([
      ["proper noun", "Capital of Japan."],
      ["proper noun", "The capital city of Japan."],
    ]);
  });
});

describe("buildEnDefs: abbreviations", () => {
  let defs: Awaited<ReturnType<typeof buildEnDefs>>["defs"];
  beforeAll(async () => {
    ({ defs } = await buildEnDefs(
      join(import.meta.dirname, "fixtures", "kaikki-abbreviations.jsonl"),
      {
        // EJDict's "h.r." is a vocabulary word; GPU and ANC are capital-only.
        vocab: ["h.r.", "hitman"],
        lemmas: {},
        phrases: { detect: [], more: [], gap: [] },
        capitals: ["ANC", "GPU", "H.R."],
      },
    ));
  });

  it("keeps what an abbreviation stands for in the definition it takes", () => {
    expect(defs.gpu!).toContainEqual([
      "noun",
      "graphics processing unit: A specialized electronic circuit designed to accelerate the creation of images.",
    ]);
  });
  it("keeps every abbreviation sense of a capital-only word", () => {
    expect(defs.anc!.map(([, text]) => text)).toEqual([
      "Initialism of absolute neutrophil count.",
      "Initialism of African National Congress.",
      "Initialism of antenatal care.",
      "Initialism of active noise control or active noise cancellation.",
      "Initialism of antenuptial contract.",
    ]);
  });
  it("gives a dotted abbreviation its spelling without periods' senses after its own", () => {
    expect(defs["h.r."]!.map(([, text]) => text)).toEqual([
      "House of Representatives: The lower house of the United States Congress.",
      // HR's nested sense, with what its parent gloss abbreviates.
      "human resources: The human capital of an organization.",
      "House of Representatives.",
      "Initialism of heart rate.",
    ]);
  });
});

describe("buildEnDefs: every part of speech (hi-2)", () => {
  let defs: Awaited<ReturnType<typeof buildEnDefs>>["defs"];
  beforeAll(async () => {
    ({ defs } = await buildEnDefs(
      join(import.meta.dirname, "fixtures", "kaikki-parts.jsonl"),
      {
        vocab: ["smash", "chewy", "handy", "the"],
        lemmas: {},
        phrases: { detect: [], more: [], gap: [] },
      },
    ));
  });

  it("keeps each translated part of speech's best sense, after more senses of another", () => {
    expect(defs.smash!.map(([pos]) => pos)).toContain("verb");
    expect(defs.smash).toHaveLength(4);
  });

  it("keeps no part of speech whose best sense is labelled or untranslated", () => {
    expect(defs.chewy!.map(([pos]) => pos)).not.toContain("noun");
    expect(defs.handy!.map(([pos]) => pos)).not.toContain("noun");
  });

  it("reads a gloss that goes on from its parent's dots as one", () => {
    expect(defs.the).toContainEqual([
      "article",
      "The definite article that shows the noun is identifiable because it has already been mentioned.",
    ]);
  });
});
