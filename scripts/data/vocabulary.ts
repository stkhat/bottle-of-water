// Rule E: the vocabulary from the learning language's own Wiktionary. The pair
// dictionary's single-word headwords (EJDict for English) are joined by every kaikki
// headword that is a word of the language in its own right and in use: written in
// lower case often enough in the usage examples and quotations of other entries (the
// example corpus, `examples.ts`) since 1900, or fewer times when a translation table
// translates it too. The count keeps rare and technical words out, most old spellings
// ("clepe"), and names, which the examples write capitalised.
// Language-independent (CORE): the language gives the shape of its words, the part of
// speech of its proper nouns and its possessive.
import { byCodeUnit, GIVEN_NAME, SURNAME, type KaikkiEntry } from "./common.ts";
import { entryExamplePieces, pieceWords } from "./examples.ts";
import { entrySenses } from "./senses.ts";

/** What rule E needs to know of the learning language (LEARNING). */
export interface WordLanguage {
  /** A word as the tokenizer keeps it, in lower case. */
  word: RegExp;
  /**
   * A word written with capitals as the tokenizer keeps it (AI, Tokyo, iPhone): a
   * capital-only word may have this shape. None: the language has no capital-only words.
   */
  capitalWord?: RegExp;
  /** kaikki's part of speech of proper nouns: an entry of it is no meaning of a word. */
  name: string;
  /**
   * A proper noun's sense that names a person (a given name, a surname), read in its
   * gloss and categories, in lower case.
   */
  person?: RegExp;
  /** The possessive ending: a possessive of a vocabulary word is no word of its own. */
  possessive?: string;
}

/**
 * English words: lower-case Latin letters, with accents (fiancé, café: the tokenizer
 * keeps them, and its key folds only case), and apostrophes after the first letter
 * ("y'all", "ma'am"). The tokenizer splits at hyphens and digits, so a hyphenated
 * headword never meets a token. Capital-only words: Latin letters (with accents:
 * Gruyère) and inner apostrophes, one of them a capital.
 */
const ENGLISH_WORDS: WordLanguage = {
  word: /^(?:(?=\p{Ll})\p{Script=Latin})(?:(?=\p{Ll})\p{Script=Latin}|')*$/u,
  capitalWord: /^(?=.*\p{Lu})\p{Script=Latin}+(?:'\p{Script=Latin}+)*$/u,
  name: "name",
  // Glosses write "the male given names Timothy and Timon"; categories "English
  // surnames".
  person: new RegExp(
    `${GIVEN_NAME.source}|${SURNAME.source}|\\bgiven names\\b|\\bsurnames\\b`,
  ),
  possessive: "'s",
};

/** A new word is written in lower case at least this often in other entries' examples. */
const MIN_EXAMPLES = 8;
/**
 * …or at least this often (`rarer`: hitman 7, paralegal 6, lossless 4) when a
 * translation table translates one of its meanings into at least `MIN_TABLES`
 * languages (Wiktionary translates what is in use; judged on the 2026-11 corpus, 9% of
 * the new hovers with a table were wrong, 42% without: "plex", "hab", "oculus" are
 * product names in text) and the examples write it in lower case at least as often as
 * with a capital (not a name: "Jim", "Pam", "Steven", whose lower-case entries are rare
 * words).
 */
const MIN_RARER_EXAMPLES = 4;
const MIN_TABLES = 1;
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
   * `minExamples` times with its inflected forms (`formsOf`), or `rarer.minExamples`
   * times with a translation table into `rarer.minTables` languages and no more often
   * with a capital than without (`MIN_RARER_EXAMPLES`). A word the examples
   * write more often as an acronym (AI) joins only when its own entry is that acronym
   * (an abbreviation, or a pointer to the word in capitals), not another word ("ai",
   * a sloth): text that writes it in capitals means the acronym.
   */
  select(inputs: {
    vocab: ReadonlySet<string>;
    lemmas: Readonly<Record<string, unknown>>;
    formsOf: (word: string) => readonly string[];
  }): string[];
  /** Whether a headword has the shape of a capital-only word (`capitals`). */
  capitalShaped(headword: string): boolean;
  /**
   * How often the examples write a capital-only word as it is written, with its
   * inflected forms written alike (AED, AEDs).
   */
  capitalCount(written: string): number;
  /**
   * The capital-only words, as written, sorted: each headword with a capital
   * (`WordLanguage.capitalWord`: AI, Tokyo, iPhone) whose lower-case key is no
   * vocabulary word (`vocab`, rule E's words included), no form of one (`lemmas`) and
   * no possessive, with a meaning of its own (as `select` asks; a proper noun's sense
   * counts) that a translation table translates (Wiktionary translates what is
   * notable: Tokyo, AI, ATM; not "Vito", a barangay, or "IC", an initialism of two
   * dozen things none translated, which text means in ways the hover cannot tell),
   * no sense of any entry so written that names a person (Harvey, Kane; and
   * "Corp", a surname, though CORP abbreviates corporation) or points to one's name
   * (Dmitri: alternative form of Dmitry; Jer: diminutive of Jeremy), written so at least
   * `minCapitalExamples` times with its inflected forms (AEDs) and more often than in lower
   * case (not "Hitman", a common word's capital). Text that writes them so means them;
   * other text is not read as them (`lemmatize`).
   */
  capitals(inputs: {
    vocab: ReadonlySet<string>;
    lemmas: Readonly<Record<string, unknown>>;
  }): string[];
}

/** Tags of the forms a capital-only word's examples count with it (AEDs). */
const CAPITAL_FORM_TAGS: ReadonlySet<string> = new Set(["plural"]);

export function createVocabularyRule(
  language: WordLanguage = ENGLISH_WORDS,
  {
    minExamples = MIN_EXAMPLES,
    since = SINCE,
    rarer: {
      minExamples: minRarerExamples = Math.min(MIN_RARER_EXAMPLES, minExamples),
      minTables = MIN_TABLES,
    } = {},
    minCapitalExamples = minExamples,
  }: {
    minExamples?: number;
    since?: number;
    rarer?: { minExamples?: number; minTables?: number };
    minCapitalExamples?: number;
  } = {},
): VocabularyRule {
  /** Word → the most languages a translation table of one of its meanings has. */
  const tables = new Map<string, number>();
  /** Word → how often the examples write it in lower case. */
  const lower = new Map<string, number>();
  /** Word → how often the examples write it in capitals (two letters or more). */
  const capitals = new Map<string, number>();
  /** Word → how often the examples write it with a capital (Jim, JIM). */
  const capitalised = new Map<string, number>();
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
  /** Token as written, with a capital → how often the examples write it so. */
  const written = new Map<string, number>();
  /** Capitalised headwords with a meaning of their own, as written. */
  const capitalMeaning = new Set<string>();
  /** Capitalised headwords with a sense that names a person, as written. */
  const persons = new Set<string>();
  /** Capitalised headword → its inflected forms, as written (AED → AEDs). */
  const capitalForms = new Map<string, Set<string>>();
  const capitalCount = (headword: string) =>
    [headword, ...(capitalForms.get(headword) ?? [])].reduce(
      (sum, form) => sum + (written.get(form) ?? 0),
      0,
    );
  const capitalShaped = (headword: string) =>
    language.capitalWord !== undefined && language.capitalWord.test(headword);
  /** Proper nouns that point to another (Jer: diminutive of Jeremy) → their targets. */
  const namePointers = new Map<string, Set<string>>();
  /** Capitalised headwords with a sense a translation table translates, as written. */
  const translated = new Set<string>();
  /** A capitalised entry's meanings, persons and forms (`capitals`). */
  const addCapital = (entry: KaikkiEntry) => {
    const headword = entry.word.replaceAll("’", "'");
    for (const sense of entrySenses(entry).senses) {
      if (sense.inflection) continue;
      if (entry.pos === language.name && sense.target !== undefined) {
        let targets = namePointers.get(headword);
        if (!targets) namePointers.set(headword, (targets = new Set()));
        targets.add(sense.target);
      }
      if (
        entry.pos === language.name &&
        language.person?.test(
          [sense.gloss, ...sense.categories].join(" | ").toLowerCase(),
        )
      )
        persons.add(headword);
      else {
        capitalMeaning.add(headword);
        if (sense.tables > 0) translated.add(headword);
      }
    }
    for (const { form, tags = [] } of entry.forms ?? []) {
      if (typeof form !== "string" || form === headword) continue;
      if (!tags.some((tag) => CAPITAL_FORM_TAGS.has(tag))) continue;
      let forms = capitalForms.get(headword);
      if (!forms) capitalForms.set(headword, (forms = new Set()));
      forms.add(form);
    }
  };
  return {
    add(entry) {
      for (const piece of entryExamplePieces(entry, since))
        for (const token of pieceWords(piece)) {
          const folded = token.toLowerCase();
          if (token === folded) bump(lower, token);
          else {
            if (token.length > 1 && token === token.toUpperCase())
              bump(capitals, folded);
            bump(capitalised, folded);
            bump(written, token);
          }
        }
      if (capitalShaped(entry.word.replaceAll("’", "'"))) addCapital(entry);
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
        if (sense.tables > (tables.get(word) ?? 0))
          tables.set(word, sense.tables);
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
    capitalShaped,
    capitalCount,
    capitals({ vocab, lemmas }) {
      const { possessive } = language;
      return [...capitalMeaning]
        .filter((headword) => {
          if (!translated.has(headword)) return false;
          // A person's name, or a spelling or diminutive of one (Dmitri, Jer).
          if (persons.has(headword)) return false;
          if (
            [...(namePointers.get(headword) ?? [])].some((target) =>
              persons.has(target),
            )
          )
            return false;
          const key = headword.toLowerCase();
          if (vocab.has(key) || Object.hasOwn(lemmas, key)) return false;
          if (
            possessive !== undefined &&
            key.endsWith(possessive) &&
            vocab.has(key.slice(0, -possessive.length))
          )
            return false;
          const times = capitalCount(headword);
          return times >= minCapitalExamples && times > (lower.get(key) ?? 0);
        })
        .sort(byCodeUnit);
    },
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
      const used = (word: string) => {
        const times = count(word, formsOf(word));
        return (
          times >= minExamples ||
          (times >= minRarerExamples &&
            times >= (capitalised.get(word) ?? 0) &&
            (tables.get(word) ?? 0) >= minTables)
        );
      };
      return [...meaning]
        .filter(
          (word) =>
            !vocab.has(word) &&
            !isForm(word) &&
            used(word) &&
            !otherThanAcronym(word),
        )
        .sort(byCodeUnit);
    },
  };
}
