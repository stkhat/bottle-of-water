import type { FreqPack, IpaPack, LemmaPack } from "../packs/types";
import { createPhraseMatcher, type PhraseMatcher } from "../phrases/matcher";
import type { PhrasePatterns, PhraseRules } from "../phrases/pattern";
import { rulesFor } from "../phrases/rules";
import { tokenize, type Token } from "../text/tokenize";
import { ipaFor } from "./ipa";
import { lemmatize } from "./lemmatize";

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
}

export interface LanguagePackData {
  lemmas: LemmaPack;
  freq: FreqPack;
  ipa: IpaPack;
  /** The words Lingo knows (single-word dictionary headwords). */
  vocab: ReadonlySet<string>;
  /** Dictionary phrase patterns (idioms, phrasal verbs, prepositional phrases). */
  patterns: PhrasePatterns;
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
  return {
    lang,
    tokenize: (text) => tokenize(text, lang),
    lemmas,
    rank: (base) => ranks.get(base.toLowerCase()) ?? Infinity,
    // English -s forms ("beans") take their base's IPA with the English ending.
    ipa: (term) => ipaFor(term, data.ipa, lang === "en" ? lemmas : undefined),
    patterns: data.patterns,
    rules,
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
