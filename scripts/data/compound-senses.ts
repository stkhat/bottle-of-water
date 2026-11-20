// A word's sense as a closed compound's part (CORE build, for languages with
// `CompoundRules`): Wiktionary's etymologies of compounds gloss each part with the
// sense the compound uses ("Eisenbahn": Eisen (“iron”) + Bahn (“railway, train”)), so
// the sense of a word that its compounds' etymologies name most is what it means as a
// part, where that is not its first ("Bahn": route, trail; as a part, railway).
import type { KaikkiEntry } from "./common.ts";

/**
 * The key suffix of a word's entry as a compound's part in the dictionary pack
 * ("bahn-"), which the compound card's joined line reads (`withCompounds`).
 */
export const COMPOUND_PART = "-";

/** A part glossed in an etymology: "Bahn (“railway, train”)". */
const GLOSSED_PART = /(\p{L}+) \(“([^”]+)”\)/gu;

/** English words that say nothing of a sense. */
const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  ...["the", "and", "for", "with", "from", "into", "onto", "that", "this"],
  ...["one", "someone", "something", "its", "his", "her", "their", "etc"],
]);

/** A gloss's or sense's content words, lower case, brackets left out. */
const contentWords = (text: string) =>
  text
    .replace(/\([^()]*\)|\[[^[\]]*\]/gu, " ")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 3 && !FUNCTION_WORDS.has(word));

/**
 * How compounds' etymologies gloss each part: per key and written case (capitalised or
 * not: German "Licht (“light”)" is the noun's, "licht (“bright”)" the adjective's),
 * each gloss's content words and how often it is given.
 */
export function createPartGlosses() {
  const counts = new Map<string, Map<string, number>>();
  const id = (key: string, capital: boolean) => `${capital ? "^" : ""}${key}`;
  return {
    /** Reads an entry's etymology when it joins parts ("Eisen (“iron”) + Bahn (“…”)"). */
    add(entry: KaikkiEntry) {
      const text = entry.etymology_text;
      if (typeof text !== "string" || !text.includes(" + ")) return;
      for (const [, part, gloss] of text.matchAll(GLOSSED_PART)) {
        const key = id(part!.toLowerCase(), /^\p{Lu}/u.test(part!));
        const glosses = counts.get(key) ?? new Map<string, number>();
        const words = contentWords(gloss!).join(" ");
        if (words) glosses.set(words, (glosses.get(words) ?? 0) + 1);
        counts.set(key, glosses);
      }
    },
    /** The glosses (their content words, space-separated) of `key` written so, and how often. */
    of: (key: string, capital: boolean): ReadonlyMap<string, number> =>
      counts.get(id(key, capital)) ?? new Map(),
  };
}

/**
 * The etymologies' glosses must name a sense this often at least for it to be the
 * part's: "Wende (“Slav”)" twice does not make Wende's fifth sense its sense as a part.
 */
const MIN_SCORE = 3;

/** A sense's first item (up to a comma or semicolon outside brackets): what a compound's line shows of it. */
const firstItemOf = (text: string) =>
  text.replace(/\([^()]*\)/gu, " ").split(/[,;]/u)[0]!;

/**
 * The index of the sense (among the pack's `senses`) that a word's compounds use: the
 * one whose first item shares a content word with the most of their etymologies'
 * glosses (`glosses`, of the word written as its first sense's headword is: a noun's
 * capitalised), among the senses of that headword (`capital`: the pack's "capital"
 * mark), at least MIN_SCORE and above the first sense ("Bahn": "railway/railroad or
 * rail transport" 3 against "route, trail" 1; "Fall": case, not "fall, drop");
 * undefined to keep the first.
 */
export function compoundSense(
  senses: readonly (readonly [string, string, ...unknown[]])[],
  glossesOf: (capital: boolean) => ReadonlyMap<string, number>,
): number | undefined {
  if (senses.length < 2) return undefined;
  const capital = (i: number) => senses[i]![2] === "capital";
  const glosses = [...glossesOf(capital(0))];
  if (glosses.length === 0) return undefined;
  const score = (text: string) => {
    const words = new Set(contentWords(firstItemOf(text)));
    return glosses.reduce(
      (sum, [gloss, n]) =>
        sum + (gloss.split(" ").some((word) => words.has(word)) ? n : 0),
      0,
    );
  };
  const scores = senses.map(([, text], i) =>
    capital(i) === capital(0) ? score(text) : 0,
  );
  let best = 0;
  scores.forEach((value, i) => {
    if (value > scores[best]!) best = i;
  });
  return best > 0 && scores[best]! >= MIN_SCORE ? best : undefined;
}
