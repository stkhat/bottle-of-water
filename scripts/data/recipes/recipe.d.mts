/** A sense: part of speech, text, and for translation-table senses the English sense label. */
export type PairSense = [pos: string, text: string, hint?: string];
export interface SourceTerm {
  short: string;
  senses: PairSense[];
}
export interface SourceRead {
  terms: Map<string, SourceTerm>;
  stats: { entries: number; unparsable: number };
}
export const MAX_SENSES: number;
export const MAX_WORDS: number;
export function termKeyOf(packs: {
  vocab: ReadonlySet<string>;
  lemmas: Readonly<Record<string, string | readonly string[]>>;
  phrases: ReadonlySet<string>;
}): (headword: string) => string | undefined;
export function readEdition(
  path: string,
  termKey: (headword: string) => string | undefined,
  options?: { lang?: string; trimPeriod?: boolean },
): Promise<SourceRead>;
export function readTranslationTables(
  path: string,
  options: {
    langCodes: string[];
    termKey: (headword: string) => string | undefined;
    word?: (word: string) => string | undefined;
    lang?: string;
  },
): Promise<SourceRead>;
export function mergeSources(
  sources: { tag: string; terms: Map<string, SourceTerm> }[],
): {
  dict: Record<string, [short: string, senses: PairSense[], source: number]>;
  sources: string[];
  counts: Record<string, number>;
};
