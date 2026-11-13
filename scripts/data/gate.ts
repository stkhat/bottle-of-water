// The quality gate: a language pair is offered only when human-made sources give a
// native meaning for at least GATE.share of the learning language's GATE.top most
// frequent content words (docs/specs/architecture.md "Native meanings and the quality gate").
// English definitions and the browser's translator do not count.
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DICTIONARY_PACKS,
  type LANGUAGE_PACKS,
} from "../../src/core/packs/formats.ts";
import type {
  DictPack,
  PosPack,
  ShardIndex,
} from "../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import { GATE_DIR, readDictPacks, readPack } from "./common.ts";
import { contentWords } from "./content-words.ts";
import { PACKS } from "./formats.ts";
import { TABLES_TAG } from "./recipes/native.ts";

/** Confirmed with the user on 2026-11-11. */
export const GATE = { top: 5000, share: 0.95 };
/** The sizes coverage is reported for; the gate looks at GATE.top. */
const TOPS = [2000, GATE.top];

type SourceOf = (term: string) => string | undefined;

interface Coverage {
  terms: number;
  covered: number;
  share: number;
  bySource: Record<string, number>;
}

export interface PairReport {
  pair: string;
  tops: Record<number, Coverage>;
  phrases: Coverage;
  passes: boolean;
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
 * A pair's coverage of its learning language's top content words (each size in
 * TOPS) and of its phrase patterns, and whether it passes the gate.
 */
export function pairCoverage({
  words,
  phrases,
  sourceOf,
}: {
  words: readonly string[];
  phrases: readonly string[];
  sourceOf: SourceOf;
}): Omit<PairReport, "pair"> {
  const tops = Object.fromEntries(
    TOPS.map((top) => [top, coverage(words.slice(0, top), sourceOf)]),
  );
  return {
    tops,
    phrases: coverage(phrases, sourceOf),
    passes: words.length >= GATE.top && tops[GATE.top]!.share >= GATE.share,
  };
}

/** The learning language's content words and phrase patterns, from its built packs. */
function learningTerms(
  lang: (typeof LANGUAGE_PACKS)[number],
  dictionary: Readonly<Record<string, readonly [string, ...unknown[]]>>,
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
  const { words } = contentWords({
    freq: readPack("freq.json", dir),
    pos,
    lemmas: readPack("lemmas.json", dir),
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
  return { words, phrases: [...phrases.detect, ...phrases.more] };
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
  const dict = readDictPacks<readonly [string, unknown, number?]>(dir);
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
          ? sources[dict[term]![2]!]
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
      ...pairCoverage({ ...learningTerms(learning, dict), sourceOf }),
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
