// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { PhraseRules } from "./pattern";

/**
 * German slots, each filled only by itself ("jemandem etwas vormachen"), and the
 * contractions of a preposition with the article (am, im, zum, zur, beim, ans, ins,
 * vom). Adjectives stand before nouns. No gaps yet: a separable verb's particle at the
 * clause's end ("fängt … an") and "sich" anywhere in the clause need them (L2-3).
 */
export const GERMAN_RULES: PhraseRules = {
  slots: new Map(
    ["jemand", "jemanden", "jemandem", "jemandes", "etwas"].map((slot) => [
      slot,
      new Set<string>(),
    ]),
  ),
  maxGap: 0,
  contractions: new Map([
    ["am", "an"],
    ["ans", "an"],
    ["im", "in"],
    ["ins", "in"],
    ["zum", "zu"],
    ["zur", "zu"],
    ["beim", "bei"],
    ["vom", "von"],
  ]),
};
