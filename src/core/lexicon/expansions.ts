/**
 * An abbreviation's expansions, read from its senses, and the one its document spells
 * out (CORE, language-independent: it reads only Latin-script words and their
 * initials). An initialism stands for several things (DEA: diethanolamine, the Drug
 * Enforcement Administration), and its senses are in the dictionary's order, which a
 * text can contradict; a text that means one of them tends to write it out, once,
 * where it first uses the abbreviation ("That's the Drug Enforcement Administration";
 * Wikipedia's "The Drug Enforcement Administration (DEA) is…"). Measured on the 2026-11
 * corpus ([notes](../../../docs/notes/proper-nouns.md)): the document's other words
 * (the senses' words it also writes) chose wrongly as often as rightly; its spelled-out
 * expansion did not.
 */

/** A run of words written in Latin letters (with inner hyphens and apostrophes). */
const LATIN_RUN =
  /^[A-Za-z]+(?:['’-][A-Za-z]+)*(?: [A-Za-z]+(?:['’-][A-Za-z]+)*)*/;

/**
 * Words an initial skips: short ones in lower case ("of", "and", "the": District of
 * Attorney, Bachelor of Arts).
 */
const skipped = (word: string) =>
  word.length <= 3 && word === word.toLowerCase();

/** The letters an abbreviation is written with, without its periods: "D.A." → "da". */
const lettersOf = (term: string) =>
  term.replace(/[^\p{L}]/gu, "").toLowerCase();

/** The words' initials stand for `letters`, short lowercase words aside or not. */
function initialsMatch(words: readonly string[], letters: string): boolean {
  const initials = (list: readonly string[]) =>
    list.map((word) => word.charAt(0).toLowerCase()).join("");
  return (
    initials(words) === letters ||
    initials(words.filter((word) => !skipped(word))) === letters
  );
}

/**
 * The words a sense spells `term` out with: the end of the sense's leading run of
 * Latin words whose initials are the term's letters ("Initialism of Drug Enforcement
 * Administration." → "Drug Enforcement Administration"; EJDict's "District of
 * Attorney (米国の)地方検事" → "District of Attorney", "Prime Minister"). Two words at
 * least, so a one-word sense ("unserviceable") or a definition ("A hydroxy secondary
 * amine…") spells nothing out. Undefined when it spells nothing out.
 */
export function expansionOf(term: string, sense: string): string | undefined {
  const letters = lettersOf(term);
  if (letters.length < 2) return undefined;
  const run = LATIN_RUN.exec(sense.trim())?.[0];
  if (!run) return undefined;
  const words = run.split(" ");
  for (let from = 0; from + 1 < words.length; from++) {
    // Not from inside a pointer: "Initialism of Drug …" spells out from "Drug".
    if (from > 0 && skipped(words[from]!)) continue;
    const rest = words.slice(from);
    if (initialsMatch(rest, letters)) return rest.join(" ");
  }
  return undefined;
}

/**
 * Whether `text` writes `phrase`, in any case, as whole words, with any spaces or
 * hyphens between them ("drug enforcement administration" in "the Drug Enforcement
 * Administration's agents").
 */
export function writesPhrase(text: string, phrase: string): boolean {
  const words = phrase
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${words.join("[\\s\\u00a0-]+")}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}

/**
 * The place of the sense to show first for an abbreviation whose document spells one
 * of its expansions out (`spelledOut`): the first sense whose expansion
 * (`expansionOf`) it writes. Undefined when that is the first sense already, or when
 * the document writes none.
 */
export function spelledOutSense(
  term: string,
  senses: readonly string[],
  spelledOut: (phrase: string) => boolean,
): number | undefined {
  const found = senses.findIndex((sense) => {
    const expansion = expansionOf(term, sense);
    return expansion !== undefined && spelledOut(expansion);
  });
  return found > 0 ? found : undefined;
}

/** `items` with the one at `index` first, the others in their order. */
export const moveFirst = <T>(items: readonly T[], index: number): T[] => [
  items[index]!,
  ...items.slice(0, index),
  ...items.slice(index + 1),
];
