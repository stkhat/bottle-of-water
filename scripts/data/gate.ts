// The quality gate: a language pair is offered only when human-made sources give a
// native meaning for (a) at least GATE.share of the learning language's GATE.top most
// frequent content words, or (b) at least GATE.tokenShare of the word tokens of its
// real-content corpus (data/gate/<lang>-tokens.json) and the browser's translator
// translates English into the native language, so the hover can fall back to the
// English definition translated (docs/specs/architecture.md "Native meanings and the
// quality gate"). English definitions and the translator never count as covered.
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DICTIONARY_PACKS,
  type LANGUAGE_PACKS,
} from "../../src/core/packs/formats.ts";
import { nativeLanguage } from "../../src/core/natives.ts";
import type {
  DictPack,
  LemmaPack,
  PosPack,
  ShardIndex,
} from "../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import { GATE_DIR, readDictPacks, readPack } from "./common.ts";
import { contentWords } from "./content-words.ts";
import { PACKS } from "./formats.ts";
import { tokensPath } from "./gate-tokens.ts";
import { TABLES_TAG } from "./recipes/recipes.ts";

/**
 * Decided with the user on 2026-11-21, after round 4's M0b (until then: 95% of the
 * top 5,000, rule (a) alone).
 */
export const GATE = { top: 5000, share: 0.9, tokenShare: 0.9 };
/** The sizes coverage is reported for; the gate looks at GATE.top. */
const TOPS = [2000, GATE.top];

type SourceOf = (term: string) => string | undefined;

interface Coverage {
  terms: number;
  covered: number;
  share: number;
  bySource: Record<string, number>;
}

/** The share of a corpus's word tokens whose key has a meaning. */
export interface TokenCoverage {
  tokens: number;
  covered: number;
  share: number;
}

/**
 * The rule a pair passes by: (a) "type", the top content words; (b) "tokens", the
 * corpus's tokens with the translator to fall back on. Null: neither.
 */
export type GateRule = "type" | "tokens" | null;

export interface PairReport {
  pair: string;
  tops: Record<number, Coverage>;
  phrases: Coverage;
  /** Undefined when the learning language has no token counts. */
  tokens?: TokenCoverage;
  /** The browser's translator translates English into the native language. */
  translator: boolean;
  rule: GateRule;
  passes: boolean;
}

/** How the hover looks a token's key up, beyond the key's own entry. */
export interface TokenLookup {
  /** A contraction shows its parts' meanings: covered in every pair. */
  contractions: ReadonlySet<string>;
  /** An inflected form's base forms, whose meanings the hover shows too. */
  bases: (key: string) => readonly string[];
}

/**
 * How many of `terms` have a meaning: in all, and by the source `sourceOf` names
 * (undefined: none).
 */
export function coverage(terms: readonly string[], sourceOf: SourceOf) {
  const bySource: Record<string, number> = {};
  let covered = 0;
  for (const term of terms) {
    const source = sourceOf(term);
    if (!source) continue;
    covered++;
    bySource[source] = (bySource[source] ?? 0) + 1;
  }
  return {
    terms: terms.length,
    covered,
    share: terms.length === 0 ? 0 : covered / terms.length,
    bySource,
  };
}

/**
 * The share of the counted tokens (key → tokens) that have a meaning: the key is a
 * contraction, or it or one of its base forms has a meaning (round 4's M0a rule,
 * within 0.3 points of what the extension shows for the natives offered then).
 */
export function tokenCoverage(
  counts: Readonly<Record<string, number>>,
  sourceOf: SourceOf,
  { contractions, bases }: TokenLookup,
): TokenCoverage {
  let tokens = 0;
  let covered = 0;
  for (const [key, n] of Object.entries(counts)) {
    tokens += n;
    if (
      contractions.has(key) ||
      sourceOf(key) !== undefined ||
      bases(key).some((base) => sourceOf(base) !== undefined)
    )
      covered += n;
  }
  return { tokens, covered, share: tokens === 0 ? 0 : covered / tokens };
}

/** The rule a pair passes by, rule (a) first. */
export function gateRule({
  words,
  top,
  tokens,
  translator,
}: {
  words: number;
  top: Coverage;
  tokens: TokenCoverage | undefined;
  translator: boolean;
}): GateRule {
  if (words >= GATE.top && top.share >= GATE.share) return "type";
  if (translator && tokens !== undefined && tokens.share >= GATE.tokenShare)
    return "tokens";
  return null;
}

/**
 * A pair's coverage of its learning language's top content words (each size in
 * TOPS), of its phrase patterns and, given its corpus's token counts, of those
 * tokens; and the gate rule it passes by.
 */
export function pairCoverage({
  words,
  phrases,
  sourceOf,
  tokens,
  translator = false,
}: {
  words: readonly string[];
  phrases: readonly string[];
  sourceOf: SourceOf;
  tokens?: {
    counts: Readonly<Record<string, number>>;
    lookup: TokenLookup;
  };
  translator?: boolean;
}): Omit<PairReport, "pair"> {
  const tops = Object.fromEntries(
    TOPS.map((top) => [top, coverage(words.slice(0, top), sourceOf)]),
  );
  const tokenShare =
    tokens && tokenCoverage(tokens.counts, sourceOf, tokens.lookup);
  const rule = gateRule({
    words: words.length,
    top: tops[GATE.top]!,
    tokens: tokenShare,
    translator,
  });
  return {
    tops,
    phrases: coverage(phrases, sourceOf),
    ...(tokenShare && { tokens: tokenShare }),
    translator,
    rule,
    passes: rule !== null,
  };
}

/** The learning language's content words and phrase patterns, from its built packs. */
function learningTerms(
  lang: (typeof LANGUAGE_PACKS)[number],
  dictionary: Readonly<Record<string, readonly unknown[]>>,
) {
  const { dir } = PACKS[lang];
  const phrases = readPack<PhrasePatterns>("phrases.json", dir);
  // Spanish has no pos.json: its dictionary's senses carry their parts of speech.
  const pos = existsSync(join(dir, "pos.json"))
    ? readPack<PosPack>("pos.json", dir)
    : Object.fromEntries(
        Object.entries(dictionary).map(([term, [, senses]]) => [
          term,
          [...new Set((senses as [string][]).map(([p]) => p))],
        ]),
      );
  const namesPath = join(GATE_DIR, `${lang}-capitalized.json`);
  // The words rule E adds are not counted: the gate measures the pair on the
  // vocabulary it was decided on (the dictionary's headwords).
  const addedPath = join(GATE_DIR, `${lang}-wiktionary-words.json`);
  const added = new Set(
    existsSync(addedPath)
      ? readPack<string[]>(basename(addedPath), GATE_DIR)
      : [],
  );
  // A lemma table too large for one file is in shards (Spanish: es/lemmas/).
  const lemmas = existsSync(join(dir, "lemmas.json"))
    ? readPack<LemmaPack>("lemmas.json", dir)
    : readDictPacks<LemmaPack[string]>(join(dir, "lemmas"));
  const { words } = contentWords({
    freq: readPack("freq.json", dir),
    pos,
    lemmas,
    vocab: new Set(
      readPack<string[]>("vocab.json", dir).filter((word) => !added.has(word)),
    ),
    top: GATE.top,
    names: new Set(
      existsSync(namesPath)
        ? readPack<string[]>(`${lang}-capitalized.json`, GATE_DIR)
        : [],
    ),
  });
  return {
    words,
    phrases: [...phrases.detect, ...phrases.more],
    tokens: learningTokens(lang, lemmas),
  };
}

/**
 * The learning language's token counts (data/gate/<lang>-tokens.json) and how the
 * hover looks their keys up; undefined for a language without a corpus counted.
 */
function learningTokens(
  lang: (typeof LANGUAGE_PACKS)[number],
  lemmas: LemmaPack,
) {
  const path = tokensPath(lang);
  if (!existsSync(path)) return undefined;
  const { dir } = PACKS[lang];
  const contractions = existsSync(join(dir, "contractions.json"))
    ? Object.keys(readPack<object>("contractions.json", dir))
    : [];
  return {
    counts: readPack<Record<string, number>>(basename(path), GATE_DIR),
    lookup: {
      contractions: new Set(contractions),
      bases: (key: string) => {
        const base = Object.hasOwn(lemmas, key) ? lemmas[key] : undefined;
        return base === undefined
          ? []
          : typeof base === "string"
            ? [base]
            : base;
      },
    },
  };
}

/**
 * The source of a term's native meaning in a built pair dictionary, as the pair's
 * recipe merged it: en-ja from EJDict, then English Wiktionary's Japanese
 * translations; a pair pack names the source of each term; es-en is English
 * Wiktionary itself.
 */
function pairSources(
  learning: string,
  native: string,
  dictionary: keyof typeof DICTIONARY_PACKS,
) {
  const { dir } = PACKS[dictionary];
  // A pair pack's entry: its senses, then its source (`PairEntry`).
  const dict = readDictPacks<readonly [unknown, number?]>(dir);
  if (dictionary === "en-ja") {
    const ja = readPack<DictPack>("phrases.json", dir);
    return {
      dictionary: dict,
      sourceOf: (term: string) =>
        Object.hasOwn(dict, term)
          ? "ejdict"
          : Object.hasOwn(ja, term)
            ? TABLES_TAG
            : undefined,
    };
  }
  const { sources } = readPack<ShardIndex>("index.json", dir);
  return {
    dictionary: dict,
    sourceOf: (term: string) =>
      !Object.hasOwn(dict, term)
        ? undefined
        : sources
          ? sources[dict[term]![1]!]
          : `${native}wiktionary-${learning}`,
  };
}

/** Each pair a dictionary is built for, with its coverage, read from the built packs. */
export function gateReport(): PairReport[] {
  return (
    Object.keys(DICTIONARY_PACKS) as (keyof typeof DICTIONARY_PACKS)[]
  ).map((dictionary) => {
    const [learning, native] = dictionary.split("-") as [
      (typeof LANGUAGE_PACKS)[number],
      string,
    ];
    const { dictionary: dict, sourceOf } = pairSources(
      learning,
      native,
      dictionary,
    );
    return {
      pair: dictionary,
      ...pairCoverage({
        ...learningTerms(learning, dict),
        sourceOf,
        translator: nativeLanguage(native)?.translator === true,
      }),
    };
  });
}

/**
 * The offered pairs for the lock: each learning language with the native languages
 * whose pair passes the gate, in report order (the first is the default).
 */
export function offeredPairs(
  report: readonly Pick<PairReport, "pair" | "passes">[],
) {
  const pairs: Record<string, string[]> = {};
  for (const { pair, passes } of report) {
    if (!passes) continue;
    const [learning = "", native = ""] = pair.split("-");
    (pairs[learning] ??= []).push(native);
  }
  return pairs;
}
