import type { PairSense } from "./recipe.mjs";

export const TABLES_TAG: string;
export const RECIPES: Readonly<
  Record<
    string,
    {
      edition: { tag: string; file: string };
      tables: {
        langCodes: string[];
        word?: (word: string) => string | undefined;
      };
    }
  >
>;
export type PairDict = Record<
  string,
  [short: string, senses: PairSense[], source: number]
>;
export function buildPairDictionary(
  native: string,
  options: {
    termKey: (headword: string) => string | undefined;
    rawDir?: string;
    englishPath?: string;
  },
): Promise<{
  dict: PairDict;
  sources: string[];
  counts: Record<string, number>;
  stats: { unparsable: number; terms: number };
}>;
export function writePairPack(
  name: string,
  pack: { dict: PairDict; sources: string[] },
  dir?: string,
): { index: { shards: { file: string; first: string; last: string }[] } };
export function englishTermKey(): (headword: string) => string | undefined;
