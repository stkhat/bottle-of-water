import { describe, expect, it } from "vitest";
import {
  coverage,
  GATE,
  gateRule,
  offeredPairs,
  pairCoverage,
  tokenCoverage,
  type TokenLookup,
} from "./gate.ts";

describe("coverage", () => {
  it("counts the terms with a meaning, by source", () => {
    const sources: Record<string, string> = { a: "x", b: "y", c: "x" };
    expect(coverage(["a", "b", "c", "d"], (t) => sources[t])).toEqual({
      terms: 4,
      covered: 3,
      share: 0.75,
      bySource: { x: 2, y: 1 },
    });
  });
});

describe("pairCoverage", () => {
  const words = Array.from({ length: GATE.top }, (_, i) => `w${i}`);
  const missing = (n: number) => (term: string) =>
    Number(term.slice(1)) < GATE.top - n ? "src" : undefined;

  it("passes when the top words' share reaches the gate", () => {
    const n = Math.round(GATE.top * (1 - GATE.share));
    const result = pairCoverage({ words, phrases: [], sourceOf: missing(n) });
    expect(result.passes).toBe(true);
    expect(result.tops[2000]!.share).toBe(1);
  });
  it("fails under the gate", () => {
    const n = Math.round(GATE.top * (1 - GATE.share)) + 1;
    expect(
      pairCoverage({ words, phrases: [], sourceOf: missing(n) }).passes,
    ).toBe(false);
  });
  it("reports the token rule's coverage and the rule passed by", () => {
    const n = Math.round(GATE.top * (1 - GATE.share)) + 1;
    const result = pairCoverage({
      words,
      phrases: [],
      sourceOf: missing(n),
      tokens: {
        counts: { w0: 95, [`w${GATE.top - 1}`]: 5 },
        lookup: { contractions: new Set(), bases: () => [] },
      },
      translator: true,
    });
    expect(result.tokens).toEqual({ tokens: 100, covered: 95, share: 0.95 });
    expect(result).toMatchObject({ rule: "tokens", passes: true });
  });
  it("fails when the language has fewer content words than the gate measures", () => {
    expect(
      pairCoverage({ words: ["a"], phrases: [], sourceOf: () => "src" }).passes,
    ).toBe(false);
  });
});

describe("tokenCoverage", () => {
  const lookup: TokenLookup = {
    contractions: new Set(["don't"]),
    bases: (key) => (key === "ran" ? ["run"] : key === "left" ? ["leave"] : []),
  };
  it("counts a token covered by its key, a base form or as a contraction", () => {
    const meanings = new Set(["run", "cat"]);
    expect(
      tokenCoverage(
        { cat: 5, ran: 3, "don't": 1, left: 1 },
        (t) => (meanings.has(t) ? "src" : undefined),
        lookup,
      ),
    ).toEqual({ tokens: 10, covered: 9, share: 0.9 });
  });
  it("is zero with no tokens", () => {
    expect(tokenCoverage({}, () => "src", lookup).share).toBe(0);
  });
});

describe("gateRule", () => {
  const top = (share: number) => ({
    terms: GATE.top,
    covered: 0,
    share,
    bySource: {},
  });
  const tokens = (share: number) => ({ tokens: 100, covered: 0, share });
  const rule = (
    type: number,
    tokenShare: number | undefined,
    translator: boolean,
  ) =>
    gateRule({
      words: GATE.top,
      top: top(type),
      tokens: tokenShare === undefined ? undefined : tokens(tokenShare),
      translator,
    });

  it("passes by (a) the top words, with or without the translator", () => {
    expect(rule(GATE.share, undefined, false)).toBe("type");
    expect(rule(GATE.share, 0.5, true)).toBe("type");
  });
  it("passes by (b) the tokens only with the translator", () => {
    expect(rule(0.837, 0.913, true)).toBe("tokens");
    expect(rule(0.814, 0.92, false)).toBeNull();
  });
  it("fails under both, or without a corpus counted", () => {
    expect(rule(0.8, GATE.tokenShare - 0.001, true)).toBeNull();
    expect(rule(0.8, undefined, true)).toBeNull();
  });
});

describe("offeredPairs", () => {
  it("lists the passing native languages per learning language, in order", () => {
    expect(
      offeredPairs([
        { pair: "en-ja", passes: true },
        { pair: "en-zh", passes: false },
        { pair: "en-es", passes: true },
        { pair: "es-en", passes: true },
      ]),
    ).toEqual({ en: ["ja", "es"], es: ["en"] });
  });
});
