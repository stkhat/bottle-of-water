import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildContractions } from "./contractions.ts";

// Trimmed kaikki entries (2026-11 extract).
const fixture = join(
  import.meta.dirname,
  "fixtures",
  "kaikki-contractions.jsonl",
);
const vocab = [
  ...["i", "i'd", "i'm", "you", "you're", "we", "we've", "do", "don't", "not"],
  ...["am", "are", "is", "has", "had", "have", "would", "should", "was"],
  ...["will", "won't", "let", "let's", "us", "going", "to", "gonna", "ain't"],
  ...["gimme", "give", "me", "that", "that's", "someone", "wan't", "wasn't"],
  ...["want", "does", "doesn't"],
];

describe("buildContractions", () => {
  let table: Record<string, string[]>;
  let stats: Awaited<ReturnType<typeof buildContractions>>["stats"];
  beforeAll(async () => {
    ({ table, stats } = await buildContractions(fixture, { vocab }));
  });

  it("joins an alt-of host and the rest in its extra (you're, I'd)", () => {
    expect(table["you're"]).toEqual(["you are"]);
    expect(table["we've"]).toEqual(["we have"]);
    // "I + would or I + should", in the source's case.
    expect(table["i'd"]).toEqual(["I had", "I would", "I should"]);
    expect(table["i'm"]).toEqual(["I am"]);
  });
  it("reads a gloss whose first item is the expansion, without its notes (don't)", () => {
    expect(table["don't"]).toEqual(["do not"]);
  });
  it("keeps only expansions that end with what the clitic stands for (won't)", () => {
    // Not "doesn't want to".
    expect(table["won't"]).toEqual(["will not"]);
    // Not the determiner's "whose, of which"; "That was." is proscribed.
    expect(table["that's"]).toEqual(["that is", "that has"]);
  });
  it("reads the etymology when no sense names it (let's)", () => {
    expect(table["let's"]).toEqual(["let us"]);
  });
  it("falls back on the clitic's grammar (gonna)", () => {
    expect(table["gonna"]).toEqual(["going to"]);
    expect(stats.bySource).toEqual({ senses: 11, etymology: 1, grammar: 1 });
  });
  it("reads nonstandard senses when nothing else names it (ain't)", () => {
    expect(table["ain't"]).toEqual(["am not", "are not", "have not"]);
  });
  it("takes another contraction's expansions for a spelling of it (wan't: Wasn't.)", () => {
    expect(table["wan't"]).toEqual(["was not"]);
  });
  it("reads a word not written as one by its contraction senses, when its first sense is one", () => {
    expect(table["gimme"]).toEqual(["give me"]);
    // am's dialectal "Contraction of I + am" comes after its own senses.
    expect(table).not.toHaveProperty("am");
  });
  it("leaves out an 's word the source also gives a possessive (someone's)", () => {
    expect(table).not.toHaveProperty("someone's");
  });
});
