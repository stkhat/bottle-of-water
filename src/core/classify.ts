import type { CapitalMeaning, EntryOutline } from "./lexicon/dictionary";
import type { LanguagePack } from "./lexicon/language-pack";
import { documentNames } from "./names";
import { chooseKey, readWords, sensePos } from "./word-sense";
import { markerPos, phraseMisfit } from "./phrases/fit";
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
   * Set on a phrase whose key has a slot that another word fills ("her" for one's in
   * "made up her mind" under `make up one's mind`): its key's words are not all its
   * words' keys.
   */
  slot?: true;
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
  /**
   * The part of speech the word's trusted tag gives it here (rule A2, `sensePos`), or a
   * discourse marker's ("interjection" for "you know" at a clause start, `markerPos`):
   * its lookup shows the senses of that part of speech first.
   */
  pos?: string;
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
  /**
   * The dictionary's outline of a headword (`DictionaryProvider.outline`). With it, a
   * pack with a tagger tags each sentence and chooses unsaved words' keys by their tags
   * (rule A1, `chooseKey`) and their spans' `pos` (rule A2).
   */
  outline?(key: string): EntryOutline | undefined;
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
 *   they are placed first, the longest first (words from first to last, gap words
 *   included; on a tie the earlier one), each where it overlaps no phrase placed
 *   before it, even where a dictionary phrase is longer or starts earlier;
 *   dictionary phrases (the longest at each word) fill the words outside them. A saved
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
 * - With a tagger, each sentence is tagged once. A dictionary phrase is matched only
 *   where its context fits it (`phraseMisfit`: "what kind of music" is no adverb "kind
 *   of"); its words are words otherwise. A discourse marker at a clause start takes
 *   its interjection senses (`markerPos`).
 * - With the dictionary's outlines and a pack with a tagger: an unsaved word takes
 *   the base form its tag asks for (rule A1, `chooseKey`: decided → decide) and a
 *   word its trusted tag's part of speech (`pos`, rule A2), unless it is a name or
 *   capitalised in a way that counts.
 */
export function createClassifier(pack: LanguagePack): Classifier {
  // One matcher per pack: its dictionary trie is built once.
  const { matcher } = pack;
  const detects = pack.patterns.detect.length > 0;
  return {
    classify(tokens, { terms, knownLevel, casing, capitalMeaning, outline }) {
      const input = matcher.prepare(tokens);
      const { words } = input;
      const spans: Span[] = [];
      /** With a tagger, each word's tag and use: the phrase rules, A1 and A2 read them. */
      const readings = readWords(pack, tokens, words, casing?.mode === "upper");
      const punctuated = casing?.unpunctuated !== true;
      /** Rule D and written case, in a mixed-case document only. */
      const cases =
        casing?.mode === "mixed" && pack.namesByCase
          ? wordCases(tokens, pack.lang)
          : undefined;
      /** Rule D over the document's runs of capitalised words. */
      const names =
        cases && casing
          ? documentNames(casing, pack, (key) => capitalMeaning?.(key))
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
        if (!casing || !written || !names || word.category === "ignored")
          return {};
        const name = names(written, before[i]);
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
       * Saved phrases first, the longest first (the most words from first to last,
       * gap words included, then the most pattern words, then the earliest start,
       * then the key): each that overlaps no phrase placed before it is placed.
       * `savedAt[i]`: the saved phrase starting at word i; `inSaved[i]`: word i is
       * inside one.
       */
      const savedAt: (PhraseMatch | undefined)[] = [];
      const inSaved: boolean[] = [];
      const savedMatches: PhraseMatch[] = [];
      for (let i = 0; i < words.length; i++)
        savedMatches.push(...matcher.matchesAt(input, i, "saved", terms));
      const first = (m: PhraseMatch) => m.words[0]!;
      const last = (m: PhraseMatch) => m.words.at(-1)!;
      savedMatches.sort(
        (a, b) =>
          last(b) - first(b) - (last(a) - first(a)) ||
          b.words.length - a.words.length ||
          first(a) - first(b) ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      );
      for (const match of savedMatches) {
        let free = true;
        for (let j = first(match); j <= last(match) && free; j++)
          free = !inSaved[j];
        if (!free) continue;
        savedAt[first(match)] = match;
        for (let j = first(match); j <= last(match); j++) inSaved[j] = true;
      }

      /**
       * The phrase starting at word i: the saved phrase there, or the longest
       * dictionary phrase without a word saved as learning or inside a saved phrase,
       * when it is that phrase here (`phraseMisfit`; a shorter one does not stand in
       * for it: "so long as" is no "so long").
       */
      const phraseAt = (i: number): PhraseMatch | undefined => {
        const saved = savedAt[i];
        if (saved || !detects || inSaved[i]) return saved;
        const matches = matcher.matchesAt(input, i, "detect");
        const longest =
          matches.length === 0
            ? undefined
            : longestMatch(
                matches.filter(
                  (match) =>
                    !match.words.some((j) => learning[j] || inSaved[j]),
                ),
              );
        return longest &&
          phraseMisfit(pack, longest, readings, punctuated) === undefined
          ? longest
          : undefined;
      };

      /**
       * A word's key and `pos` by its tag (rules A1 and A2): not for a name, a word
       * capitalised in a way that counts (its capitalised senses come first) or one
       * the tagger did not read; a saved word keeps its saved key.
       */
      const bySense = (
        i: number,
        word: { key: string; category: Category },
        marks: Partial<Span>,
      ): Partial<Span> => {
        const reading = readings[i];
        if (!reading || !outline || word.category === "ignored") return {};
        if (marks.capital || marks.name) return {};
        const { token, bases } = words[i]!;
        const form = normalizeWord(token.text);
        const key = terms.has(word.key)
          ? word.key
          : (chooseKey(form, bases, reading, outline, pack) ?? word.key);
        const pos = sensePos(form, key, reading);
        return { key, ...(pos !== undefined && { pos }) };
      };

      const pushWord = (i: number) => {
        const { token, bases } = words[i]!;
        const word = classifyWord(token.text, bases, terms, knownLevel, pack);
        const marks = casingOf(i, word);
        spans.push({
          start: token.start,
          end: token.end,
          kind: "word",
          ...word,
          ...marks,
          ...bySense(i, word, marks),
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
        const pos = markerPos(pack, match, readings, punctuated);
        const last = match.words.at(-1)!;
        const runs = runsOf(match.words);
        const keyWords = key.split(" ").map(normalizeWord);
        const slot = match.words.some(
          (j, n) => !words[j]!.forms.includes(keyWords[n]!),
        );
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
            ...(pos !== undefined && { pos }),
            ...(slot && { slot }),
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
