import { describe, expect, it } from "vitest";
import { NOMINAL_POS } from "../../src/core/lexicon/definitions.ts";
import { posLabel } from "./common.ts";
import {
  ENGLISH_PHRASES,
  glossTokens,
  idiomaticity,
  JAPANESE_GLOSSES,
  thresholdFor,
  transparent,
  type PatternEvidence,
} from "./idiomaticity.ts";
import type { RankedSense } from "./senses.ts";

const sense = (
  gloss: string,
  extra: Partial<RankedSense> = {},
): RankedSense => ({
  pos: "verb",
  gloss,
  tags: [],
  topics: [],
  categories: [],
  inflection: false,
  tables: 0,
  ja: [],
  order: 0,
  labels: 0,
  ...extra,
});
/** A pattern whose senses overlap its words' glosses as `overlaps` says. */
const evidence = (
  senses: RankedSense[],
  overlaps: Record<string, number>,
  extra: Partial<PatternEvidence> = {},
): PatternEvidence => ({
  pos: ["verb"],
  senses,
  overlap: (s) => overlaps[s.gloss] ?? 0,
  literalNote: false,
  count: 0,
  assoc: 10,
  ...extra,
});

describe("idiomaticity (B2)", () => {
  it("is the share of meaning the words do not give", () => {
    expect(
      idiomaticity(
        evidence([sense("To return.")], { "To return.": 1 }),
        ENGLISH_PHRASES,
      ),
    ).toBe(0);
    expect(
      idiomaticity(
        evidence([sense("To die.")], { "To die.": 0 }),
        ENGLISH_PHRASES,
      ),
    ).toBe(1);
  });
  it("takes a sense the source tags idiomatic, and a discourse pattern, as opaque", () => {
    const literal = { "To leave.": 1 };
    expect(
      idiomaticity(
        evidence([sense("To leave.", { tags: ["idiomatic"] })], literal),
        ENGLISH_PHRASES,
      ),
    ).toBeCloseTo(0.9);
    expect(
      idiomaticity(
        evidence([sense("To leave.")], literal, { pos: ["intj"] }),
        ENGLISH_PHRASES,
      ),
    ).toBeCloseTo(0.9);
  });
  it("weighs translated senses more and labelled ones less", () => {
    const overlaps = { "Opaque.": 0, "Literal.": 1 };
    const translated = idiomaticity(
      evidence([sense("Literal."), sense("Opaque.", { tables: 30 })], overlaps),
      ENGLISH_PHRASES,
    );
    const labelled = idiomaticity(
      evidence(
        [sense("Literal."), sense("Opaque.", { labels: 1.5 })],
        overlaps,
      ),
      ENGLISH_PHRASES,
    );
    expect(translated).toBeGreaterThan(0.5);
    expect(labelled).toBeLessThan(0.5);
  });
  it("lets a frequent word sequence, or a literal note, compete as a literal reading", () => {
    const opaque = evidence([sense("To die.")], {});
    const rare = idiomaticity(opaque, ENGLISH_PHRASES);
    const frequent = idiomaticity({ ...opaque, count: 1000 }, ENGLISH_PHRASES);
    const noted = idiomaticity(
      { ...opaque, literalNote: true },
      ENGLISH_PHRASES,
    );
    expect(frequent).toBeLessThan(rare);
    expect(noted).toBeLessThan(rare);
  });
  it("mixes in the native gloss for a content pattern", () => {
    const opaque = evidence([sense("To die.")], {});
    expect(
      idiomaticity({ ...opaque, overlapNative: 1 }, ENGLISH_PHRASES),
    ).toBeCloseTo(0.7);
    expect(
      idiomaticity(
        { ...opaque, pos: ["intj"], overlapNative: 1 },
        ENGLISH_PHRASES,
      ),
    ).toBe(1);
  });
});

describe("ENGLISH_PHRASES", () => {
  it("names the nominal parts of speech the definitions' usage notes read (NOMINAL_POS)", () => {
    expect(new Set([...ENGLISH_PHRASES.nominal].map(posLabel))).toEqual(
      NOMINAL_POS,
    );
  });
});

describe("thresholdFor (B2)", () => {
  it("rises with the count and when the words co-occur little more than chance", () => {
    expect(thresholdFor(0, 10)).toBeCloseTo(0.55);
    expect(thresholdFor(999, 10)).toBeCloseTo(0.64);
    expect(thresholdFor(0, 1.5)).toBeCloseTo(0.75);
  });
});

describe("transparent (B2b)", () => {
  const nominal = (extra: Partial<PatternEvidence>) =>
    evidence([sense("A thing.")], {}, { pos: ["noun"], ...extra });
  it("takes a compound whose definition names every content word for transparent", () => {
    expect(transparent(nominal({ parts: 1 }), ENGLISH_PHRASES)).toBe(true);
    expect(transparent(nominal({ parts: 0.5 }), ENGLISH_PHRASES)).toBe(false);
  });
  it("takes a nominal or discourse pattern glossed by a loanword or by its words' glosses for transparent", () => {
    expect(transparent(nominal({ loanword: true }), ENGLISH_PHRASES)).toBe(
      true,
    );
    expect(
      transparent(
        nominal({ pos: ["intj"], overlapNative: 0.5 }),
        ENGLISH_PHRASES,
      ),
    ).toBe(true);
  });
  it("leaves verbs to the score", () => {
    expect(
      transparent(
        evidence([sense("To end.")], {}, { parts: 1, overlapNative: 1 }),
        ENGLISH_PHRASES,
      ),
    ).toBe(false);
  });
});

describe("glosses", () => {
  it("cuts an English gloss into stemmed content tokens", () => {
    expect([
      ...glossTokens("To return to a former position.", new Set(["to"])),
    ]).toEqual(["retur", "forme", "posit"]);
  });
  it("cuts a Japanese gloss into kanji and katakana, notes aside", () => {
    expect(JAPANESE_GLOSSES.units("《俗》別れる,コーヒーを飲む")).toEqual([
      "別",
      "コーヒー",
      "飲",
    ]);
    expect(JAPANESE_GLOSSES.loanword("『インスタントコーヒー』")).toBe(true);
    expect(JAPANESE_GLOSSES.loanword("即席コーヒー")).toBe(false);
  });
});
