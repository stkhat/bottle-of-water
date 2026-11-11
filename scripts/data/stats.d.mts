import type { PhrasePatterns } from "./phrases.mjs";

export function ipaCoverage(
  freq: string[],
  ipa: Record<string, string>,
  top: number,
): { words: number; withIpa: number; ratio: number };
export function patternCounts(patterns: PhrasePatterns): {
  patterns: number;
  detect: number;
  more: number;
  gap: number;
};
export function phraseMeanings(
  phrases: PhrasePatterns,
  dict: Record<string, unknown>,
  ja: Record<string, unknown>,
  defs: Record<string, unknown>,
): { phrases: number; ejdict: number; ja: number; defs: number; none: number };
