import type { CapitalMeaning } from "./lexicon/dictionary";
import type { LanguagePack } from "./lexicon/language-pack";
import { nameVerdict } from "./names";
import { longestMatch, type PhraseMatch } from "./phrases/matcher";
import {
  capitalHere,
  wordCases,
  type DocumentCasing,
  type WordCase,
} from "./text/casing";
import { normalizeWord, type Token } from "./text/tokenize";

export type TermStatus = "learning" | "known";
/** A term as the UI shows it: saved, or `new` while not saved. Also the highlight categories. */
export type WordStatus = TermStatus | "new";
/**
 * A removed term stays as a tombstone (its `updatedAt` is the removal time) so that
 * sync and import carry the removal to other copies.
 */
export type StoredStatus = TermStatus | "removed";
export type TermKind = "word" | "phrase";

/**
 * Saved terms of one language: key → status. A word's key is its base form; a
 * phrase's key is a dictionary pattern's key ("figure out", "make up one's mind") or
 * its words' keys joined by single spaces.
 */
export type TermIndex = ReadonlyMap<string, TermStatus>;

/**
 * `known` covers saved known terms and unsaved words ranked within the known level
 * (treated as known, not saved). `new` covers unsaved words above the level and unsaved
 * dictionary phrases. `ignored`: not in the vocabulary, numbers, single letters.
 */
export type Category = WordStatus | "ignored";

/** Which part of a phrase with a gap a span is, and where the whole phrase is. */
interface SpanPart {
  /** 0 for the first part. */
  index: number;
  /** How many parts the phrase has. */
  count: number;
  /** The whole phrase: its first word's start to its last word's end, gap included. */
  start: number;
  end: number;
}

export interface Span {
  start: number;
  end: number;
  key: string;
  kind: TermKind;
  category: Category;
  /**
   * Set on each part of a phrase matched with a gap: "figure" and "out" in "figure it
   * out" are two spans with the key "figure out", and "it" keeps its own span between
   * them. Each part has the phrase's key, kind and category; count the phrase once
   * (at `index` 0).
   */
  part?: SpanPart;
  /**
   * A word capitalised on the page in a way that counts (`capitalHere`, or a name that
   * keeps its capitalised meaning): its lookup asks for the capitalised headword's
   * senses first.
   */
  capital?: true;
  /**
   * A word rule D takes for a name in this document (`nameVerdict`): `ignored`, so it
   * gets no highlight and no hover, and the sentence history does not index it.
   */
  name?: true;
}

export interface ClassifyOptions {
  terms: TermIndex;
  /** Unsaved words ranked at or above this are known. */
  knownLevel: number;
  /** The document's casing (rule D), when the page sends it. */
  casing?: DocumentCasing;
  /**
   * What the dictionary's capitalised headword of a word means
   * (`DictionaryProvider.capitalMeaning`): a name with such a meaning stays a word
   * and shows it (France → フランス, June → 6月).
   */
  capitalMeaning?(key: string): CapitalMeaning | undefined;
}

export interface Classifier {
  /**
   * Spans for the words, saved phrases and dictionary phrases among the tokens of one
   * block of text, in text order and without overlaps.
   */
  classify(tokens: readonly Token[], options: ClassifyOptions): Span[];
}

/** Numbers and single letters are never classified ("I", "a", "3,000", "1st"). */
const isIgnorable = (text: string) =>
  /\p{N}/u.test(text) || [...text].length === 1;

/** A match's words as runs of consecutive words, each as [first, last]. */
function runsOf(words: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const word of words) {
    const run = runs.at(-1);
    if (run && run[1] === word - 1) run[1] = word;
    else runs.push([word, word]);
  }
  return runs;
}

/**
 * Classifies words, saved phrases and the pack's dictionary phrases.
 *
 * - Phrases (`pack.matcher`): a pattern's word matches a word as written or by any of
 *   its base forms, and the words of a match are separated only by spaces. Saved
 *   phrases match in "saved" mode (slots: "made up his mind" is `make up one's mind`;
 *   a gap when the pack flags the phrase as one: "figure it out" is `figure out`);
 *   dictionary phrases in "detect" mode (contiguous, no slots). Saved phrases win:
 *   where any saved phrase matches, the longest saved one is used, even when a
 *   dictionary phrase is longer; otherwise the longest dictionary phrase. A saved
 *   phrase takes its status; an unsaved dictionary phrase is new (the known level
 *   applies to words only) and does not match over a word saved as learning, which
 *   keeps its own span.
 * - A phrase's words get no spans of their own. A phrase with a gap gets one span per
 *   run of its words (`part`); the words in the gap are classified as words.
 * - A word with several base forms ("better" → better, good, well) takes a saved base
 *   when there is one, a learning one before a known one. Otherwise its key is the
 *   first base form (the word itself when it is in the vocabulary), and it is known
 *   when its most common base form is ranked within the known level.
 * - With the document's casing (a mixed-case document, a language whose capitals mark
 *   names): a name (`nameVerdict`) is ignored, even a saved word, unless it keeps a
 *   capitalised meaning; that one and a word capitalised in a way that counts
 *   (`capitalHere`) get `capital`.
 */
export function createClassifier(pack: LanguagePack): Classifier {
  // One matcher per pack: its dictionary trie is built once.
  const { matcher } = pack;
  const detects = pack.patterns.detect.length > 0;
  return {
    classify(tokens, { terms, knownLevel, casing, capitalMeaning }) {
      const input = matcher.prepare(tokens);
      const { words } = input;
      const spans: Span[] = [];
      /** Rule D and written case, in a mixed-case document only. */
      const cases =
        casing?.mode === "mixed" && pack.namesByCase
          ? wordCases(tokens, pack.lang)
          : undefined;

      /** For each word, the word before it when only spaces come between them. */
      const before: (string | undefined)[] = [];
      if (cases) {
        let previous: string | undefined;
        /** Only whitespace since the previous word. */
        let spaces = true;
        for (const token of tokens) {
          if (token.isWord) {
            before.push(spaces ? previous : undefined);
            previous = normalizeWord(token.text);
            spaces = true;
          } else spaces &&= /^\s+$/.test(token.text);
        }
      }

      /** A word span's casing marks: a name, or capitalised in a way that counts. */
      const casingOf = (
        i: number,
        word: { key: string; category: Category },
      ): Partial<Span> => {
        const written: WordCase | undefined = cases?.[i];
        if (!casing || !written || word.category === "ignored") return {};
        const name = nameVerdict(written, casing, pack, before[i], () =>
          capitalMeaning?.(word.key),
        );
        if (name === "name") return { category: "ignored", name: true };
        return name === "kept" || capitalHere(casing, written)
          ? { capital: true }
          : {};
      };

      /** Words with a base saved as learning: unsaved dictionary phrases skip them. */
      const learning = words.map(({ bases }) =>
        bases.some((base) => terms.get(base) === "learning"),
      );

      /**
       * The phrase starting at word i: the longest saved phrase, or when no saved
       * phrase matches, the longest dictionary phrase without a word saved as learning.
       */
      const phraseAt = (i: number): PhraseMatch | undefined => {
        const saved = matcher.longestAt(input, i, "saved", terms);
        if (saved || !detects) return saved;
        const matches = matcher.matchesAt(input, i, "detect");
        return matches.length === 0
          ? undefined
          : longestMatch(
              matches.filter((match) => !match.words.some((j) => learning[j])),
            );
      };

      const pushWord = (i: number) => {
        const { token, bases } = words[i]!;
        const word = classifyWord(token.text, bases, terms, knownLevel, pack);
        spans.push({
          start: token.start,
          end: token.end,
          kind: "word",
          ...word,
          ...casingOf(i, word),
        });
      };

      for (let i = 0; i < words.length; i++) {
        const match = phraseAt(i);
        if (!match) {
          pushWord(i);
          continue;
        }
        const { key } = match;
        const category = terms.get(key) ?? "new";
        const last = match.words.at(-1)!;
        const runs = runsOf(match.words);
        const whole = {
          start: words[i]!.token.start,
          end: words[last]!.token.end,
        };
        runs.forEach(([first, end], index) => {
          // The words in the gap before this part.
          if (index > 0)
            for (let j = runs[index - 1]![1] + 1; j < first; j++) pushWord(j);
          spans.push({
            start: words[first]!.token.start,
            end: words[end]!.token.end,
            key,
            kind: "phrase",
            category,
            ...(runs.length > 1 && {
              part: { index, count: runs.length, ...whole },
            }),
          });
        });
        i = last;
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
    return { key: normalizeWord(text), category: "ignored" };
  const saved = bases.filter((base) => terms.has(base));
  if (saved.length > 0) {
    const key =
      saved.find((base) => terms.get(base) === "learning") ?? saved[0]!;
    return { key, category: terms.get(key)! };
  }
  const rank = Math.min(...bases.map((base) => pack.rank(base)));
  return { key: bases[0]!, category: rank <= knownLevel ? "known" : "new" };
}

/**
 * Distinct keys of unsaved new words and phrases, in order: what "save all" adds (the
 * parts of a phrase with a gap share one key).
 */
export function unsavedKeys(spans: readonly Span[]): string[] {
  const keys = new Set<string>();
  for (const span of spans) if (span.category === "new") keys.add(span.key);
  return [...keys];
}
