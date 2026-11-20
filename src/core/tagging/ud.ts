/**
 * Taggers trained on Universal Dependencies treebanks (Spanish, French): their tags are
 * the universal ones with the verb form of verbs and auxiliaries (VERB.Fin, AUX.Part,
 * VERB.Inf, VERB.Ger), read here as the dictionaries' parts of speech.
 */
import type { TaggedWord, TokenTag, WordUse } from "./tagger";

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

/** The parts of speech of a word that introduces an infinitive ("tener que", "essayer de"). */
const INTRODUCERS: ReadonlySet<string> = new Set([
  "preposition",
  "conjunction",
]);

/**
 * The construction of a verb at `i` with an infinitive after it (`WordUse.construction`):
 * the preposition or conjunction that introduces the infinitive ("tengo que irme": que;
 * "acabo de llegar": de), "" for an infinitive right after the verb ("suele venir"),
 * with only words that `between` accepts before the infinitive (French object pronouns:
 * "essayer de le faire") and no punctuation. `spelt`: the introducer as the dictionary
 * writes it (French "d'" → "de"). Undefined when no infinitive follows, or for a word
 * not tagged as a verb. Tags count whether trusted or not, as for an auxiliary's.
 */
export function infinitiveConstruction(
  words: readonly TaggedWord[],
  i: number,
  between: (word: TaggedWord) => boolean = () => false,
  spelt: (form: string) => string = (form) => form,
): string | undefined {
  if (words[i]!.tag.label !== "verb") return undefined;
  return constructionAfter(words, i, between, spelt);
}

/** `infinitiveConstruction` whatever the word at `i` is tagged. */
function constructionAfter(
  words: readonly TaggedWord[],
  i: number,
  between: (word: TaggedWord) => boolean,
  spelt: (form: string) => string,
): string | undefined {
  let j = i + 1;
  const next = words[j];
  if (next === undefined || next.pauseBefore) return undefined;
  const introducer = INTRODUCERS.has(next.tag.label) ? spelt(next.form) : "";
  if (introducer !== "") j++;
  while (words[j] !== undefined && !words[j]!.pauseBefore && between(words[j]!))
    j++;
  const verb = words[j];
  if (verb === undefined || verb.pauseBefore || !/\.Inf$/.test(verb.tag.tag))
    return undefined;
  return introducer;
}

/**
 * A verb the tagger took for a name before an infinitive: a sentence's first word gets
 * a proper noun's tag for its capital ("Tengo que irme", "Suelo venir", "Vamos a ver",
 * "Essaie de dormir"), which counts for nothing, so its construction went unread and
 * the hover showed the word's own entry ("suelo": ground) or its base's first senses.
 * Where its sentence written in lower case tags it as a verb (`TaggedWord.lowerTag`;
 * not "Para hacer", "Disculpas por", "Encantado de"), it is a form of a verb
 * (`verbBase`: one of its bases as the language writes an infinitive, not the word
 * itself) and an infinitive follows as `infinitiveConstruction` reads it, it is that
 * verb with that construction (`WordUse.base`, `grammarPos` "verb"), so rule A1 looks
 * it up by the verb and rule A2 shows the senses said with that word first.
 */
export function namedVerbConstruction(
  words: readonly TaggedWord[],
  i: number,
  verbBase: (word: TaggedWord) => string | undefined,
  between: (word: TaggedWord) => boolean = () => false,
  spelt: (form: string) => string = (form) => form,
): Pick<WordUse, "construction" | "base" | "grammarPos"> | undefined {
  const word = words[i]!;
  if (!word.tag.proper || word.lowerTag?.label !== "verb") return undefined;
  const base = verbBase(word);
  if (base === undefined) return undefined;
  const construction = constructionAfter(words, i, between, spelt);
  return construction === undefined
    ? undefined
    : { construction, base, grammarPos: "verb" };
}
