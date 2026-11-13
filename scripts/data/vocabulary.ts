// Rule E: the vocabulary from the learning language's own Wiktionary. The pair
// dictionary's single-word headwords (EJDict for English) are joined by every kaikki
// headword that is a word of the language in its own right and in use: written in
// lower case often enough in the usage examples and quotations of other entries (the
// example corpus, `examples.ts`) since 1900. The count keeps rare and technical words
// out, most old spellings ("clepe"), and names, which the examples write capitalised.
// Language-independent (CORE): the language gives the shape of its words, the part of
// speech of its proper nouns and its possessive.
import { byCodeUnit, type KaikkiEntry } from "./common.ts";
import { entryExamplePieces, pieceWords } from "./examples.ts";
import { entrySenses } from "./senses.ts";

/** What rule E needs to know of the learning language (LEARNING). */
export interface WordLanguage {
  /** A word as the tokenizer keeps it, in lower case. */
  word: RegExp;
  /** kaikki's part of speech of proper nouns: an entry of it is no meaning of a word. */
  name: string;
  /** The possessive ending: a possessive of a vocabulary word is no word of its own. */
  possessive?: string;
}

/**
 * English words: letters with inner apostrophes ("y'all", "ma'am"). The tokenizer
 * splits at hyphens and digits, so a hyphenated headword never meets a token.
 */
const ENGLISH_WORDS: WordLanguage = {
  word: /^[a-z][a-z']*$/,
  name: "name",
  possessive: "'s",
};

/** A new word is written in lower case at least this often in other entries' examples. */
const MIN_EXAMPLES = 8;
/** Quotations from before this year are not counted: they write older spellings. */
const SINCE = 1900;

/** Tags of a sense that abbreviates something: an acronym's lowercase entry may be one. */
const ABBREVIATION: ReadonlySet<string> = new Set([
  "abbreviation",
  "acronym",
  "initialism",
]);

export interface VocabularyRule {
  /** Reads one entry of the extract (an entry of the learning language). */
  add(entry: KaikkiEntry): void;
  /** Whether a headword has the shape of a word the rule may add. */
  shaped(word: string): boolean;
  /**
   * How often the examples write `word` in lower case, with its inflected forms
   * (`forms`): what rule E counts, and what ranks a word the frequency list lacks.
   */
  count(word: string, forms: readonly string[]): number;
  /**
   * The words rule E adds to `vocab`, sorted: each headword with a meaning of its own
   * (a sense that is not an inflection, not obsolete, archaic or a misspelling, in an
   * entry that is not a proper noun; a spelling or clipping pointer counts), that is
   * not a form the vocabulary already has (`lemmas`: "years", "based"; an inflection
   * of another word with a meaning; a possessive), written in lower case at least
   * `minExamples` times with its inflected forms (`formsOf`). A word the examples
   * write more often as an acronym (AI) joins only when its own entry is that acronym
   * (an abbreviation, or a pointer to the word in capitals), not another word ("ai",
   * a sloth): text that writes it in capitals means the acronym.
   */
  select(inputs: {
    vocab: ReadonlySet<string>;
    lemmas: Readonly<Record<string, unknown>>;
    formsOf: (word: string) => readonly string[];
  }): string[];
}

export function createVocabularyRule(
  language: WordLanguage = ENGLISH_WORDS,
  { minExamples = MIN_EXAMPLES, since = SINCE } = {},
): VocabularyRule {
  /** Word → how often the examples write it in lower case. */
  const lower = new Map<string, number>();
  /** Word → how often the examples write it in capitals (two letters or more). */
  const capitals = new Map<string, number>();
  /** Headwords with a meaning of their own. */
  const meaning = new Set<string>();
  /** Headwords with an abbreviation sense, or a pointer to another casing of themselves. */
  const abbreviation = new Set<string>();
  /** Headword → the words its inflection senses name ("years" → year). */
  const inflectionOf = new Map<string, Set<string>>();
  const count = (word: string, forms: readonly string[]) =>
    [word, ...forms].reduce((sum, form) => sum + (lower.get(form) ?? 0), 0);
  const bump = (counts: Map<string, number>, word: string) =>
    counts.set(word, (counts.get(word) ?? 0) + 1);
  return {
    add(entry) {
      for (const piece of entryExamplePieces(entry, since))
        for (const token of pieceWords(piece)) {
          const folded = token.toLowerCase();
          if (token === folded) bump(lower, token);
          else if (token.length > 1 && token === token.toUpperCase())
            bump(capitals, folded);
        }
      const word = entry.word;
      if (!language.word.test(word)) return;
      for (const sense of entrySenses(entry).senses) {
        if (sense.inflection) {
          if (sense.target === undefined) continue;
          let bases = inflectionOf.get(word);
          if (!bases) inflectionOf.set(word, (bases = new Set()));
          bases.add(sense.target.toLowerCase());
          continue;
        }
        if (entry.pos === language.name) continue;
        meaning.add(word);
        if (
          sense.tags.some((tag) => ABBREVIATION.has(tag)) ||
          (sense.target !== undefined &&
            sense.target !== word &&
            sense.target.toLowerCase() === word)
        )
          abbreviation.add(word);
      }
    },
    shaped: (word) => language.word.test(word),
    count,
    select({ vocab, lemmas, formsOf }) {
      const { possessive } = language;
      const isForm = (word: string) =>
        Object.hasOwn(lemmas, word) ||
        [...(inflectionOf.get(word) ?? [])].some(
          (base) => base !== word && (vocab.has(base) || meaning.has(base)),
        ) ||
        (possessive !== undefined &&
          word.endsWith(possessive) &&
          vocab.has(word.slice(0, -possessive.length)));
      const otherThanAcronym = (word: string) =>
        (capitals.get(word) ?? 0) > (lower.get(word) ?? 0) &&
        !abbreviation.has(word);
      return [...meaning]
        .filter(
          (word) =>
            !vocab.has(word) &&
            !isForm(word) &&
            count(word, formsOf(word)) >= minExamples &&
            !otherThanAcronym(word),
        )
        .sort(byCodeUnit);
    },
  };
}
