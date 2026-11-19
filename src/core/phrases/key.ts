import { normalizeWord, tokenize } from "../text/tokenize";

/**
 * A word as a key writes it, as the word segmenter keeps it whole: letters and
 * numbers, with an apostrophe or a period inside ("she's", "u.s"), and a comma or a
 * semicolon between digits ("1,000").
 */
const WORD_SOURCE = String.raw`[\p{L}\p{M}\p{N}]+(?:(?:['’.]|(?<=\p{N})[,;](?=\p{N}))[\p{L}\p{M}\p{N}]+)*`;
const WORD = new RegExp(WORD_SOURCE, "gu");
const ONE_WORD = new RegExp(`^${WORD_SOURCE}$`, "u");
/** Words joined by single spaces: every dictionary phrase, and most saved ones. */
const SPACED = new RegExp(`^${WORD_SOURCE}(?: ${WORD_SOURCE})+$`, "u");

/**
 * What separates two words of a phrase as its key writes it (2026-11-19): the text
 * between them, whitespace as one space and curly quotes straight. " " for words
 * separated by whitespace alone or by nothing (a script written without spaces); "-"
 * in "wh-what", ", " in "well, i think".
 */
export function separatorKey(between: string): string {
  const separator = between
    .replace(/\s+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
  return separator === "" ? " " : separator;
}

/** A key's words and what separates them (`between[i]` follows `words[i]`). */
export interface KeyParts {
  words: string[];
  between: string[];
}

/**
 * A key's words (normalized: `normalizeWord`) and their separators (`separatorKey`),
 * split as text in `lang` is: "well, i think" is "well", "i", "think" after ", " and
 * " ". One word for a word's key.
 */
export function splitKey(key: string, lang: string): KeyParts {
  if (ONE_WORD.test(key)) return { words: [normalizeWord(key)], between: [] };
  if (SPACED.test(key)) {
    const words = key.split(" ").map(normalizeWord);
    return { words, between: words.slice(1).map(() => " ") };
  }
  const words: string[] = [];
  const between: string[] = [];
  let gap = "";
  for (const token of tokenize(key, lang)) {
    if (!token.isWord) {
      gap += token.text;
      continue;
    }
    if (words.length > 0) between.push(separatorKey(gap));
    words.push(normalizeWord(token.text));
    gap = "";
  }
  return { words, between };
}

/**
 * The words of a key, found without the language's segmenter (as it finds them in
 * the languages Langle has: "she-she's" has 2, "u.s" 1).
 */
export const wordsOfKey = (key: string): string[] => key.match(WORD) ?? [];

/** Where the words of a text are, found as `wordsOfKey` finds a key's. */
export const wordRuns = (text: string): { start: number; end: number }[] =>
  Array.from(text.matchAll(WORD), (m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));

/** Whether a key is one word, or words joined by single spaces only. */
export const spacedKey = (key: string) =>
  ONE_WORD.test(key) || SPACED.test(key);
