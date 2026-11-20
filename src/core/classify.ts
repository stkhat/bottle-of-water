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
import type { Token } from "./text/tokenize";

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

/**
 * The most frequent words a single letter must rank among to be a word of its own. The
 * letters that are words rank far above those that are letters only, in every learning
 * language's frequency list: French à 12, a 15, y 40; Spanish y 6, a 7, e 20, o 29;
 * English i 2, a 5; the first letter that is no word ranks 360th (English j) or lower
 * (French h 531, Spanish m 739, German a 899).
 */
const LETTER_WORD_RANK = 100;

/**
 * The parts of speech (the tag's `label`) of a single letter that gets a card: a verb
 * form or a conjunction stands alone, and its one gloss reads right (French "a",
 * avoir; Spanish "y", "o"). A one-letter preposition, pronoun or article is part of a
 * construction its first gloss misreads (French "à" in "aider à finir", "y" in "il y
 * a", Spanish "a" in "voy a ver"): judged blind (C2, 2026-11-20), learners were
 * better served by no card there (8 good of 37), and by a card for the verbs and
 * conjunctions (43 good of 45). English "a" and "I" stay letters.
 */
const LETTER_WORD_POS: ReadonlySet<string> = new Set(["verb", "conjunction"]);

/**
 * Numbers and single letters are never classified ("3,000", "1st", "B" in "Plan B",
 * English "I", "a"), but for a letter that is one of the language's most frequent
 * words (`LETTER_WORD_RANK`) and that the tagger reads, with a trusted tag (`label`),
 * as a verb or a conjunction (`LETTER_WORD_POS`). `form`: the text normalized
 * (`normalizeWord`).
 */
const isIgnorable = (
  text: string,
  form: string,
  pack: LanguagePack,
  label?: string,
) =>
  /\p{N}/u.test(text) ||
  ([...text].length === 1 &&
    !(
      label !== undefined &&
      LETTER_WORD_POS.has(label) &&
      pack.rank(form) <= LETTER_WORD_RANK
    ));

/** Parts of speech of a pattern that governs what follows, as a preposition does. */
const PREPOSITIONAL: ReadonlySet<string> = new Set(["prep", "prep_phrase"]);

/** The source's parts of speech whose words inflect (rule FIXED). */
const INFLECTING: ReadonlySet<string> = new Set([
  ...["verb", "noun", "adj", "name", "phrase", "proverb"],
]);

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
 * The parts of speech (the source's, `PhrasePatterns.pos`) of a phrase that can be a
 * verb's complement (rule COMPLEMENT): a noun, an adjective, a prepositional phrase.
 */
const COMPLEMENT_POS: readonly string[] = ["noun", "adj", "prep_phrase"];

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
      const withCases =
        casing?.mode === "mixed" && (pack.namesByCase || pack.nounsCapitalised);
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
        cases && casing && pack.namesByCase
          ? documentNames(casing, pack, (key) => capitalMeaning?.(key))
          : undefined;

      /** The word before word i when only spaces come between them. */
      /**
       * The word that opens word i's noun phrase, for rule D: the word before it when
       * only spaces come between them; where every noun is capitalised
       * (`LanguagePack.nounsCapitalised`), past the adjectives before it, which the
       * language writes in lower case ("Der blaue Engel": der).
       */
      const before = (i: number) => {
        let j = i - 1;
        if (pack.nounsCapitalised)
          while (
            j > 0 &&
            joined[j - 1] &&
            /^\p{Ll}/u.test(words[j]!.token.text) &&
            words[j]!.bases.some((base) =>
              pack.partsOfSpeech(base).includes("adjective"),
            )
          )
            j--;
        return j >= 0 && joined[j] ? words[j]!.form : undefined;
      };

      /** Rule D reads word i as a name here. */
      const nameAt = (i: number) => {
        const written = cases?.[i];
        const { token, bases } = words[i]!;
        return (
          written !== undefined &&
          names !== undefined &&
          bases.length > 0 &&
          !isIgnorable(
            token.text,
            words[i]!.form,
            pack,
            readings[i]?.tag?.label,
          ) &&
          !(pack.nounsCapitalised && written.written === "lower") &&
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
        if (!casing || !written || word.category === "ignored") return {};
        // Where every noun is capitalised, a word in lower case is no name.
        const name =
          pack.nounsCapitalised && written.written === "lower"
            ? false
            : (names?.(written, before(i)) ?? false);
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
       * word with neither does not count against the phrase; a verb (tagged so, or
       * mainly one without a trusted tag) matched through a base that is no verb is
       * another word ("landen unter" is no `land unter`). A headword tagged as a
       * part of speech of its own that the base has none of is no form of it ("fuera
       * de": the adverb, not `ir de`; "de vista": the noun, not `de vestir`).
       */
      const offBase = (match: PhraseMatch) => {
        if (!outline) return false;
        const keyWords = matcher.keyParts(match.key).words;
        return match.words.some((j, n) => {
          const { form, bases } = words[j]!;
          const reading = readings[j];
          const word = verbOf(keyWords[n]!, bases);
          const tag = reading?.tag;
          if (word === form || bases.length < 2 || !bases.includes(word))
            return false;
          // A word that is mainly a verb itself, or tagged as one, is no form of a
          // base that is no verb ("landen unter" is no `land unter`).
          const verb =
            tag === undefined
              ? bases.includes(form) && pack.partsOfSpeech(form)[0] === "verb"
              : tag.inflected && tag.label === "verb";
          if (verb && !pack.partsOfSpeech(word).includes("verb")) return true;
          if (tag === undefined) return false;
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

      /**
       * Rule FIXED: a pattern the source has only as an invariable expression (no verb,
       * noun, adjective or name among its parts of speech: a conjunction, adverb,
       * interjection…) is written as it is: a word of it matched through a base form
       * is another expression ("ils disent que" is no `dire que`, to think that; "faire
       * mieux" no `faire bien`). A contraction for its preposition, and an elided
       * spelling ("parce qu'il"), count as written.
       */
      const inflectedFixed = (match: PhraseMatch) => {
        const own = pack.phrasePos(match.key);
        if (own.length === 0 || own.some((pos) => INFLECTING.has(pos)))
          return false;
        const keyWords = matcher.keyParts(match.key).words;
        return match.words.some(
          (j, n) => !written(keyWords[n]!, words[j]!.form),
        );
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
                !pack.phrasePos(outer.key).some((pos) => own.includes(pos)) &&
                complementIn(outer)?.key !== match.key,
            )
          )
            return true;
        return false;
      };

      /**
       * Rule COMPLEMENT: a verb pattern matched only on selection that is one lexical
       * verb and a pattern of a complement's part of speech after it (a noun, an
       * adjective, a prepositional phrase: "fall" + `in love`, "get" + `in touch`) is
       * that verb with its complement, which keeps its meaning there (a detected one
       * stays highlighted): the complement's match, else undefined. Not a modal's
       * ("might as well": the adverb `as well` is another expression there), nor an
       * adverb's or an interjection's.
       */
      const complementIn = (outer: PhraseMatch): PhraseMatch | undefined => {
        if (outer.lead !== undefined || outer.words.length < 3)
          return undefined;
        const outerPos = pack.phrasePos(outer.key);
        if (outerPos.length === 0 || outerPos.some((pos) => pos !== "verb"))
          return undefined;
        const verb = first(outer);
        const role = readings[verb]?.role;
        if (role?.modal || role?.be) return undefined;
        const head = matcher.keyParts(outer.key).words[0]!;
        if (pack.partsOfSpeech(head)[0] !== "verb") return undefined;
        const rest = outer.words.slice(1);
        return contiguousAt(verb + 1).find((inner) => {
          const pos = pack.phrasePos(inner.key);
          return (
            inner.lead === undefined &&
            inner.words.length === rest.length &&
            inner.words.every((j, n) => j === rest[n]) &&
            pos.length > 0 &&
            pos.every((one) => COMPLEMENT_POS.includes(one))
          );
        });
      };

      /**
       * A detected phrase that a verb and its complement there (rule COMPLEMENT) cut
       * across: "fell in" in "fell in love" is no `fall in`, "got in" in "got in
       * touch" no `get in`.
       */
      const crossesComplement = (match: PhraseMatch) =>
        contiguousAt(first(match)).some((outer) => {
          if (last(outer) <= last(match) || pack.phrases.has(outer.key))
            return false;
          const inner = complementIn(outer);
          return inner !== undefined && first(inner) <= last(match);
        });

      /**
       * Rule LITERAL: a detected phrase that reads a word as a form of another word, a
       * word the tagger is unsure of, is not that phrase where the words as written are
       * a preposition of their own that the phrase is not ("Fuera de Chile": the
       * preposition `fuera de`, not `ir de`): the text is that other expression.
       */
      const written = (word: string, form: string) =>
        word === form ||
        pack.rules.contractions?.get(form) === word ||
        // An elided spelling of the word ("qu'" for que, "d'" for de).
        (form.length > 1 &&
          form.endsWith("'") &&
          word.startsWith(form.slice(0, -1)));
      const writtenOther = (match: PhraseMatch) => {
        const keyWords = matcher.keyParts(match.key).words;
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
            matcher
              .keyParts(other.key)
              .words.every((word, n) =>
                written(word, words[match.words[n]!]!.form),
              ) &&
            prepositional(pack.phrasePos(other.key), own),
        );
      };

      /**
       * A verb moved before its pattern's other words (`PhraseMatch.moved`) is read as
       * a verb: "Leben" in "Das Leben macht Spaß" is no form of leben.
       */
      const finiteVerb = (i: number) => {
        const reading = readings[i];
        if (!reading) return true;
        return reading.tag
          ? reading.tag.label === "verb"
          : reading.use.grammarPos === "verb";
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
          crossesComplement(longest) ||
          writtenOther(longest) ||
          inflectedFixed(longest) ||
          (longest.lead === undefined &&
            readings[first(longest)]?.use.pronominal === true) ||
          (longest.moved === true && !finiteVerb(longest.lead!))
        )
          return undefined;
        const context = fitContext(pack, longest, readings);
        return phraseMisfit(pack, longest, readings, punctuated, context) ===
          undefined
          ? { match: longest, context }
          : undefined;
      };

      /**
       * Word i is an utterance of its own, a word whose entry has interjection senses,
       * with punctuation or the block's start before it and a sentence's punctuation
       * right after it, in a punctuated document ("¿Vale?", "Mira, …", "Tranquilos."):
       * its interjection senses come first (rule A2), whatever its tag, as a discourse
       * marker's do (`markerPos`). Not inside brackets, a caption's sound label
       * ("[sighs]"), nor a word that is mainly a pronoun or a determiner.
       */
      const standsAlone = (i: number, key: string) => {
        if (!block || !outline) return false;
        if (!punctuated) return opensUnpunctuated(i, key);
        const { start, end } = words[i]!.token;
        const opening = i > 0 ? words[i - 1]!.token.end : 0;
        const between = block.text.slice(opening, start);
        if (i > 0 && !readings[i]!.pauseBefore) return false;
        if (/[[(]/.test(between)) return false;
        const closing =
          i + 1 < words.length ? words[i + 1]!.token.start : block.text.length;
        if (!/^["”»'’]?[,.;:!?…]/u.test(block.text.slice(end, closing)))
          return false;
        // A pronoun or determiner standing alone is itself ("¿Tú?", "Esa.").
        const main = pack.partsOfSpeech(key)[0];
        if (main === "pronoun" || main === "determiner") return false;
        return outline(key)?.pos.includes("interjection") === true;
      };

      /**
       * Without punctuation (speech recognition), an utterance is read by where it
       * stands: an adjective (its main part of speech) whose entry has interjection
       * senses, read as an adjective or not read, with nothing to qualify before it
       * (the block's start, a conjunction or an interjection) and no complement after
       * it (a preposition): "y bueno yo creo" (well), "pues bueno", "bueno hoy
       * estamos"; not "está bueno", "muy bueno", "nada bueno", "bueno para mí". Words
       * mainly of other parts of speech stay as read ("si fuera yo", "sino salud
       * mental"). Only in a language that asks for it
       * (`LanguagePack.unpunctuatedUtterances`).
       */
      const opensUnpunctuated = (i: number, key: string) => {
        if (!pack.unpunctuatedUtterances) return false;
        const label = (j: number) =>
          readings[j]?.tag?.label ?? pack.partsOfSpeech(words[j]!.form)[0];
        const own = readings[i]?.tag?.label;
        if (own !== undefined && own !== "adjective") return false;
        if (
          i > 0 &&
          !["conjunction", "interjection"].includes(label(i - 1) ?? "")
        )
          return false;
        if (i + 1 < words.length && label(i + 1) === "preposition")
          return false;
        if (pack.partsOfSpeech(key)[0] !== "adjective") return false;
        return outline!(key)?.pos.includes("interjection") === true;
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
        // A capital that marks a noun or the polite Sie says nothing of the tag.
        if (marks.name || (marks.capital && !pack.nounsCapitalised)) return {};
        const { form, bases } = words[i]!;
        const key =
          terms.has(word.key) || reading.use.particleOf !== undefined
            ? word.key
            : (chooseKey(form, bases, reading, outline, pack) ?? word.key);
        // A headword this dictionary has no entry for ("has" in en-ru); a form that is
        // no headword ("gets") is looked up by its base like any form.
        const ownEntry = !bases.includes(form) || outline(form) !== undefined;
        const pos = standsAlone(i, key)
          ? "interjection"
          : sensePos(form, key, reading, ownEntry);
        const { clitic } = reading.use;
        return {
          key,
          ...(pos !== undefined && { pos }),
          ...(clitic !== undefined && { clitic }),
        };
      };

      /**
       * A compound with a noun head the page writes in lower case, in a document that
       * writes its nouns capitalised (`LanguagePack.nounsCapitalised`, mixed case), is
       * no such noun ("summende": the participle, not summen + Ende; "alchemistische"):
       * it stays unknown. Speech recognition without punctuation, which writes many
       * nouns in lower case, keeps them ("kinderfahrradsitze", "falkennest").
       */
      const lowerNoun = (token: Token, bases: readonly string[]) => {
        if (
          !pack.nounsCapitalised ||
          casing?.mode !== "mixed" ||
          casing.unpunctuated === true ||
          bases.length !== 1 ||
          !/^\p{Ll}/u.test(token.text)
        )
          return false;
        const found = pack.compound(token.text);
        return found?.noun === true && found.key === bases[0];
      };

      const pushWord = (i: number) => {
        const { token, form } = words[i]!;
        // A separable verb's particle reads as its verb ("sieht … aus": aussehen), and
        // so does its finite form, which is saved and counted as that verb, not as
        // the simple verb it shares its forms with ("warfen … vor": vorwerfen, not
        // werfen).
        const use = readings[i]?.use;
        const verb =
          use?.particleOf ?? (use?.separable === true ? use.base : undefined);
        const bases =
          verb !== undefined
            ? [verb]
            : lowerNoun(token, words[i]!.bases)
              ? []
              : words[i]!.bases;
        const word = classifyWord(
          token.text,
          form,
          // In a document in capitals, case says nothing: no capital-only word
          // (PAM is Pam there, not an acronym).
          casing?.mode === "upper"
            ? bases.filter((base) => !pack.capitalOnly(base))
            : bases,
          terms,
          knownLevel,
          pack,
          readings[i]?.tag?.label,
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

      /**
       * Words `from` to `to` (exclusive): the phrases that start and end among them,
       * else words. The words in a phrase's gap are placed so too ("nimmt zum Beispiel
       * das in Kauf": `zum beispiel` inside `in kauf nehmen`).
       */
      const place = (from: number, to: number) => {
        for (let i = from; i < to; i++) {
          const found = phraseAt(i);
          if (!found || found.match.words.at(-1)! >= to) pushWord(i);
          else i = pushPhrase(i, found.match, found.context);
        }
      };

      /** Places a phrase starting at word i, and its gap's words; returns its last word. */
      const pushPhrase = (
        i: number,
        match: PhraseMatch,
        context: ReturnType<typeof fitContext>,
      ) => {
        const { key } = match;
        const category = terms.get(key) ?? "new";
        const pos = markerPos(pack, match, readings, punctuated, context);
        const last = match.words.at(-1)!;
        const runs = runsOf(allWords(match));
        // A saved key may write other separators than spaces ("wh-what").
        const keyWords = matcher.keyParts(key).words;
        // A slot word filled by another word ("his" for "one's").
        const slot = match.words.some(
          (j, n) =>
            pack.rules.slots.has(keyWords[n]!) &&
            !words[j]!.literals.includes(keyWords[n]!),
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
          if (index > 0) place(runs[index - 1]![1] + 1, first);
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
        return last;
      };

      place(0, words.length);
      return spans;
    },
  };
}

/** `form`: `text` normalized (`normalizeWord`); `label`: its trusted tag's part of speech. */
function classifyWord(
  text: string,
  form: string,
  bases: readonly string[],
  terms: TermIndex,
  knownLevel: number,
  pack: LanguagePack,
  label?: string,
): { key: string; category: Category } {
  if (isIgnorable(text, form, pack, label) || bases.length === 0)
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
