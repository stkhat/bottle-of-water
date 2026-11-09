import type { DictPack } from "./types";

/** The words Lingo knows: the dictionary's single-word headwords (M2 plan). */
export function vocabularyOf(dict: DictPack): Set<string> {
  return new Set(Object.keys(dict).filter((key) => !key.includes(" ")));
}
