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
import { normalizeWord } from "../text/tokenize";

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
 * Attorney (米国の)地方検事" → "District of Attorney", "Prime Minister"; a translation's
 * hint, "《graphics processing unit》画像処理装置"), or of each of its alternatives
 * ("Initialism of active noise control or active noise cancellation"). Two words at
 * least, so a one-word sense ("unserviceable") or a definition ("A hydroxy secondary
 * amine…") spells nothing out. Empty when it spells nothing out.
 */
export function expansionsOf(term: string, sense: string): string[] {
  const letters = lettersOf(term);
  if (letters.length < 2) return [];
  const run = LATIN_RUN.exec(sense.trim().replace(/^《/, ""))?.[0];
  if (!run) return [];
  return run.split(" or ").flatMap((alternative) => {
    const words = alternative.split(" ");
    for (let from = 0; from + 1 < words.length; from++) {
      // Not from inside a pointer: "Initialism of Drug …" spells out from "Drug".
      if (from > 0 && skipped(words[from]!)) continue;
      const rest = words.slice(from);
      if (initialsMatch(rest, letters)) return [rest.join(" ")];
    }
    return [];
  });
}

/** The first of `expansionsOf`; undefined when the sense spells nothing out. */
export const expansionOf = (term: string, sense: string): string | undefined =>
  expansionsOf(term, sense)[0];

/** A word's base forms, as the learning language's pack gives them (`LanguagePack.lemmas`). */
export type BaseForms = (word: string) => readonly string[];

/** A text's words: runs of letters, marks and digits, and where each starts and ends. */
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * What may stand between two of a phrase's words written with a space or a hyphen
 * (`\s` takes in the no-break space).
 */
const SPACING = /^[\s-]+$/;

interface Word {
  /** In lower case, ’ as '. */
  readonly form: string;
  /** As written. */
  readonly written: string;
  readonly start: number;
  readonly end: number;
}

const wordsOf = (text: string): Word[] =>
  Array.from(text.matchAll(WORD), (match) => ({
    form: normalizeWord(match[0]),
    written: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));

/**
 * Whether `text` writes a phrase, asked of each: its words in any case, with any
 * spaces or hyphens between them where the phrase has a space or a hyphen
 * ("drug-enforcement administration" for "Drug Enforcement Administration"), the
 * phrase's other marks as it writes them ("women's"), and nothing more of a word
 * on either side ("email order" is not "mail order"; the 's of "the Drug Enforcement
 * Administration's" is not a word's). With `bases`, a word of the text may be a form
 * of the phrase's word, one with a base form in common: the text writes the
 * phrase inflected, as a plural or a case ("Graphics processing units (GPUs)" for
 * "graphics processing unit", "non-governmental organizations' work",
 * "organizaciones no gubernamentales"). The language's pack decides what a form
 * is (`LanguagePack.lemmas`), so a word it does not know matches as written only.
 * Reads the text's words once, when first asked, and each phrase once.
 */
export function spelledOutIn(
  text: string,
  bases?: BaseForms,
): (phrase: string) => boolean {
  let words: Word[] | undefined;
  const baseCache = new Map<string, readonly string[]>();
  const basesOf = (written: string): readonly string[] => {
    let found = baseCache.get(written);
    if (found === undefined) {
      found = bases?.(written).map(normalizeWord) ?? [];
      baseCache.set(written, found);
    }
    return found;
  };
  /** A word of the text is `wanted` or, with `bases`, a form of it. */
  const isForm = (word: Word, wanted: Word) => {
    if (word.form === wanted.form) return true;
    // A form starts as its base does (units, mice, Organisationen), so a word with
    // another first letter is none, and needs no base forms.
    if (!bases || word.form.charAt(0) !== wanted.form.charAt(0)) return false;
    const own = basesOf(word.written);
    if (own.length === 0) return false;
    const theirs = [wanted.form, ...basesOf(wanted.written)];
    return own.some((base) => theirs.includes(base));
  };
  const answers = new Map<string, boolean>();
  return (phrase) => {
    let found = answers.get(phrase);
    if (found !== undefined) return found;
    words ??= wordsOf(text);
    const wanted = wordsOf(phrase);
    /** What the text must write between the phrase's words `i - 1` and `i`. */
    const gaps = wanted.map((word, i) => {
      const gap = i === 0 ? "" : phrase.slice(wanted[i - 1]!.end, word.start);
      return SPACING.test(gap) ? SPACING : normalizeWord(gap);
    });
    const at = (from: number) =>
      wanted.every((word, i) => {
        const written = words![from + i];
        if (written === undefined || !isForm(written, word)) return false;
        if (i === 0) return true;
        const gap = text.slice(words![from + i - 1]!.end, written.start);
        const between = gaps[i]!;
        return typeof between === "string"
          ? normalizeWord(gap) === between
          : between.test(gap);
      });
    found = wanted.length > 0 && words.some((_, from) => at(from));
    answers.set(phrase, found);
    return found;
  };
}

/** Whether `text` writes `phrase` (`spelledOutIn`). */
export const writesPhrase = (
  text: string,
  phrase: string,
  bases?: BaseForms,
): boolean => spelledOutIn(text, bases)(phrase);

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
  const found = senses.findIndex((sense) =>
    expansionsOf(term, sense).some(spelledOut),
  );
  return found > 0 ? found : undefined;
}

/** `items` with the one at `index` first, the others in their order. */
export const moveFirst = <T>(items: readonly T[], index: number): T[] => [
  items[index]!,
  ...items.slice(0, index),
  ...items.slice(index + 1),
];
