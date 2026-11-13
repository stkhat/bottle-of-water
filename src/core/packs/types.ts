/** Shapes of the pack files in public/packs/ and data/packs/. */

import type { TaggerModel } from "../tagging/tagger";

/** en/tagger.json: the English part-of-speech tagger's model (`PerceptronModel`). */
export type TaggerPack = TaggerModel;

/** en/lemmas.json: inflected form → base form(s). */
export type LemmaPack = Readonly<Record<string, string | readonly string[]>>;
/** en/ipa.json: word → US IPA. */
export type IpaPack = Readonly<Record<string, string>>;
/**
 * en/freq.json: base forms in rank order (index 0 = rank 1): the frequency list's, with
 * rule E's words it lacks placed by the example corpus.
 */
export type FreqPack = readonly string[];
/** en/pos.json: word → parts of speech. */
export type PosPack = Readonly<Record<string, readonly string[]>>;
/**
 * en/names.json: the names lexicon (Wiktionary's proper-name entries), by lowercase
 * word → the kinds of name ("g" given name, "s" surname, "p" place, "o" organisation,
 * "x" other), its main kind first, then "!" when the word is also a capitalised common
 * word (English, Christian), which rule D never takes for a name. Only vocabulary
 * words and given names.
 */
export type NamesPack = Readonly<Record<string, string>>;
/**
 * en/vocab.json: the words Lingo knows (EJDict's single-word headwords and the words in
 * use that Wiktionary adds, rule E), sorted.
 */
export type VocabPack = readonly string[];
/**
 * en-ja/dict-<n>.json, merged: headword → [short gloss, senses]. en-ja/phrases.json has
 * the same shape: Japanese translations of phrases EJDict lacks, from Wiktionary's
 * translation tables, each sense "《English sense》word,word", with its senses' parts
 * of speech as a third item (`sense-labels.ts`, the source's own: "v v i").
 */
export type DictPack = Readonly<
  Record<
    string,
    readonly [short: string, senses: readonly string[], labels?: string]
  >
>;
/**
 * en-defs/dict-<n>.json, merged: word or phrase → [short definition, [part of speech,
 * text][]]: English Wiktionary's definitions, the fallback of every English dictionary.
 * es-en/dict-<n>.json has the same shape: English meanings of Spanish words and phrases.
 */
export type DefsPack = Readonly<
  Record<
    string,
    readonly [
      short: string,
      senses: readonly (readonly [pos: string, text: string])[],
    ]
  >
>;
/**
 * en-<native>/dict-<n>.json, merged (en-es): term → [short meaning, senses, source],
 * built by a recipe from human-made sources in order, the first one with the term
 * supplying all of it. A sense from a translation table carries its English sense as a
 * hint ("source of illumination"). `source` indexes the index's `sources`.
 */
export type PairPack = Readonly<
  Record<
    string,
    readonly [
      short: string,
      senses: readonly (readonly [pos: string, text: string, hint?: string])[],
      source: number,
    ]
  >
>;
/**
 * en-ja/pos.json: the parts of speech of EJDict's senses for words with several, one
 * code per sense (`sense-labels.ts`): "n~ v a* a".
 */
export type SensePosPack = Readonly<Record<string, string>>;
/** en-ja/index.json (and the other dictionaries' index.json): the shards, in headword order. */
export interface ShardIndex {
  readonly shards: readonly {
    readonly file: string;
    readonly first: string;
    readonly last: string;
  }[];
  /** A pair pack's sources, by the index each entry gives. */
  readonly sources?: readonly string[];
}
