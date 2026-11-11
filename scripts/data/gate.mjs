// The quality gate: a language pair is offered only when human-made sources give a
// native meaning for at least GATE.share of the learning language's GATE.top most
// frequent content words (docs/specs/2026-11-11-language-data-scaling-design.md §3).
// English definitions and the browser's translator do not count.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DOWNLOAD_PACKS_DIR,
  GATE_DIR,
  PACKS_DIR,
  readPack,
} from "./common.mjs";
import { contentWords } from "./content-words.mjs";
import { readDictPacks } from "./ejdict.mjs";
import { PACKS, PAIRS } from "./formats.mjs";
import { TABLES_TAG } from "./recipes/native.mjs";

/** Confirmed with the user on 2026-11-11. */
export const GATE = { top: 5000, share: 0.95 };
/** The sizes coverage is reported for; the gate looks at GATE.top. */
export const TOPS = [2000, GATE.top];

/**
 * How many of `terms` have a meaning: in all, and by the source `sourceOf` names
 * (undefined: none).
 */
export function coverage(terms, sourceOf) {
  const bySource = {};
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
export function pairCoverage({ words, phrases, sourceOf }) {
  const tops = Object.fromEntries(
    TOPS.map((top) => [top, coverage(words.slice(0, top), sourceOf)]),
  );
  return {
    tops,
    phrases: coverage(phrases, sourceOf),
    passes: words.length >= GATE.top && tops[GATE.top].share >= GATE.share,
  };
}

const dirOf = (pack) =>
  PACKS[pack].downloadable ? DOWNLOAD_PACKS_DIR : PACKS_DIR;

/** The learning language's content words and phrase patterns, from its built packs. */
function learningTerms(lang, dictionary) {
  const dir = dirOf(lang);
  const phrases = readPack(`${lang}/phrases.json`, dir);
  const posPath = join(dir, lang, "pos.json");
  // Spanish has no pos.json: its dictionary's senses carry their parts of speech.
  const pos = existsSync(posPath)
    ? readPack(`${lang}/pos.json`, dir)
    : Object.fromEntries(
        Object.entries(dictionary).map(([term, [, senses]]) => [
          term,
          [...new Set(senses.map(([p]) => p))],
        ]),
      );
  const namesPath = join(GATE_DIR, `${lang}-capitalized.json`);
  const { words } = contentWords({
    freq: readPack(`${lang}/freq.json`, dir),
    pos,
    lemmas: readPack(`${lang}/lemmas.json`, dir),
    vocab: new Set(readPack(`${lang}/vocab.json`, dir)),
    top: GATE.top,
    names: new Set(
      existsSync(namesPath)
        ? readPack(`${lang}-capitalized.json`, GATE_DIR)
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
function pairSources({ learning, native, dictionary }) {
  if (dictionary === "en-ja") {
    const dict = readDictPacks("en-ja");
    const ja = readPack("en-ja/phrases.json");
    return {
      dictionary: dict,
      sourceOf: (term) =>
        Object.hasOwn(dict, term)
          ? "ejdict"
          : Object.hasOwn(ja, term)
            ? TABLES_TAG
            : undefined,
    };
  }
  const dict = readDictPacks(dictionary, dirOf(dictionary));
  const { sources } = readPack(`${dictionary}/index.json`, dirOf(dictionary));
  return {
    dictionary: dict,
    sourceOf: (term) =>
      !Object.hasOwn(dict, term)
        ? undefined
        : sources
          ? sources[dict[term][2]]
          : `${native}wiktionary-${learning}`,
  };
}

/** Each pair in PAIRS with its coverage, read from the built packs. */
export function gateReport() {
  return PAIRS.map((pair) => {
    const { dictionary, sourceOf } = pairSources(pair);
    return {
      pair: `${pair.learning}-${pair.native}`,
      ...pairCoverage({
        ...learningTerms(pair.learning, dictionary),
        sourceOf,
      }),
    };
  });
}

/**
 * The offered pairs for the lock: each learning language with the native languages
 * whose pair passes the gate, in PAIRS order (the first is the default).
 */
export function offeredPairs(report) {
  const pairs = {};
  for (const { pair, passes } of report) {
    if (!passes) continue;
    const [learning, native] = pair.split("-");
    (pairs[learning] ??= []).push(native);
  }
  return pairs;
}
