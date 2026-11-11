import type { LemmaPack } from "../packs/types";
import { normalizeWord } from "../text/tokenize";
import { own } from "../util";

/**
 * Base forms of a word as it appears in text: the word itself when it is in the
 * vocabulary, then its bases from the lemma pack. Falls back to the word without a
 * trailing possessive 's (harmless in Spanish, whose words do not end in 's). [] for an
 * unknown word.
 */
export function lemmatize(
  form: string,
  lemmas: LemmaPack,
  vocab: ReadonlySet<string>,
): string[] {
  const word = normalizeWord(form);
  const bases = [own(lemmas, word) ?? []].flat();
  const found = vocab.has(word) ? [word, ...bases] : bases;
  if (found.length > 0) return [...new Set(found)];
  if (word.endsWith("'s")) return lemmatize(word.slice(0, -2), lemmas, vocab);
  return [];
}
