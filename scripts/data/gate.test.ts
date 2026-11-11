import { describe, expect, it } from "vitest";
import { coverage, GATE, offeredPairs, pairCoverage } from "./gate.mjs";

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
    const n = Math.floor(GATE.top * (1 - GATE.share));
    const result = pairCoverage({ words, phrases: [], sourceOf: missing(n) });
    expect(result.passes).toBe(true);
    expect(result.tops[2000]!.share).toBe(1);
  });
  it("fails under the gate", () => {
    const n = Math.floor(GATE.top * (1 - GATE.share)) + 1;
    expect(
      pairCoverage({ words, phrases: [], sourceOf: missing(n) }).passes,
    ).toBe(false);
  });
  it("fails when the language has fewer content words than the gate measures", () => {
    expect(
      pairCoverage({ words: ["a"], phrases: [], sourceOf: () => "src" }).passes,
    ).toBe(false);
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
