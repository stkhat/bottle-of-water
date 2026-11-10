import { buildFreqIndex, rankOf } from "./packs/frequency";
import { ipaFor } from "./packs/ipa";
import { lemmatize } from "./packs/lemmatize";
import type { FreqPack, IpaPack, LemmaPack } from "./packs/types";
import { tokenize, type Token } from "./text/tokenize";

/** Word segmentation, base forms, frequency rank and IPA for one learning language. */
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
  /** Dictionary phrases to detect in text, keyed like saved phrases ("figure out"). */
  readonly phrases: ReadonlySet<string>;
}

/** What a learning language's pack is built from (public/packs/<lang>/). */
export interface LanguagePackData {
  lemmas: LemmaPack;
  freq: FreqPack;
  ipa: IpaPack;
  /** The words Lingo knows (single-word dictionary headwords). */
  vocab: ReadonlySet<string>;
  /** Dictionary phrases (idioms, phrasal verbs, prepositional phrases). */
  phrases: ReadonlySet<string>;
}

export type EnglishPackData = LanguagePackData;

/** The pack of a learning language: words segmented with `Intl.Segmenter(lang)`. */
export function createLanguagePack(
  lang: string,
  data: LanguagePackData,
): LanguagePack {
  const ranks = buildFreqIndex(data.freq);
  return {
    lang,
    tokenize: (text) => tokenize(text, lang),
    lemmas: (word) => lemmatize(word, data.lemmas, data.vocab),
    rank: (base) => rankOf(base.toLowerCase(), ranks),
    ipa: (term) => ipaFor(term, data.ipa),
    phrases: data.phrases,
  };
}

export function createEnglishPack(data: EnglishPackData): LanguagePack {
  return createLanguagePack("en", data);
}
