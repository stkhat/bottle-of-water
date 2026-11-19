// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { PhraseRules } from "./pattern";

/**
 * German slots, each filled only by itself ("jemandem etwas vormachen"), the
 * contractions of a preposition with the article (am, im, zum, zur, beim, ans, ins,
 * vom), and German word order (`verbLast`): a verb pattern's finite verb moved before
 * its other words ("nimmt … in Kauf"), its particle after them ("gibt den Löffel ab"),
 * "sich" as the subject's reflexive pronoun ("ich mache mich auf den Weg"), "zu"
 * before the infinitive. A conjunction or subordinator opens another clause
 * (`gapStop`). Adjectives stand before nouns.
 */
export const GERMAN_RULES: PhraseRules = {
  slots: new Map(
    ["jemand", "jemanden", "jemandem", "jemandes", "etwas"].map((slot) => [
      slot,
      new Set<string>(),
    ]),
  ),
  maxGap: 0,
  gapStop: new Set([
    ...["und", "oder", "aber", "sondern", "denn", "doch", "dass", "weil"],
    ...["wenn", "ob", "als", "obwohl", "bevor", "nachdem", "damit", "während"],
    ...["bis", "seit", "sobald", "falls", "solange", "sodass", "indem"],
  ]),
  verbLast: {
    reflexive: "sich",
    pronouns: new Map([
      ["sich", new Set<string>()],
      ["mich", new Set(["ich"])],
      ["mir", new Set(["ich"])],
      ["dich", new Set(["du"])],
      ["dir", new Set(["du"])],
      ["uns", new Set(["wir"])],
      ["euch", new Set(["ihr"])],
    ]),
    maxBetween: 4,
    infinitive: "zu",
  },
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
