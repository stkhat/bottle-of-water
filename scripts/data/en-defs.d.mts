import type { Defs, PhrasePatterns } from "./phrases.mjs";

export function buildEnDefs(
  path: string,
  packs: {
    vocab: string[];
    lemmas: Record<string, string | string[]>;
    phrases: PhrasePatterns;
  },
): Promise<{
  defs: Defs;
  stats: {
    entries: number;
    unparsable: number;
    words: number;
    phrases: number;
  };
}>;
export function writeEnDefs(
  defs: Defs,
  dir?: string,
): { index: { shards: { file: string; first: string; last: string }[] } };
