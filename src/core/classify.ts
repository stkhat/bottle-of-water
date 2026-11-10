import type { LanguagePack } from "./language-pack";
import type { Token } from "./text/tokenize";

export type TermStatus = "learning" | "known";
export type TermKind = "word" | "phrase";

/**
 * Saved terms of one language: key → status. A word's key is its base form; a
 * phrase's key is its words' base forms joined by single spaces ("figure out").
 */
export type TermIndex = ReadonlyMap<string, TermStatus>;

/**
 * `known` covers saved known terms and unsaved words ranked within the known level
 * (treated as known, not saved). `new` covers unsaved words above the level and unsaved
 * dictionary phrases. `ignored`: not in the vocabulary, numbers, single letters.
 */
export type Category = TermStatus | "new" | "ignored";

export interface Span {
  start: number;
  end: number;
  key: string;
  kind: TermKind;
  category: Category;
}

export interface ClassifyOptions {
  terms: TermIndex;
  /** Unsaved words ranked at or above this are known. */
  knownLevel: number;
}

export interface Classifier {
  /**
   * Spans for the words, saved phrases and dictionary phrases among the tokens of one
   * block of text.
   */
  classify(tokens: readonly Token[], options: ClassifyOptions): Span[];
}

interface PhraseIndex {
  phrases: ReadonlySet<string>;
  /** Every leading run of words of a phrase ("look", "look up", "look up to"). */
  prefixes: ReadonlySet<string>;
}

function buildPhraseIndex(keys: Iterable<string>): PhraseIndex {
  const phrases = new Set<string>();
  const prefixes = new Set<string>();
  for (const key of keys) {
    if (!key.includes(" ")) continue;
    phrases.add(key);
    const words = key.split(" ");
    for (let n = 1; n <= words.length; n++)
      prefixes.add(words.slice(0, n).join(" "));
  }
  return { phrases, prefixes };
}

/** The saved phrases of each term index, built on first use. */
const savedPhraseIndexes = new WeakMap<TermIndex, PhraseIndex>();

function savedPhraseIndexOf(terms: TermIndex): PhraseIndex {
  let index = savedPhraseIndexes.get(terms);
  if (!index) {
    index = buildPhraseIndex(terms.keys());
    savedPhraseIndexes.set(terms, index);
  }
  return index;
}

const normalize = (text: string) => text.toLowerCase().replaceAll("’", "'");

/** Numbers and single letters are never classified ("I", "a", "3,000", "1st"). */
const isIgnorable = (text: string) =>
  /\p{N}/u.test(text) || [...text].length === 1;

/**
 * Classifies words, saved phrases and the pack's dictionary phrases.
 *
 * - Phrases: a saved or dictionary phrase matches consecutive words (separated only by
 *   spaces) when any combination of their base forms equals its key. Saved phrases win:
 *   where any saved phrase matches, the longest saved one is used, even when a
 *   dictionary phrase is longer; otherwise the longest dictionary phrase. The words
 *   inside a match get no spans of their own. A saved phrase takes its status; an
 *   unsaved dictionary phrase is new (the known level applies to words only) and does
 *   not match over a word saved as learning, which keeps its own span.
 * - A word with several base forms ("better" → better, good, well) takes a saved base
 *   when there is one, a learning one before a known one. Otherwise its key is the
 *   first base form (the word itself when it is in the vocabulary), and it is known
 *   when its most common base form is ranked within the known level.
 */
export function createClassifier(pack: LanguagePack): Classifier {
  // Built once per pack: the dictionary phrases do not change.
  const dictionary = buildPhraseIndex(pack.phrases);
  return {
    classify(tokens, { terms, knownLevel }) {
      const words = tokens.filter((token) => token.isWord);
      const bases = words.map((word) => pack.lemmas(word.text));
      const joined = joinedToNext(tokens);
      const saved = savedPhraseIndexOf(terms);
      const spans: Span[] = [];

      const isPrefix = (run: string) =>
        dictionary.prefixes.has(run) || saved.prefixes.has(run);

      /** Words with a base saved as learning: unsaved dictionary phrases skip them. */
      const learning = bases.map((list) =>
        list.some((base) => terms.get(base) === "learning"),
      );

      const basesOrSelf = (i: number) =>
        bases[i]!.length > 0 ? bases[i]! : [normalize(words[i]!.text)];

      /**
       * The phrase starting at word i, as [key, last word index]: the longest saved
       * phrase, or when no saved phrase matches, the longest dictionary phrase. An
       * unsaved dictionary phrase does not match over a word saved as learning.
       */
      const phraseAt = (i: number): [string, number] | undefined => {
        if (dictionary.phrases.size === 0 && saved.phrases.size === 0)
          return undefined;
        let savedMatch: [string, number] | undefined;
        let dictionaryMatch: [string, number] | undefined;
        let overLearning = learning[i]!;
        let runs = basesOrSelf(i).filter(isPrefix);
        for (let j = i + 1; runs.length > 0 && j < words.length; j++) {
          if (!joined.has(words[j - 1]!)) break;
          overLearning ||= learning[j]!;
          const next = new Set<string>();
          for (const run of runs)
            for (const base of basesOrSelf(j)) {
              const candidate = `${run} ${base}`;
              if (isPrefix(candidate)) next.add(candidate);
            }
          runs = [...next];
          const savedRun = runs.find((run) => saved.phrases.has(run));
          if (savedRun !== undefined) savedMatch = [savedRun, j];
          const dictionaryRun = overLearning
            ? undefined
            : runs.find((run) => dictionary.phrases.has(run));
          if (dictionaryRun !== undefined) dictionaryMatch = [dictionaryRun, j];
        }
        return savedMatch ?? dictionaryMatch;
      };

      for (let i = 0; i < words.length; i++) {
        const word = words[i]!;
        const phrase = phraseAt(i);
        if (phrase) {
          const [key, last] = phrase;
          spans.push({
            start: word.start,
            end: words[last]!.end,
            key,
            kind: "phrase",
            category: terms.get(key) ?? "new",
          });
          i = last;
          continue;
        }
        spans.push({
          start: word.start,
          end: word.end,
          kind: "word",
          ...classifyWord(word.text, bases[i]!, terms, knownLevel, pack),
        });
      }
      return spans;
    },
  };
}

function classifyWord(
  text: string,
  bases: readonly string[],
  terms: TermIndex,
  knownLevel: number,
  pack: LanguagePack,
): { key: string; category: Category } {
  if (isIgnorable(text) || bases.length === 0)
    return { key: normalize(text), category: "ignored" };
  const saved = bases.filter((base) => terms.has(base));
  if (saved.length > 0) {
    const key =
      saved.find((base) => terms.get(base) === "learning") ?? saved[0]!;
    return { key, category: terms.get(key)! };
  }
  const rank = Math.min(...bases.map((base) => pack.rank(base)));
  return { key: bases[0]!, category: rank <= knownLevel ? "known" : "new" };
}

/** Word tokens followed by another word with only whitespace between them. */
function joinedToNext(tokens: readonly Token[]): Set<Token> {
  const joined = new Set<Token>();
  let previous: Token | undefined;
  for (const token of tokens) {
    if (token.isWord) {
      if (previous) joined.add(previous);
      previous = token;
    } else if (!/^\s+$/.test(token.text)) {
      previous = undefined;
    }
  }
  return joined;
}

/** Distinct keys of unsaved new words and phrases, in order: what "save all" adds. */
export function unsavedKeys(spans: readonly Span[]): string[] {
  const keys = new Set<string>();
  for (const span of spans) if (span.category === "new") keys.add(span.key);
  return [...keys];
}
