// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { PhraseRules } from "./pattern";

/**
 * French slots, each filled only by itself ("casser les pieds à quelqu'un"), the
 * contractions of à and de with the article (au, aux, du, des), and adjectives after
 * nouns. No gaps. Pronominal verbs ("se rendre compte") are not matched yet.
 */
export const FRENCH_RULES: PhraseRules = {
  slots: new Map([["quelqu'un", new Set<string>()]]),
  maxGap: 0,
  contractions: new Map([
    ["au", "à"],
    ["aux", "à"],
    ["du", "de"],
    ["des", "de"],
  ]),
  adjectivesAfterNouns: true,
};
