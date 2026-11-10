import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFrequency,
  isListPage,
  parseFrequencyWikitext,
} from "./frequency.mjs";

const fixture = readFileSync(
  join(import.meta.dirname, "fixtures", "frequency.wikitext"),
  "utf8",
);

describe("parseFrequencyWikitext", () => {
  const rows = parseFrequencyWikitext(fixture);

  it("reads rank and lowercase word from each table row", () => {
    expect(rows.slice(0, 3)).toEqual([
      { rank: 1, words: ["you"] },
      { rank: 2, words: ["i"] },
      { rank: 4, words: ["the"] },
    ]);
  });
  it("keeps every alternative in a row once", () => {
    expect(rows.find((r) => r.rank === 253)?.words).toEqual(["house"]);
  });
  it("keeps text attached after the link, such as a possessive", () => {
    expect(rows.find((r) => r.rank === 10006)?.words).toEqual(["mark's"]);
    expect(rows.find((r) => r.rank === 197)?.words).toEqual(["mr"]);
  });
  it("reads plain links", () => {
    expect(rows.find((r) => r.rank === 40001)?.words).toEqual(["impale"]);
  });
  it("skips struck-out rows and rows without a link", () => {
    expect(rows.map((r) => r.rank)).not.toContain(840);
    expect(rows.map((r) => r.rank)).not.toContain(41282);
    expect(rows).toHaveLength(13);
  });
});

describe("buildFrequency", () => {
  const rows = [
    { rank: 5, words: ["knows"] },
    { rank: 3, words: ["know"] },
    { rank: 1, words: ["is"] },
    { rank: 2, words: ["the"] },
    { rank: 4, words: ["mark’s"] },
    { rank: 6, words: ["left"] },
    { rank: 7, words: ["millie"] },
  ];
  const lemmas = { is: "be", knows: "know", left: "leave" };
  const vocab = ["be", "the", "know", "mark", "left", "leave"];

  it("lists base forms in rank order, each at its best rank", () => {
    expect(buildFrequency(rows, lemmas, vocab)).toEqual([
      "be",
      "the",
      "know",
      "mark",
      "left",
      "leave",
    ]);
  });
  it("keeps only the top entries", () => {
    expect(buildFrequency(rows, lemmas, vocab, 3)).toEqual([
      "be",
      "the",
      "know",
    ]);
  });
  it("uses every base of a form with several", () => {
    expect(
      buildFrequency(
        [{ rank: 1, words: ["better"] }],
        { better: ["good", "well"] },
        ["good", "well"],
      ),
    ).toEqual(["good", "well"]);
  });
});

describe("isListPage", () => {
  it("accepts the numbered subpages only", () => {
    expect(isListPage("Wiktionary:Frequency lists/TV/2006/1-1000")).toBe(true);
    expect(isListPage("Wiktionary:Frequency lists/TV/2006/40001-41284")).toBe(
      true,
    );
    expect(isListPage("Wiktionary:Frequency lists/TV/2006")).toBe(false);
    expect(isListPage("Wiktionary:Frequency lists/TV/2006/explanation")).toBe(
      false,
    );
  });
});
