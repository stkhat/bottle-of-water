import type { LemmaPack } from "./types";

/**
 * Base forms of a word as it appears in text: the word itself when it is in the
 * vocabulary, then its bases from the lemma pack. Falls back to the word without a
 * trailing possessive 's. Returns [] for an unknown word.
 */
export function lemmatize(
  form: string,
  lemmas: LemmaPack,
  vocab: ReadonlySet<string>,
): string[] {
  const word = form.toLowerCase().replaceAll("’", "'");
  const bases = Object.hasOwn(lemmas, word) ? [lemmas[word] ?? []].flat() : [];
  const found = vocab.has(word) ? [word, ...bases] : bases;
  if (found.length > 0) return [...new Set(found)];
  if (word.endsWith("'s")) return lemmatize(word.slice(0, -2), lemmas, vocab);
  return [];
}
