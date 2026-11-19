import type { CapitalMeaning, EntryOutline } from "./lexicon/dictionary";
import type { LanguagePack } from "./lexicon/language-pack";
import { accepts } from "./lexicon/sense-order";
import { documentNames } from "./names";
import { chooseKey, readWords, sensePos } from "./word-sense";
import { fitContext, markerPos, phraseMisfit } from "./phrases/fit";
import { longestMatch, matchStart, type PhraseMatch } from "./phrases/matcher";
import {
  capitalHere,
  wordCases,
  type DocumentCasing,
  type WordCase,
} from "./text/casing";
import { blockText } from "./text/sentences";
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
   * The part of speech the word's trusted tag gives it here (rule A2, `sensePos`; an
   * auxiliary's is "auxiliary"), or a discourse marker's ("interjection" for "you
   * know" at a clause start, `markerPos`): its lookup shows the senses of that part of
   * speech first.
   */
  pos?: string;
  /**
   * What a contraction's clitic stands for here, when its sentence decides (K4: "has" in
   * "he's been", "is" in "he's going"; `WordUse.clitic`): its lookup names that
   * expansion alone ("he has"), not both ("he is / he has").
   */
  clitic?: string;
  /**
   * A phrase's words by its key's words: the part of speech each one's trusted tag
   * gives it here (rule A2, `sensePos`), so the card's word line ("other" in "in
   * other words") shows a sense of that part of speech, as the word's own hover does.
   */
  wordPos?: Readonly<Record<string, string>>;
}

/** Two values of a span's field are the same: equal, or objects with equal fields. */
function sameField(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        (a as Record<string, unknown>)[key] ===
        (b as Record<string, unknown>)[key],
    )
  );
}

function sameSpan(a: Span, b: Span): boolean {
  const keys = Object.keys(a) as (keyof Span)[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => sameField(a[key], b[key]))
  );
}

/**
 * Two classifications of a text are the same, field by field: a text classified again
 * keeps its highlights (and its rendered words) when nothing changed.
 */
export function sameSpans(
  a: readonly Span[] | null | undefined,
  b: readonly Span[] | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((span, i) => sameSpan(span, b[i]!));
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

/** Parts of speech of a pattern that governs what follows, as a preposition does. */
const PREPOSITIONAL: ReadonlySet<string> = new Set(["prep", "prep_phrase"]);

/** A pattern (`pos`) is prepositional, and another (`other`) is not. */
const prepositional = (pos: readonly string[], other: readonly string[]) =>
  pos.some((name) => PREPOSITIONAL.has(name)) &&
  !other.some((name) => PREPOSITIONAL.has(name));

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
 * - A phrase's words get no spans of their own; with a tagger, the phrase's spans
 *   carry the part of speech of each (`wordPos`). A phrase with a gap gets one span
 *   per run of its words (`part`); the words in the gap are classified as words.
 * - A word with several base forms ("better" → better, good, well) takes a saved base
 *   when there is one, a learning one before a known one. Otherwise its key is the
 *   first base form (the word itself when it is in the vocabulary), and it is known
 *   when its most common base form is ranked within the known level.
 * - With the document's casing (a mixed-case document, a language whose capitals mark
 *   names): a name (`nameVerdict`) is ignored, even a saved word, unless it keeps a
 *   capitalised meaning; that one and a word capitalised in a way that counts
 *   (`capitalHere`) get `capital`, unless the language capitalises common words only
 *   in names and titles (`LanguagePack.capitalsForNames`).
 * - A phrase, saved or not, matches no word the document reads as a name ("recuerdo
 *   al Chile" is no `al chile`). A pronominal verb's reflexive pronoun before it is
 *   part of its match (`PhraseMatch.lead`: "me di cuenta"); the words between them
 *   ("se ha quitado la vida") are a gap.
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
  /** Words in the longest pattern (`detect` and `more`), counted on first use. */
  let reach: number | undefined;
  const patternReach = () => {
    if (reach === undefined) {
      reach = 2;
      for (const keys of [pack.patterns.detect, pack.patterns.more])
        for (const key of keys) {
          let words = 1;
          for (let c = key.indexOf(" "); c >= 0; c = key.indexOf(" ", c + 1))
            words++;
          if (words > reach) reach = words;
        }
    }
    return reach;
  };
  return {
    classify(tokens, { terms, knownLevel, casing, capitalMeaning, outline }) {
      const input = matcher.prepare(tokens, casing?.mode === "upper");
      const { words, joined } = input;
      const spans: Span[] = [];
      const withCases = casing?.mode === "mixed" && pack.namesByCase;
      /** The block's text and sentences, read once for the tagger and the casing rules. */
      const block =
        (pack.tagger && words.length > 0) || withCases
          ? blockText(tokens, pack.lang)
          : undefined;
      /** With a tagger, each word's tag and use: the phrase rules, A1 and A2 read them. */
      const readings = readWords(
        pack,
        tokens,
        words,
        casing?.mode === "upper",
        block,
      );
      const punctuated = casing?.unpunctuated !== true;
      /** Rule D and written case, in a mixed-case document only. */
      const cases = withCases
        ? wordCases(
            tokens,
            pack.lang,
            block,
            words.map((word) => word.form),
          )
        : undefined;
      /** Rule D over the document's runs of capitalised words. */
      const names =
        cases && casing
          ? documentNames(casing, pack, (key) => capitalMeaning?.(key))
          : undefined;

      /** The word before word i when only spaces come between them. */
      const before = (i: number) =>
        i > 0 && joined[i - 1] ? words[i - 1]!.form : undefined;

      /** Rule D reads word i as a name here. */
      const nameAt = (i: number) => {
        const written = cases?.[i];
        const { token, bases } = words[i]!;
        return (
          written !== undefined &&
          names !== undefined &&
          bases.length > 0 &&
          !isIgnorable(token.text) &&
          names(written, before(i)) === "name"
        );
      };
      /**
       * A phrase has no word the document reads as a name ("recuerdo al Chile que ya
       * no es" is no `al chile`): a name is no word.
       */
      const withName = (match: PhraseMatch) =>
        cases !== undefined &&
        (match.words.some(nameAt) ||
          (match.lead !== undefined && nameAt(match.lead)));

      /** A word span's casing marks: a name, or capitalised in a way that counts. */
      const casingOf = (
        i: number,
        word: { key: string; category: Category },
      ): Partial<Span> => {
        const written: WordCase | undefined = cases?.[i];
        if (!casing || !written || !names || word.category === "ignored")
          return {};
        const name = names(written, before(i));
        if (name === "name") return { category: "ignored", name: true };
        // A word in capitals English also writes so as a common word (the names
        // lexicon's "!": "OK", an interjection) is that word, not an acronym: its
        // capitals ask for no acronym's senses (U1-8: "OK" → Oklahoma first).
        if (
          written.written === "upper" &&
          pack.name(written.key)?.endsWith("!") === true
        )
          return {};
        return name === "kept" ||
          (!pack.capitalsForNames && capitalHere(casing, written))
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
        savedMatches.push(
          ...matcher
            .matchesAt(input, i, "saved", terms)
            .filter((match) => !withName(match)),
        );
      const first = matchStart;
      /** A match's words, its lead first. */
      const allWords = (m: PhraseMatch) =>
        m.lead === undefined ? m.words : [m.lead, ...m.words];
      /** A match's words, its lead included. */
      const size = (m: PhraseMatch) =>
        m.words.length + (m.lead === undefined ? 0 : 1);
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
       * Rule BASE: a detected phrase's word matched through a base form (an inflected
       * verb with several bases) must be the base rule A1 reads it as: "fue de" is
       * ser, not `ir de`. A1 reads the base it gives as the key, or, when it keeps the
       * word's own entry ("went": "goの過去"), the base that entry is a form of; a
       * word with neither does not count against the phrase. A headword tagged as a
       * part of speech of its own that the base has none of is no form of it ("fuera
       * de": the adverb, not `ir de`; "de vista": the noun, not `de vestir`).
       */
      const offBase = (match: PhraseMatch) => {
        if (!outline) return false;
        const keyWords = match.key.split(" ").map(normalizeWord);
        return match.words.some((j, n) => {
          const { form, bases } = words[j]!;
          const reading = readings[j];
          const word = verbOf(keyWords[n]!, bases);
          const tag = reading?.tag;
          if (
            tag === undefined ||
            word === form ||
            bases.length < 2 ||
            !bases.includes(word)
          )
            return false;
          if (!tag.inflected || tag.label !== "verb")
            return (
              bases.includes(form) &&
              pack.partsOfSpeech(form).some((pos) => accepts(tag.label, pos)) &&
              !pack.partsOfSpeech(word).some((pos) => accepts(tag.label, pos))
            );
          const own = bases.includes(form) ? form : bases[0]!;
          const key = chooseKey(form, bases, reading!, outline, pack) ?? own;
          const base = key === form ? outline(form)?.formOf : key;
          return base !== undefined && bases.includes(base) && base !== word;
        });
      };

      /**
       * A pattern word as a word's base: a pronominal verb's plain verb when the word
       * is a form of that ("darse" for "di" in "me di cuenta").
       */
      const verbOf = (word: string, bases: readonly string[]) => {
        const ending = pack.rules.reflexive?.ending;
        if (
          ending === undefined ||
          bases.includes(word) ||
          !word.endsWith(ending)
        )
          return word;
        const verb = word.slice(0, -ending.length);
        return bases.includes(verb) ? verb : word;
      };

      /** The `select` matches without a gap that start at each word. */
      const selectAt = new Map<number, readonly PhraseMatch[]>();
      const contiguousAt = (s: number) => {
        let found = selectAt.get(s);
        if (!found) {
          found = matcher
            .matchesAt(input, s, "select")
            .filter((m) => last(m) - first(m) + 1 === size(m));
          selectAt.set(s, found);
        }
        return found;
      };
      /**
       * Rule LONGEST: a detected phrase inside a longer pattern that is only matched on
       * selection and starts before it is that pattern's, not its own, when the
       * longer one is another part of speech (or the source gives either none): it is
       * another expression ("de vista" in the noun "punto de vista"; "as well" in the
       * verb "might as well"). One of a part of speech the phrase also has extends it
       * and leaves it its meaning ("off the bat" in "right off the bat"). (A longer
       * detected one that starts before it was placed there already, unless it did
       * not fit.)
       */
      const insideLonger = (match: PhraseMatch) => {
        const start = first(match);
        const end = last(match);
        const own = pack.phrasePos(match.key);
        for (let s = Math.max(0, end + 1 - patternReach()); s < start; s++)
          if (
            contiguousAt(s).some(
              (outer) =>
                last(outer) >= end &&
                !pack.phrases.has(outer.key) &&
                !pack.phrasePos(outer.key).some((pos) => own.includes(pos)),
            )
          )
            return true;
        return false;
      };

      /**
       * Rule LITERAL: a detected phrase that reads a word as a form of another word, a
       * word the tagger is unsure of, is not that phrase where the words as written are
       * a preposition of their own that the phrase is not ("Fuera de Chile": the
       * preposition `fuera de`, not `ir de`): the text is that other expression.
       */
      const written = (word: string, form: string) =>
        word === form || pack.rules.contractions?.get(form) === word;
      const writtenOther = (match: PhraseMatch) => {
        const keyWords = match.key.split(" ").map(normalizeWord);
        // A trusted tag has read the word already (rule BASE).
        const untrusted = match.words.some(
          (j, n) =>
            !written(keyWords[n]!, words[j]!.form) &&
            readings[j]?.tag === undefined,
        );
        if (!untrusted) return false;
        const own = pack.phrasePos(match.key);
        return contiguousAt(first(match)).some(
          (other) =>
            other.key !== match.key &&
            other.lead === undefined &&
            other.words.length === match.words.length &&
            other.words.every((j, n) => j === match.words[n]) &&
            other.key
              .split(" ")
              .every((word, n) =>
                written(word, words[match.words[n]!]!.form),
              ) &&
            prepositional(pack.phrasePos(other.key), own),
        );
      };

      /**
       * The phrase starting at word i, with its context in its sentence (`fitContext`):
       * the saved phrase there, or the longest dictionary phrase without a word saved
       * as learning or inside a saved phrase, when it is that phrase here
       * (`phraseMisfit`; a shorter one does not stand in for it: "so long as" is no
       * "so long").
       */
      const phraseAt = (i: number) => {
        const saved = savedAt[i];
        if (saved)
          return { match: saved, context: fitContext(pack, saved, readings) };
        if (!detects || inSaved[i]) return undefined;
        const matches = matcher.matchesAt(input, i, "detect");
        const longest =
          matches.length === 0
            ? undefined
            : longestMatch(
                matches.filter(
                  (match) =>
                    !allWords(match).some((j) => learning[j] || inSaved[j]) &&
                    !withName(match),
                ),
              );
        if (
          !longest ||
          offBase(longest) ||
          insideLonger(longest) ||
          writtenOther(longest)
        )
          return undefined;
        const context = fitContext(pack, longest, readings);
        return phraseMisfit(pack, longest, readings, punctuated, context) ===
          undefined
          ? { match: longest, context }
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
        const { form, bases } = words[i]!;
        const key = terms.has(word.key)
          ? word.key
          : (chooseKey(form, bases, reading, outline, pack) ?? word.key);
        // A headword this dictionary has no entry for ("has" in en-ru); a form that is
        // no headword ("gets") is looked up by its base like any form.
        const ownEntry = !bases.includes(form) || outline(form) !== undefined;
        const pos = sensePos(form, key, reading, ownEntry);
        const { clitic } = reading.use;
        return {
          key,
          ...(pos !== undefined && { pos }),
          ...(clitic !== undefined && { clitic }),
        };
      };

      const pushWord = (i: number) => {
        const { token, form, bases } = words[i]!;
        const word = classifyWord(
          token.text,
          form,
          bases,
          terms,
          knownLevel,
          pack,
        );
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
        const found = phraseAt(i);
        if (!found) {
          pushWord(i);
          continue;
        }
        const { match, context } = found;
        const { key } = match;
        const category = terms.get(key) ?? "new";
        const pos = markerPos(pack, match, readings, punctuated, context);
        const last = match.words.at(-1)!;
        const runs = runsOf(allWords(match));
        const keyWords = key.split(" ").map(normalizeWord);
        const slot = match.words.some(
          (j, n) => !words[j]!.forms.includes(keyWords[n]!),
        );
        const wordPos: Record<string, string> = {};
        match.words.forEach((j, n) => {
          const reading = readings[j];
          const word = keyWords[n]!;
          const found = reading && sensePos(words[j]!.form, word, reading);
          if (found !== undefined && !Object.hasOwn(wordPos, word))
            wordPos[word] = found;
        });
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
            ...(Object.keys(wordPos).length > 0 && { wordPos }),
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

/** `form`: `text` normalized (`normalizeWord`). */
function classifyWord(
  text: string,
  form: string,
  bases: readonly string[],
  terms: TermIndex,
  knownLevel: number,
  pack: LanguagePack,
): { key: string; category: Category } {
  if (isIgnorable(text) || bases.length === 0)
    return { key: form, category: "ignored" };
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
