import type { FreqPack } from "./types";

/** Word → 1-based rank. */
export function buildFreqIndex(freq: FreqPack): Map<string, number> {
  return new Map(freq.map((word, i) => [word, i + 1]));
}

/** 1-based rank of a base form, or Infinity when it is not in the list. */
export function rankOf(
  base: string,
  index: ReadonlyMap<string, number>,
): number {
  return index.get(base) ?? Infinity;
}
