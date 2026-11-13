import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFrequency,
  isListPage,
  rankByExamples,
  parseFrequencyWikitext,
} from "./frequency.ts";

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
  it("treats words named like Object properties as plain words", () => {
    expect(
      buildFrequency(
        [
          { rank: 1, words: ["constructor"] },
          { rank: 2, words: ["tostring"] },
        ],
        {},
        ["constructor", "tostring"],
      ),
    ).toEqual(["constructor", "tostring"]);
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

describe("rankByExamples", () => {
  // Blocks of two ranks: medians 100 (a, b), 50 (c, d), then the rest: 10 (e, f, g).
  const freq = ["a", "b", "c", "d", "e", "f", "g"];
  const counts = { a: 100, b: 90, c: 50, d: 40, e: 10, f: 8, g: 12 };
  const rank = (extra: Record<string, number>) =>
    rankByExamples(
      freq,
      [...freq, ...Object.keys(extra)],
      { ...counts, ...extra },
      2,
    );

  it("keeps the list's own order", () => {
    expect(rank({})).toEqual(freq);
  });
  it("places a word the list lacks where the list's words are written about as often", () => {
    // 70 is between the medians 100 (around rank 1) and 50 (around rank 3).
    expect(rank({ x: 70 })).toEqual(["a", "b", "c", "x", "d", "e", "f", "g"]);
    expect(rank({ y: 20 })).toEqual(["a", "b", "c", "d", "e", "y", "f", "g"]);
  });
  it("places a word written more often than the first block at the start, the more frequent first", () => {
    expect(rank({ z: 500, w: 600 })).toEqual(["a", "w", "z", ...freq.slice(1)]);
  });
  it("leaves unranked a word written less often than the last block, or never", () => {
    expect(rank({ rare: 9, never: 0 })).toEqual(freq);
  });
  it("orders words written as often by code unit", () => {
    expect(rank({ q: 70, p: 70 }).slice(3, 5)).toEqual(["p", "q"]);
  });
  it("never ranks a block above an earlier one", () => {
    // Medians 100, then 200 counted as 100: 150 goes to the start.
    expect(
      rankByExamples(
        ["a", "b", "c", "d"],
        ["a", "b", "c", "d", "x"],
        { a: 100, b: 100, c: 200, d: 200, x: 150 },
        2,
      ),
    ).toEqual(["a", "x", "b", "c", "d"]);
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
