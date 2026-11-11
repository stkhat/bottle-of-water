import type { Dict } from "./ejdict.mjs";

export type Defs = Record<
  string,
  [short: string, senses: [pos: string, text: string][]]
>;
/** en/phrases.json (and es/phrases.json): pattern keys, each list sorted by code unit. */
export interface PhrasePatterns {
  detect: string[];
  more: string[];
  gap: string[];
}
export interface PhrasesResult {
  phrases: PhrasePatterns;
  ja: Dict;
  stats: {
    entries: number;
    unparsable: number;
    detect: number;
    more: number;
    /** kaikki patterns left undetected only because they are common-word pairs (isCommonPair). */
    trivial: number;
    gap: number;
    fromEjdict: number;
    fromKaikki: number;
    ja: number;
  };
}
export const SLOT_WORDS: ReadonlySet<string>;
export const SLOT_SPELLINGS: ReadonlyMap<string, string>;
export const AUXILIARIES: ReadonlySet<string>;
export const IDIOM_COMMON_RANK: number;
export const PHRASE_COMMON_RANK: number;
export const PHRASE_POS: ReadonlySet<string>;
export const ADVERB_PARTICLES: ReadonlySet<string>;
export function isCommonPair(key: string, rarestRank: number): boolean;
export function patternKey(
  headword: string,
  isWord: (word: string) => boolean,
): string | undefined;
export function hasSlot(key: string): boolean;
export function isUsable(sense: unknown): boolean;
export function isNonConstituent(entry: unknown): boolean;
export function shortOf(text: string): string;
export function importPhrases(
  path: string,
  vocab: Iterable<string>,
  dict: Dict,
  freq: string[],
  lemmas: Record<string, string | string[]>,
): Promise<PhrasesResult>;
export function writePhrasePacks(result: PhrasesResult): {
  index: { shards: { file: string; first: string; last: string }[] };
};
