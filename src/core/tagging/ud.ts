/**
 * Taggers trained on Universal Dependencies treebanks (Spanish, French): their tags are
 * the universal ones with the verb form of verbs and auxiliaries (VERB.Fin, AUX.Part,
 * VERB.Inf, VERB.Ger), read here as the dictionaries' parts of speech.
 */
import type { TaggedWord, TokenTag } from "./tagger";

/** Universal tag → the dictionaries' part of speech. */
const LABELS: Readonly<Record<string, string>> = {
  NOUN: "noun",
  PROPN: "noun",
  VERB: "verb",
  AUX: "verb",
  ADJ: "adjective",
  ADV: "adverb",
  ADP: "preposition",
  CCONJ: "conjunction",
  SCONJ: "conjunction",
  DET: "determiner",
  PRON: "pronoun",
  NUM: "numeral",
  INTJ: "interjection",
  PART: "particle",
};

/**
 * Parts of speech whose words inflect for gender and number: a written form that is no
 * headword of its own is what they are ("buenas", "nuestras", "grandes").
 */
const MORPH: ReadonlySet<string> = new Set([
  "noun",
  "adjective",
  "verb",
  "determiner",
  "pronoun",
]);

/** Verb forms that are inflected: finite forms, participles and gerunds (not infinitives). */
const INFLECTED = /\.(Fin|Part|Ger)$/;

/** A universal tag (with its verb form) as a `TokenTag`. */
export function udTokenTag(tag: string, confidence: number): TokenTag {
  const upos = tag.split(".")[0]!;
  const label = Object.hasOwn(LABELS, upos) ? LABELS[upos]! : "other";
  return {
    tag,
    label,
    inflected: INFLECTED.test(tag),
    morph: MORPH.has(label),
    proper: upos === "PROPN",
    confidence,
  };
}

/** Whether the word is a form of `verb` (ha, está, fue; a, est, été). */
export const formOf = (word: TaggedWord, verb: string) =>
  word.form === verb || word.bases.includes(verb);

/** What an auxiliary is followed by: a participle, a gerund or an infinitive. */
export const NONFINITE = /^(VERB|AUX)\.(Part|Ger|Inf)$/;

/** The word's tag when it is trusted. */
export const trustedTagOf = (word: TaggedWord | undefined) =>
  word?.trusted ? word.tag : undefined;
