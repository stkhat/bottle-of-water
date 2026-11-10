export function ipaCoverage(
  freq: string[],
  ipa: Record<string, string>,
  top: number,
): { words: number; withIpa: number; ratio: number };
export function phraseMeanings(
  phrases: string[],
  dict: Record<string, unknown>,
  ja: Record<string, unknown>,
  defs: Record<string, unknown>,
): { phrases: number; ejdict: number; ja: number; defs: number; none: number };
