// Which phrase patterns are highlighted (rules B2, B2b): how far a phrase's meaning is
// from its words' meanings, measured on the source's own definitions, and whether its
// words already explain it. No phrase lists: the inputs are the source's glosses, tags
// and translation tables, the example corpus's counts and, for a pair with native
// glosses, how much of the native gloss the words' own glosses already contain.
//
// Layers: CORE (the score, the threshold, the transparency rule); LEARNING (the
// language's discourse and nominal parts of speech, `PhraseLanguage`); GLOSS (the
// source's gloss tokens; its stopwords are its own most frequent tokens); NATIVE (how a
// native gloss is cut into content units and what a loanword looks like,
// `NativeGlosses`; Japanese below).
import { USAGE_NOTE, type RankedSense } from "./senses.ts";

/** The score's weights and the threshold (tuned on the round-1 judgements, docs/notes). */
const SCORE = {
  /** Each later sense weighs this much less. */
  decay: 0.9,
  /** Opacity of a sense the source tags idiomatic or figurative, at least. */
  tagFloor: 0.9,
  /** Opacity of every sense of a discourse pattern (interjection, phrase, particle), at least. */
  discourseFloor: 0.9,
  /** A labelled (register, domain, regional) sense weighs exp(−marginal × penalty). */
  marginal: 0.5,
  /** Weight of a literal reading per decade of example-corpus occurrences. */
  literalPrior: 0.3,
  /** Weight of a literal reading when the source notes one ("Used other than figuratively"). */
  literalNote: 1,
  /** Share of the score that the native gloss decides, for content patterns. */
  nativeWeight: 0.3,
  /** The detect threshold, before the frequency and association terms. */
  threshold: 0.55,
  /** The threshold rises this much per decade of example-corpus occurrences. */
  perDecade: 0.03,
  /** …and this much per bit of association (PMI) under `minAssoc`. */
  perAssoc: 0.1,
  minAssoc: 3.5,
} as const;

/** Senses read per pattern for the score. */
const SCORED_SENSES = 8;
/** Gloss tokens compare by this many leading letters (a crude stem). */
export const STEM = 5;

/** What the rules need to know of a learning language's parts of speech (kaikki's codes). */
export interface PhraseLanguage {
  /** Patterns of these parts of speech are conversational units (interjection, phrase, particle). */
  discourse: ReadonlySet<string>;
  /** Patterns whose parts may explain them (compounds): nouns, adjectives, names. */
  nominal: ReadonlySet<string>;
  /** Content patterns, where a native gloss tests compositionality. */
  content: ReadonlySet<string>;
  /** Proper nouns. */
  name: ReadonlySet<string>;
}

export const ENGLISH_PHRASES: PhraseLanguage = {
  discourse: new Set(["intj", "phrase", "particle"]),
  nominal: new Set(["noun", "adj", "name"]),
  content: new Set(["noun", "adj", "verb", "name"]),
  name: new Set(["name"]),
};

/** How a pair's native glosses are compared with the words' own (NATIVE). */
export interface NativeGlosses {
  /** The content units of a gloss. */
  units(gloss: string): string[];
  /** A gloss that is only a loanword: the learner reads the source words in it. */
  loanword(gloss: string): boolean;
}

const NOTES = /《[^》]*》|〈[^〉]*〉|\([^)]*\)|（[^）]*）|\{[^}]*\}/g;

/**
 * Japanese: kanji and katakana runs carry a gloss's content (hiragana inflects); a
 * gloss written only in katakana is a loanword (インスタントコーヒー).
 */
export const JAPANESE_GLOSSES: NativeGlosses = {
  units: (gloss) =>
    [
      ...gloss
        .replace(NOTES, "")
        .matchAll(/\p{Script=Han}|[\p{Script=Katakana}ー]{2,}/gu),
    ].map((match) => match[0]),
  loanword: (gloss) =>
    /^[\p{Script=Katakana}ー・=＝]+$/u.test(
      gloss.replace(/《[^》]*》|（[^）]*）|\([^)]*\)|[『』\s]/gu, ""),
    ),
};

/** The tokens of a gloss that carry meaning: 3 letters or more, not a stopword, stemmed. */
export function glossTokens(text: string, stop: ReadonlySet<string>) {
  const out = new Set<string>();
  for (const [token] of text.toLowerCase().matchAll(/[a-z]+/g)) {
    if (token.length < 3 || stop.has(token)) continue;
    out.add(token.slice(0, STEM));
  }
  return out;
}

/** What the score reads of one pattern. */
export interface PatternEvidence {
  /** The source's parts of speech of the pattern ([] for a pattern only the pair dictionary has). */
  pos: readonly string[];
  /** Its senses, best first (`rankSenses`). */
  senses: readonly RankedSense[];
  /** Share of each sense's gloss tokens found in its words' own glosses. */
  overlap: (sense: RankedSense) => number;
  /** The source has a "used other than figuratively" note. */
  literalNote: boolean;
  /** Occurrences in the example corpus. */
  count: number;
  /** log2 of observed over expected co-occurrence of its words in the example corpus. */
  assoc: number;
  /** Share of its native gloss's units found in its words' native glosses. */
  overlapNative?: number;
  /** Its first native gloss is a loanword. */
  loanword?: boolean;
  /** Share of its content words its first definition names. */
  parts?: number;
}

/**
 * B2, the idiomaticity score in [0, 1]: the weighted share of opaque meaning. Each of
 * the first senses adds its opacity (1 − overlap; at least `tagFloor` when the source
 * tags it idiomatic or figurative, at least `discourseFloor` for a discourse pattern),
 * weighted by its translation table (√(1 + languages)), its rank (decay^rank) and its
 * labels (register, domain, regional: exp(−marginal × penalty), usage notes aside). A
 * literal reading competes with weight literalPrior × log10(1 + count) (the more often
 * the words occur together, the more of those uses are literal), plus `literalNote`.
 * For a content pattern with a native gloss, the native opacity weighs `nativeWeight`.
 */
export function idiomaticity(
  evidence: PatternEvidence,
  language: PhraseLanguage,
): number {
  const discourse = evidence.pos.some((pos) => language.discourse.has(pos));
  let weighted = 0;
  let total = 0;
  evidence.senses.slice(0, SCORED_SENSES).forEach((sense, rank) => {
    const note = USAGE_NOTE.test(sense.gloss) ? 1 : 0;
    const weight =
      Math.sqrt(1 + sense.tables) *
      SCORE.decay ** rank *
      Math.exp(-SCORE.marginal * (sense.labels - note));
    let opacity = 1 - evidence.overlap(sense);
    if (sense.tags.some((tag) => tag === "idiomatic" || tag === "figuratively"))
      opacity = Math.max(opacity, SCORE.tagFloor);
    if (discourse) opacity = Math.max(opacity, SCORE.discourseFloor);
    weighted += weight * opacity;
    total += weight;
  });
  total +=
    SCORE.literalPrior * Math.log10(1 + evidence.count) +
    (evidence.literalNote ? SCORE.literalNote : 0);
  let score = total > 0 ? weighted / total : 0.5;
  const content =
    evidence.pos.length === 0 ||
    evidence.pos.every((pos) => language.content.has(pos));
  if (evidence.overlapNative !== undefined && content)
    score =
      (1 - SCORE.nativeWeight) * score +
      SCORE.nativeWeight * (1 - evidence.overlapNative);
  return Math.max(0, Math.min(1, score));
}

/**
 * B2's threshold for a pattern seen `count` times in the example corpus with
 * association `assoc`: it rises with the count (a pattern that would fire often must be
 * clearly idiomatic) and when its words co-occur little more than chance ("and that",
 * "in it").
 */
export const thresholdFor = (count: number, assoc: number) =>
  SCORE.threshold +
  SCORE.perDecade * Math.log10(1 + count) +
  SCORE.perAssoc * Math.max(0, SCORE.minAssoc - assoc);

/**
 * B2b, transparent patterns, not highlighted: a nominal pattern whose first definition
 * names every content word ("digital signature": "A … signature … digital …"); a
 * nominal or discourse pattern whose native gloss is a loanword (instant coffee →
 * インスタントコーヒー) or shares at least half its units with its words' own native
 * glosses ("I don't know" → 分からない, as know → 知る). Verbs, adverbs and prepositional
 * phrases are left to the score: their definitions name their words ("end up").
 */
export function transparent(
  evidence: PatternEvidence,
  language: PhraseLanguage,
): boolean {
  const pos = evidence.pos.length === 0 ? ["noun"] : evidence.pos;
  if (pos.every((p) => language.nominal.has(p)) && (evidence.parts ?? 0) >= 1)
    return true;
  return (
    pos.every((p) => language.nominal.has(p) || language.discourse.has(p)) &&
    (evidence.loanword === true || (evidence.overlapNative ?? 0) >= 0.5)
  );
}
