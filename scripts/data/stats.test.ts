import { describe, expect, it } from "vitest";
import {
  describeGate,
  failingOffered,
  ipaCoverage,
  patternCounts,
  phraseMeanings,
} from "./stats.ts";

describe("ipaCoverage", () => {
  const freq = ["you", "i", "the", "zzyzx"];
  const ipa = { you: "/ju/", the: "/ðə/", zzyzx: "/z/" };

  it("is the share of the top base forms that have IPA", () => {
    expect(ipaCoverage(freq, ipa, 3)).toEqual({
      words: 3,
      withIpa: 2,
      ratio: 2 / 3,
    });
  });
  it("uses the whole list when it is shorter than the top", () => {
    expect(ipaCoverage(freq, ipa, 20000)).toEqual({
      words: 4,
      withIpa: 3,
      ratio: 3 / 4,
    });
  });
});

describe("patternCounts", () => {
  it("counts the detected patterns, the others and the ones with a gap", () => {
    expect(
      patternCounts({
        detect: ["figure out", "give up"],
        more: ["make up one's mind"],
        gap: ["figure out", "give up"],
      }),
    ).toEqual({ patterns: 3, detect: 2, more: 1, gap: 2 });
  });
});

describe("phraseMeanings", () => {
  it("counts the patterns, detected and the others, with a meaning from each source", () => {
    expect(
      phraseMeanings(
        {
          detect: ["by heart", "figure out", "give up", "in spite of"],
          more: ["make up one's mind", "zzyzx out"],
          gap: ["figure out", "give up"],
        },
        { "in spite of": ["", []], give: ["", []] },
        { "by heart": ["", []], "make up one's mind": ["", []] },
        { "figure out": ["", []], "give up": ["", []] },
      ),
    ).toEqual({ phrases: 6, ejdict: 1, ja: 2, defs: 2, none: 1 });
  });
});

describe("failingOffered", () => {
  const report = [
    { pair: "en-ja", passes: true },
    { pair: "en-zh", passes: false },
    { pair: "en-es", passes: false },
  ];
  it("names the offered pairs under the gate", () => {
    expect(failingOffered(report, { en: ["ja", "es"] })).toEqual(["en-es"]);
  });
  it("is empty when the lock offers no pairs yet", () => {
    expect(failingOffered(report, undefined)).toEqual([]);
  });
});

describe("describeGate", () => {
  const c = (covered: number, bySource: Record<string, number>) => ({
    terms: 4,
    covered,
    share: covered / 4,
    bySource,
  });
  const tops = { 2000: c(4, { a: 3, b: 1 }), 5000: c(3, { a: 3 }) };

  it("gives each pair's rule and coverage by source", () => {
    expect(
      describeGate([
        {
          pair: "en-es",
          passes: true,
          rule: "type",
          translator: true,
          tops,
          tokens: { tokens: 10, covered: 9, share: 0.9 },
          phrases: c(0, {}),
        },
      ]),
    ).toEqual([
      "en-es: passes the gate by (a), its top content words",
      "  top 2000: 4/4 (100.0%); a 3, b 1",
      "  top 5000: 3/4 (75.0%); a 3",
      "  tokens: 9/10 (90.0%); translator yes",
      "  phrases: 0/4 (0.0%)",
    ]);
  });
  it("names the token rule, and both conditions under the gate", () => {
    const pair = (rule: "tokens" | null) => ({
      pair: "en-hi",
      passes: rule !== null,
      rule,
      translator: rule !== null,
      tops,
      phrases: c(0, {}),
    });
    expect(describeGate([pair("tokens")])[0]).toBe(
      "en-hi: passes the gate by (b), its corpus tokens with the translator",
    );
    expect(describeGate([pair(null)])).toEqual([
      "en-hi: under the gate (needs (a) 90.0% of the top 5000 content words, or (b) 90.0% of the corpus tokens and the translator)",
      "  top 2000: 4/4 (100.0%); a 3, b 1",
      "  top 5000: 3/4 (75.0%); a 3",
      "  tokens: no corpus counted; translator no",
      "  phrases: 0/4 (0.0%)",
    ]);
  });
});
