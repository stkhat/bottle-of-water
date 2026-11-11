// The most frequent content words of a learning language: what the quality gate
// measures a pair's dictionary on (docs/specs/architecture.md "Native meanings and the quality gate").
import type { LemmaPack, PosPack } from "../../src/core/packs/types.ts";

/**
 * Parts of speech that make a word a function word. Dictionaries and translation
 * tables often lack these words, and they sit within the known level anyway.
 */
const FUNCTION_POS = new Set([
  "pronoun",
  "determiner",
  "article",
  "preposition",
  "conjunction",
  "particle",
  "contraction",
]);
/** English auxiliaries and modals, whose parts of speech say only "verb". */
const AUXILIARY_WORDS = new Set([
  "be",
  "have",
  "do",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
]);

/** Whether `word`, with its parts of speech `pos`, is a function word. */
export function isFunctionWord(word: string, pos: readonly string[]) {
  return AUXILIARY_WORDS.has(word) || pos.some((p) => FUNCTION_POS.has(p));
}

/**
 * Words whose written form is a contraction ("doesn't") or one letter ("j"): their
 * meaning is their parts' or none.
 */
const NOT_COUNTED = /'|^[a-z]$/;

/**
 * The `top` most frequent content words: the frequency list's words as base forms
 * (an inflected form counts as its first base), in rank order, each once, only
 * vocabulary words, without function words, contractions, single letters and
 * `names` (words the dictionary writes only with capitals: David, Paris, TV).
 * `excluded` lists the words left out on the way.
 */
export function contentWords({
  freq,
  pos,
  lemmas,
  vocab,
  top,
  names = new Set(),
}: {
  freq: readonly string[];
  pos: PosPack;
  lemmas: LemmaPack;
  vocab: ReadonlySet<string>;
  top: number;
  names?: ReadonlySet<string>;
}) {
  const seen = new Set<string>();
  const words: string[] = [];
  const excluded: string[] = [];
  for (const form of freq) {
    if (words.length >= top) break;
    // An inflected form counts as its first base ("went" as "go"), even when it is a
    // dictionary word of its own.
    const base = Object.hasOwn(lemmas, form) ? [lemmas[form]!].flat()[0] : form;
    if (!base || seen.has(base) || !vocab.has(base)) continue;
    seen.add(base);
    if (
      NOT_COUNTED.test(base) ||
      names.has(base) ||
      isFunctionWord(base, Object.hasOwn(pos, base) ? pos[base]! : [])
    )
      excluded.push(base);
    else words.push(base);
  }
  return { words, excluded };
}
