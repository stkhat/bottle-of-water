/** Shapes of the pack files in public/packs/ and data/packs/ (see docs/plans/2026-11-09-m2-data-import.md). */

/** en/lemmas.json: inflected form → base form(s). */
export type LemmaPack = Readonly<Record<string, string | readonly string[]>>;
/** en/ipa.json: word → US IPA. */
export type IpaPack = Readonly<Record<string, string>>;
/** en/freq.json: base forms in rank order (index 0 = rank 1). */
export type FreqPack = readonly string[];
/** en/pos.json: word → parts of speech. */
export type PosPack = Readonly<Record<string, readonly string[]>>;
/** en/vocab.json: the words Lingo knows (single-word dictionary headwords), sorted. */
export type VocabPack = readonly string[];
/**
 * en/phrases.json (and es/phrases.json): the dictionary's phrase patterns, by key (as
 * for saved phrases; slot words such as "one's" stand for any filler). `detect` and
 * `more` are disjoint, each sorted by code unit, and together hold every pattern:
 * `detect` the ones highlighted in text without being saved (no slot, the detection
 * filters pass), `more` the others, matched only when selected or saved. `gap`, sorted,
 * lists the patterns (phrasal verbs) whose words may have a gap between them.
 */
export type PhrasesPack = Readonly<{
  detect: readonly string[];
  more: readonly string[];
  gap: readonly string[];
}>;
/**
 * en-ja/dict-<n>.json, merged: headword → [short gloss, senses]. en-ja/phrases.json has
 * the same shape: Japanese translations of phrases EJDict lacks.
 */
export type DictPack = Readonly<
  Record<string, readonly [short: string, senses: readonly string[]]>
>;
/**
 * en-defs/dict-<n>.json, merged: phrase → [short definition, [part of speech, text][]].
 * English definitions of phrases that no Japanese source has. es-en/dict-<n>.json has
 * the same shape: English meanings of Spanish words and phrases.
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
/** en-ja/index.json (and en-defs/, es-en/index.json): the shards, in headword order. */
export interface ShardIndex {
  readonly shards: readonly {
    readonly file: string;
    readonly first: string;
    readonly last: string;
  }[];
}
