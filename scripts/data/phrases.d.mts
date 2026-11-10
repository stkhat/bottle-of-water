import type { Dict } from "./ejdict.mjs";

export type Defs = Record<
  string,
  [short: string, senses: [pos: string, text: string][]]
>;
export interface PhrasesResult {
  phrases: string[];
  defs: Defs;
  ja: Dict;
  stats: {
    entries: number;
    unparsable: number;
    phrases: number;
    fromEjdict: number;
    fromKaikki: number;
    ja: number;
    defs: number;
  };
}
export const PLACEHOLDER_WORDS: ReadonlySet<string>;
export function importPhrases(
  path: string,
  vocab: Iterable<string>,
  dict: Dict,
): Promise<PhrasesResult>;
export function writePhrasePacks(result: PhrasesResult): {
  index: { shards: { file: string; first: string; last: string }[] };
};
