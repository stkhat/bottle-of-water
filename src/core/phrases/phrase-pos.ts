/**
 * A phrase pattern's own parts of speech, as the source (kaikki, Wiktionary) gives its
 * entries, written compactly in the language pack (`PhrasePatterns.pos`): one code per
 * pattern, a letter per part of speech, the main one first ("vi": a verb, then an
 * interjection; "-": none).
 *
 * The data scripts import this file under plain Node: it has no imports.
 */

const LETTERS: Readonly<Record<string, string>> = {
  v: "verb",
  n: "noun",
  a: "adj",
  r: "adv",
  P: "prep_phrase",
  h: "phrase",
  i: "intj",
  l: "particle",
  p: "prep",
  o: "pron",
  c: "conj",
  d: "det",
  m: "num",
  N: "name",
  x: "proverb",
  k: "contraction",
};
const LETTER_OF: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LETTERS).map(([letter, pos]) => [pos, letter]),
);

/** A pattern's code: the letters of the parts of speech it has a letter for, in order. */
export function encodePhrasePos(pos: readonly string[]): string {
  const letters = pos
    .filter((name) => Object.hasOwn(LETTER_OF, name))
    .map((name) => LETTER_OF[name]!)
    .join("");
  return letters === "" ? "-" : letters;
}

/** The parts of speech a code holds ([] for "-"). */
export const decodePhrasePos = (code: string): string[] =>
  [...code].flatMap((letter) =>
    Object.hasOwn(LETTERS, letter) ? [LETTERS[letter]!] : [],
  );
