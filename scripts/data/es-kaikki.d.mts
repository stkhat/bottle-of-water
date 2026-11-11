import type { Defs, PhrasePatterns } from "./phrases.mjs";

export interface EsPacks {
  freq: string[];
  vocab: string[];
  lemmas: Record<string, string | string[]>;
  ipa: Record<string, string>;
  phrases: PhrasePatterns;
  defs: Defs;
  stats: {
    entries: number;
    unparsable: number;
    forms: number;
    vocab: number;
    lemmas: number;
    ipa: number;
    detect: number;
    more: number;
    terms: number;
  };
}
export const KAIKKI_ES_PATH: string;
export const ES_SLOT_WORDS: ReadonlySet<string>;
export function buildEsPacks(
  path: string,
  forms: string[],
  options?: { freqTop?: number; commonRank?: number },
): Promise<EsPacks>;
export function writeEsPacks(packs: EsPacks, dir?: string): string[];
