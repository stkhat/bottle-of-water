// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { NegationRules, PhraseRules, ReflexiveRules } from "./pattern";

/**
 * French pronominal verbs: patterns write the pronoun as a word before the infinitive
 * ("se rendre compte", "s'en aller"); text has any reflexive pronoun there, être's
 * forms after it in compound tenses ("je me suis rendu compte", "il s'en est allé"),
 * or the pronoun after an imperative ("rends-toi compte"). "me", "te", "nous" and
 * "vous" are reflexive only with their own subject before them, as the grammar reads
 * them (`core/tagging/fr.ts`): "ça me fait plaisir" is no `se faire plaisir`.
 */
const FRENCH_REFLEXIVE: ReflexiveRules = {
  leading: new Set(["se", "s'"]),
  pronouns: new Set(["me", "m'", "te", "t'", "se", "s'", "nous", "vous"]),
  subjects: new Map([
    ["me", new Set(["je", "j'"])],
    ["m'", new Set(["je", "j'"])],
    ["te", new Set(["tu"])],
    ["t'", new Set(["tu"])],
    ["nous", new Set(["nous"])],
    ["vous", new Set(["vous"])],
  ]),
  subjectReach: 4,
  objects: new Set(["en", "y", "le", "la", "l'", "les", "lui", "leur"]),
  auxiliaries: new Set(["être"]),
  maxBetween: 1,
  after: new Set(["toi", "nous", "vous"]),
};

/**
 * The negation "ne … pas" and its kin (a closed class, as `core/tagging/fr.ts` reads
 * it): with "ne" before the verb, the second word right after it may stand inside a
 * verb pattern ("je ne me rends pas compte", "il n'a jamais eu l'air"). Speech often
 * drops "ne" ("j'ai pas envie"): "pas" and "jamais", which negate alone, stand there
 * without it; "plus" and "rien" without "ne" are "more" and an object.
 */
const FRENCH_NEGATION: NegationRules = {
  before: new Set(["ne", "n'"]),
  after: new Set(["pas", "plus", "jamais", "point", "guère", "rien"]),
  alone: new Set(["pas", "jamais"]),
  reach: 4,
};

/**
 * French slots, each filled only by itself ("casser les pieds à quelqu'un"), pronominal
 * verbs, the contractions of à and de with the article (au, aux, du, des), adjectives
 * after nouns, and the negation around the verb. No gaps.
 */
export const FRENCH_RULES: PhraseRules = {
  slots: new Map([["quelqu'un", new Set<string>()]]),
  maxGap: 0,
  reflexive: FRENCH_REFLEXIVE,
  contractions: new Map([
    ["au", "à"],
    ["aux", "à"],
    ["du", "de"],
    ["des", "de"],
  ]),
  adjectivesAfterNouns: true,
  negation: FRENCH_NEGATION,
};
