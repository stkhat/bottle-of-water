import type {
  CapitalsPack,
  ContractionPack,
  FreqPack,
  IpaPack,
  LemmaPack,
  LemmaShards,
  NamesPack,
  PosPack,
} from "../packs/types";
import { own } from "../util";
import { createPhraseMatcher, type PhraseMatcher } from "../phrases/matcher";
import {
  phrasePosIndex,
  type PhrasePatterns,
  type PhraseRules,
} from "../phrases/pattern";
import { rulesFor } from "../phrases/rules";
import { normalizeWord, tokenize, type Token } from "../text/tokenize";
import { englishTagger } from "../tagging/en";
import { spanishTagger } from "../tagging/es";
import { frenchTagger } from "../tagging/fr";
import { germanTagger } from "../tagging/de";
import type { Tagger, TaggerModel } from "../tagging/tagger";
import { COMPOUND_RULES, splitCompound, type Compound } from "./compounds";
import { ipaFor } from "./ipa";
import { lemmatize, type CapitalWords } from "./lemmatize";

/**
 * Languages whose names stand out by a capital (rule D). Not those without letter case
 * or those that capitalise every noun (German): their capitals say nothing of names.
 */
const NAMES_BY_CASE: ReadonlySet<string> = new Set(["en", "es", "fr", "de"]);

/**
 * Languages that capitalise a common word inside a sentence only in a name or a title,
 * not for a party's members, a believer, a month or an acronym that is another word
 * (English Democrats, Christians, March, US; Spanish demócratas, cristianos, marzo,
 * EE. UU.; French démocrates, chrétiens, mars). There a capitalised inflected form
 * the names lexicon lacks is a name when its reading as the form is unlikely (rule D,
 * `documentNames`), and a capitalised word that is no name is a title's word, read by
 * its tag like any other ("Nueva York": nuevo; "la Segunda Guerra Mundial": segundo;
 * "la Seconde Guerre mondiale"): it asks for no capitalised senses. French also
 * capitalises a people's noun ("les Français"): a vocabulary word, read by its tag,
 * and after an article, where the form rule does not reach it.
 */
const CAPITALS_FOR_NAMES: ReadonlySet<string> = new Set(["es", "fr"]);

/**
 * Languages that capitalise every noun (German "Haus", "Essen"; the polite Sie): a
 * word capitalised in a way that counts asks for its capitalised headword's senses
 * first (`Sense.capital`) and is read by its tag as any word, since its capital marks
 * a noun or the polite pronoun, not a name.
 */
const NOUNS_CAPITALISED: ReadonlySet<string> = new Set(["de"]);

/**
 * Languages whose lemma table lists an inflected form's likelier base first, from a
 * treebank's lemmas (Spanish "creo": creer before crear). English lists them in
 * code-unit order.
 */
const BASES_IN_ORDER: ReadonlySet<string> = new Set(["es", "fr", "de"]);

/**
 * Letters whose accented forms text written in capitals tends to leave out (Spanish
 * ESTAN for están, POLICIA for policía; French ETE for été, ELEVE for élève): letter →
 * its accented forms. A word may take one on each of its letters, as French writes
 * several a word.
 */
const CAPITAL_ACCENTS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  es: { a: "á", e: "é", i: "í", o: "ó", u: "úü", n: "ñ" },
  fr: { a: "àâ", e: "éèêë", i: "îï", o: "ô", u: "ùûü", c: "ç", y: "ÿ" },
};

/**
 * Spellings tried for one word at most (`accentedSpelling`): a long word with many
 * accentable letters is left as written.
 */
const MAX_SPELLINGS = 4096;

/**
 * The one spelling of `word` with accented letters (`accents`, any number of them)
 * that `known` knows; undefined when none or several do ("esta": está and ésta are
 * left alone, though only unknown words are asked about), or when the word has too
 * many accentable letters to try them all (`MAX_SPELLINGS`).
 */
function accentedSpelling(
  word: string,
  accents: Readonly<Record<string, string>>,
  known: (word: string) => boolean,
): string | undefined {
  const letters = [...word];
  const choices = letters.map((letter) => [
    letter,
    ...(own(accents, letter) ?? ""),
  ]);
  if (choices.reduce((n, options) => n * options.length, 1) > MAX_SPELLINGS)
    return undefined;
  let spellings = [""];
  for (const options of choices)
    spellings = spellings.flatMap((start) =>
      options.map((letter) => start + letter),
    );
  const found = spellings.filter(
    (spelling) => spelling !== word && known(spelling),
  );
  return found.length === 1 ? found[0] : undefined;
}

/** The language capitalises every noun (`NOUNS_CAPITALISED`): its phrases' headwords keep that case. */
export const capitalisesNouns = (lang: string) => NOUNS_CAPITALISED.has(lang);

/** The language writes closed compounds (`COMPOUND_RULES`): its dictionary reads them. */
export const writesCompounds = (lang: string) =>
  own(COMPOUND_RULES, lang) !== undefined;

/** Each language's tagger over its pack's model. */
const TAGGERS: Readonly<Record<string, (model: TaggerModel) => Tagger>> = {
  en: englishTagger,
  es: spanishTagger,
  fr: frenchTagger,
  de: germanTagger,
};

/** How many words' base forms a pack keeps (`lemmas`), as written; then it starts over. */
const LEMMA_CACHE_SIZE = 20_000;

export interface LanguagePack {
  readonly lang: string;
  tokenize(text: string): Token[];
  /**
   * Base forms of a word as it appears in text, in vocabulary order: the word itself
   * when it is in the vocabulary, then its bases. [] when the word is not known.
   * Shared between calls: not to be changed.
   */
  lemmas(word: string): readonly string[];
  /**
   * `lemmas` lists a form's bases likeliest first (from a treebank), so rule A1 reads a
   * form as the first base that fits its tag; otherwise as the most frequent one.
   */
  readonly basesInOrder: boolean;
  /**
   * 1-based frequency rank of a base form; Infinity when it is not ranked. A contraction
   * the list does not rank has the rank of the rarest word it is short for.
   */
  rank(base: string): number;
  /**
   * A capital-only word (`LanguagePackData.capitals`: "ai", written AI): a word only
   * where the text writes it so. Not a vocabulary word whose capitals the pack lists
   * because its case matters (U.S.).
   */
  capitalOnly(key: string): boolean;
  /** IPA of a word, or of a phrase's words inside one pair of slashes. */
  ipa(term: string): string | undefined;
  /** The dictionary's phrase patterns, keyed like saved phrases ("figure out"). */
  readonly patterns: PhrasePatterns;
  readonly rules: PhraseRules;
  /** The `detect` patterns: dictionary phrases highlighted in text without being saved. */
  readonly phrases: ReadonlySet<string>;
  /** Built on first use, then shared, so its tries are built once per pack. */
  readonly matcher: PhraseMatcher;
  /**
   * A document's capitals say something in this language: rule D reads names from
   * them, and a capitalised word asks for its capitalised senses. Needs a names
   * lexicon.
   */
  readonly namesByCase: boolean;
  /**
   * The language capitalises common words inside a sentence only in names and titles
   * (`CAPITALS_FOR_NAMES`): rule D also takes a capitalised inflected form the names
   * lexicon lacks for a name when its reading as the form is unlikely
   * (`documentNames`), and a capitalised word asks for no capitalised senses.
   */
  readonly capitalsForNames: boolean;
  /**
   * The language capitalises every noun (`NOUNS_CAPITALISED`): a word capitalised in a
   * way that counts asks for its capitalised headword's senses and keeps its tag's
   * reading (rules A1 and A2).
   */
  readonly nounsCapitalised: boolean;
  /**
   * The names lexicon's entry of a lowercase word: the kinds of name, then "!" for a
   * capitalised common word (`NamesPack`). Undefined when it is no name.
   */
  name(word: string): string | undefined;
  /**
   * The one known spelling of an unknown word with an accent that capitals leave out
   * (`accentedSpelling`: "estan" → "están"); undefined in a language that writes its
   * accents in capitals too, or when no one spelling is known.
   */
  accented(word: string): string | undefined;
  /**
   * A word's parts of speech, its main one first; [] when the pack has none. A
   * compound's are its head's.
   */
  partsOfSpeech(word: string): readonly string[];
  /**
   * The compound a word the language does not know as written is
   * (`splitCompound`, by the language's `COMPOUNDS` rules), or that a compound's key
   * is ("bahnsystem" → bahn + system); undefined for a known word, a name the names
   * lexicon has, or in a language without compounds. `lemmas` gives such a word its
   * compound's key, and `rank` the rarest part's rank.
   */
  compound(word: string): Compound | undefined;
  /**
   * What a contraction is short for, by its key ("i'm" → ["I am"], "it's" → ["it is",
   * "it has"]); [] for a word that is none, or a language without the table.
   */
  expansions(word: string): readonly string[];
  /**
   * A phrase pattern's own parts of speech in the source (`PhrasePatterns.pos`:
   * verb, adv, prep_phrase, intj…), its main one first; [] when it has none.
   */
  phrasePos(key: string): readonly string[];
  /** The source marks the verb pattern's senses intransitive and never transitive ("fly in"). */
  intransitive(key: string): boolean;
  /**
   * The language's part-of-speech tagger and grammar (rules A1 and A2,
   * `word-sense.ts`), when the pack has a model for it (English, Spanish, French,
   * German).
   */
  readonly tagger?: Tagger;
}

export interface LanguagePackData {
  lemmas: LemmaPack | LemmaShards;
  freq: FreqPack;
  ipa: IpaPack;
  /** The words Langle knows (the dictionary's single-word headwords and rule E's words). */
  vocab: ReadonlySet<string>;
  /** Dictionary phrase patterns (idioms, phrasal verbs, prepositional phrases). */
  patterns: PhrasePatterns;
  pos?: PosPack;
  names?: NamesPack;
  tagger?: TaggerModel;
  /** The language's contractions and their expansions (English). */
  contractions?: ContractionPack;
  /**
   * The vocabulary's capital-only words, as written (AI, Tokyo, iPhone): words only
   * where the text writes them so (`lemmatize`).
   */
  capitals?: CapitalsPack;
}

/** The capital-only words by key: "ai" → ["AI"] (`CapitalWords`). */
function capitalWords(capitals: CapitalsPack): CapitalWords {
  const byKey = new Map<string, string[]>();
  for (const written of capitals) {
    const key = normalizeWord(written);
    const list = byKey.get(key);
    if (list) list.push(written);
    else byKey.set(key, [written]);
  }
  return byKey;
}

export function createLanguagePack(
  lang: string,
  data: LanguagePackData,
): LanguagePack {
  const ranks = new Map(data.freq.map((word, i) => [word, i + 1]));
  const rules = rulesFor(lang);
  const capitals = data.capitals && capitalWords(data.capitals);
  const expansions = (word: string) =>
    data.contractions ? (own(data.contractions, word) ?? []) : [];
  const isName = (word: string) =>
    data.names !== undefined && Object.hasOwn(data.names, word);
  const posOf = (word: string) => (data.pos ? (own(data.pos, word) ?? []) : []);
  const compoundRules = own(COMPOUND_RULES, lang);
  /** Each unknown word's compound once (null: none), as the lemma cache keeps forms. */
  const compoundCache = new Map<string, Compound | null>();
  /** Its parts are read as the language knows them, without compounds. */
  const partsKnown = {
    lemmas: (word: string) =>
      lemmatize(word, data.lemmas, data.vocab, capitals),
    partsOfSpeech: posOf,
    rank: (base: string) => ranks.get(base) ?? Infinity,
  };
  /** `word` as written: a capital asks for a noun head (`splitCompound`). */
  const compound = (word: string): Compound | undefined => {
    if (!compoundRules) return undefined;
    const key = normalizeWord(word);
    const noun = /^\p{Lu}/u.test(word);
    const cached = noun ? `^${key}` : key;
    let found = compoundCache.get(cached);
    if (found === undefined) {
      if (compoundCache.size >= LEMMA_CACHE_SIZE) compoundCache.clear();
      found =
        isName(key) || partsKnown.lemmas(key).length > 0
          ? null
          : (splitCompound(key, partsKnown, compoundRules, noun) ?? null);
      compoundCache.set(cached, found);
    }
    return found ?? undefined;
  };
  /**
   * A key's compound: a key is in lower case, so it is read as the noun it was split
   * as when it is one, else as written.
   */
  const keyCompound = (key: string) =>
    compound(key.charAt(0).toUpperCase() + key.slice(1)) ?? compound(key);
  /** Every block's words are lemmatized, most of them common: each written form once. */
  const lemmaCache = new Map<string, readonly string[]>();
  const lemmas = (word: string): readonly string[] => {
    let found = lemmaCache.get(word);
    if (!found) {
      if (lemmaCache.size >= LEMMA_CACHE_SIZE) lemmaCache.clear();
      found = lemmatize(word, data.lemmas, data.vocab, capitals);
      // A contraction of vocabulary words is a word ("what'd", "how'd": what did).
      if (found.length === 0) {
        const key = normalizeWord(word);
        if (expansions(key).length > 0) found = [key];
        // A compound of known words is its own word, keyed by its head's base.
        else {
          const parts = compound(word);
          if (parts) found = [parts.key];
        }
      }
      lemmaCache.set(word, found);
    }
    return found;
  };
  /** A word's own rank, or its best base's: how the frequency list ranks it as written. */
  const rankOfWord = (word: string) =>
    Math.min(
      ranks.get(word) ?? Infinity,
      ...lemmas(word).map((base) => ranks.get(base) ?? Infinity),
    );
  /**
   * A base form's rank. The list writes no periods, so an abbreviation it does not rank
   * takes its letters' rank ("u.s." → us); a contraction the list does not rank takes
   * the rank of the rarest word it is short for ("what'd": what did → do), and so does
   * a hyphenated compound of its parts ("well-known": known), as the list splits it.
   */
  const rank = (base: string) => {
    const key = base.toLowerCase();
    const found =
      ranks.get(key) ??
      (key.includes(".") ? ranks.get(key.replaceAll(".", "")) : undefined);
    if (found !== undefined) return found;
    if (/\p{L}-\p{L}/u.test(key))
      return Math.max(...key.split("-").map(rankOfWord));
    // A closed compound ranks as its rarest part, as a hyphenated one does.
    const parts = keyCompound(key)?.parts;
    if (parts) return Math.max(...parts.map(rankOfWord));
    const [expansion] = expansions(key);
    if (expansion === undefined) return Infinity;
    return Math.max(...expansion.toLowerCase().split(" ").map(rankOfWord));
  };
  const accents = own(CAPITAL_ACCENTS, lang);
  /** A name ("berlín") is no word to read in capitals, where names do not show. */
  const accented = (word: string) => {
    if (accents === undefined) return undefined;
    const spelling = accentedSpelling(
      word,
      accents,
      (option) => isName(option) || lemmas(option).length > 0,
    );
    return spelling === undefined || isName(spelling) ? undefined : spelling;
  };
  let phrases: ReadonlySet<string> | undefined;
  let matcher: PhraseMatcher | undefined;
  let phrasePos: ReadonlyMap<string, readonly string[]> | undefined;
  let intransitive: ReadonlySet<string> | undefined;
  const makeTagger = own(TAGGERS, lang);
  const tagger = data.tagger && makeTagger?.(data.tagger);
  return {
    lang,
    // An elided word ("l'homme") is split off unless the whole is a word of its own.
    tokenize: (text) => tokenize(text, lang, (word) => lemmas(word).length > 0),
    lemmas,
    basesInOrder: BASES_IN_ORDER.has(lang),
    rank,
    capitalOnly: (key) => capitals?.has(key) === true && !data.vocab.has(key),
    // English -s forms ("beans") take their base's IPA with the English ending.
    ipa: (term) => ipaFor(term, data.ipa, lang === "en" ? lemmas : undefined),
    patterns: data.patterns,
    rules,
    namesByCase: NAMES_BY_CASE.has(lang) && data.names !== undefined,
    capitalsForNames: CAPITALS_FOR_NAMES.has(lang),
    nounsCapitalised: NOUNS_CAPITALISED.has(lang),
    name: (word) => (data.names ? own(data.names, word) : undefined),
    accented,
    partsOfSpeech: (word) => {
      const own = posOf(word);
      if (own.length > 0) return own;
      const head = keyCompound(word)?.parts.at(-1);
      return head === undefined ? own : posOf(head);
    },
    compound,
    expansions,
    phrasePos: (key) =>
      (phrasePos ??= phrasePosIndex(data.patterns)).get(key) ?? [],
    intransitive: (key) =>
      (intransitive ??= new Set(data.patterns.intransitive)).has(key),
    ...(tagger && { tagger }),
    get phrases() {
      return (phrases ??= new Set(data.patterns.detect));
    },
    get matcher() {
      return (matcher ??= createPhraseMatcher({
        lang,
        rules,
        patterns: data.patterns,
        lemmas,
        accented,
      }));
    },
  };
}
