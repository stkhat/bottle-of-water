import type {
  FreqPack,
  IpaPack,
  LemmaPack,
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
import { tokenize, type Token } from "../text/tokenize";
import { englishTagger } from "../tagging/en";
import type { Tagger, TaggerModel } from "../tagging/tagger";
import { ipaFor } from "./ipa";
import { lemmatize } from "./lemmatize";

/**
 * Languages whose names stand out by a capital (rule D). Not those without letter case
 * or those that capitalise every noun (German): their capitals say nothing of names.
 */
const NAMES_BY_CASE: ReadonlySet<string> = new Set(["en", "es"]);

/** Each language's tagger over its pack's model. */
const TAGGERS: Readonly<Record<string, (model: TaggerModel) => Tagger>> = {
  en: englishTagger,
};

export interface LanguagePack {
  readonly lang: string;
  tokenize(text: string): Token[];
  /**
   * Base forms of a word as it appears in text, in vocabulary order: the word itself
   * when it is in the vocabulary, then its bases. [] when the word is not known.
   */
  lemmas(word: string): string[];
  /** 1-based frequency rank of a base form; Infinity when it is not ranked. */
  rank(base: string): number;
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
   * The names lexicon's entry of a lowercase word: the kinds of name, then "!" for a
   * capitalised common word (`NamesPack`). Undefined when it is no name.
   */
  name(word: string): string | undefined;
  /** A word's parts of speech, its main one first; [] when the pack has none. */
  partsOfSpeech(word: string): readonly string[];
  /**
   * A phrase pattern's own parts of speech in the source (`PhrasePatterns.pos`:
   * verb, adv, prep_phrase, intj…), its main one first; [] when it has none.
   */
  phrasePos(key: string): readonly string[];
  /** The source marks the verb pattern's senses intransitive and never transitive ("fly in"). */
  intransitive(key: string): boolean;
  /**
   * The language's part-of-speech tagger and grammar (rules A1 and A2,
   * `word-sense.ts`), when the pack has a model for it (English so far).
   */
  readonly tagger?: Tagger;
}

export interface LanguagePackData {
  lemmas: LemmaPack;
  freq: FreqPack;
  ipa: IpaPack;
  /** The words Lingo knows (single-word dictionary headwords). */
  vocab: ReadonlySet<string>;
  /** Dictionary phrase patterns (idioms, phrasal verbs, prepositional phrases). */
  patterns: PhrasePatterns;
  pos?: PosPack;
  names?: NamesPack;
  tagger?: TaggerModel;
}

export function createLanguagePack(
  lang: string,
  data: LanguagePackData,
): LanguagePack {
  const ranks = new Map(data.freq.map((word, i) => [word, i + 1]));
  const rules = rulesFor(lang);
  const lemmas = (word: string) => lemmatize(word, data.lemmas, data.vocab);
  let phrases: ReadonlySet<string> | undefined;
  let matcher: PhraseMatcher | undefined;
  let phrasePos: ReadonlyMap<string, readonly string[]> | undefined;
  let intransitive: ReadonlySet<string> | undefined;
  const makeTagger = own(TAGGERS, lang);
  const tagger = data.tagger && makeTagger?.(data.tagger);
  return {
    lang,
    tokenize: (text) => tokenize(text, lang),
    lemmas,
    rank: (base) => ranks.get(base.toLowerCase()) ?? Infinity,
    // English -s forms ("beans") take their base's IPA with the English ending.
    ipa: (term) => ipaFor(term, data.ipa, lang === "en" ? lemmas : undefined),
    patterns: data.patterns,
    rules,
    namesByCase: NAMES_BY_CASE.has(lang) && data.names !== undefined,
    name: (word) => (data.names ? own(data.names, word) : undefined),
    partsOfSpeech: (word) => (data.pos ? (own(data.pos, word) ?? []) : []),
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
        rules,
        patterns: data.patterns,
        lemmas,
      }));
    },
  };
}
