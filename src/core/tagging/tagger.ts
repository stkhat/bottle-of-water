/**
 * A language's part-of-speech tagger, as its language pack has it (`LanguagePack.tagger`),
 * and what the language-independent rules read from it: a tag per token with its
 * confidence, and how each word of a sentence is used (an auxiliary, a participle used
 * as an adjective). Languages without a tagger (Spanish so far) leave those rules off.
 */
import type { PerceptronModel } from "./perceptron";

/** One token's tag. */
export interface TokenTag {
  /** The tagger's own tag (Penn Treebank for English: VBD, NNS, …). */
  tag: string;
  /**
   * The part of speech as the dictionaries label senses: noun, verb, adjective, adverb,
   * preposition, conjunction, determiner, pronoun, numeral, interjection, particle;
   * "other" for punctuation and the rest.
   */
  label: string;
  /** An inflected form of `label`: a past, a participle, a third person, a comparative. */
  inflected: boolean;
  /** The tag says the written form carries an ending: `inflected`, or a plural. */
  morph: boolean;
  /** A proper-noun tag. */
  proper: boolean;
  /** How sure the tagger is; compare with `Tagger.threshold`. Infinity for a word with one tag. */
  confidence: number;
}

/** A word of a tagged sentence, as the language's grammar reads it. */
export interface TaggedWord {
  /** The word as keys compare it (lower case). */
  form: string;
  /** Its base forms (`LanguagePack.lemmas`). */
  bases: readonly string[];
  tag: TokenTag;
  /** The tag is trusted (`trustedTag`). */
  trusted: boolean;
  /** Punctuation comes between the word before and this one. */
  pauseBefore: boolean;
}

/** How a word is used in its sentence. */
export interface WordUse {
  /**
   * An auxiliary here: "has" in "has spent", "is" in "is going", "did" in "did you go",
   * "had" in "had to", "got" in "got hurt". Its dictionary entry's grammar pointer
   * fits ("haveの三人称単数現在"); its tag says nothing of its meaning.
   */
  auxiliary: boolean;
  /**
   * How a word tagged as an inflected verb is used: after an auxiliary ("aux": a
   * perfect, a progressive), as a finite verb, otherwise as a verb ("other"), or not as
   * a verb (false: before a noun, "demanding work"; a state, "was established").
   */
  verbal: "aux" | "finite" | "other" | false;
  /**
   * A participle not after an auxiliary, where a preposition may stand: a clause's
   * start, after a pause or a noun ("Including taxes, …", "costs including taxes").
   */
  prepositionSlot: boolean;
  /** The part of speech the use gives instead of the tag's: a gerund after a determiner is a noun. */
  label?: string;
}

/**
 * What a word is, as the phrase rules read a dictionary phrase's context
 * (`phrases/fit.ts`): the language's closed classes, from the word's trusted tag and
 * its form.
 */
export interface WordRole {
  /** A determiner that opens a noun phrase ("the", "my", "what"; not "that"). */
  determiner: boolean;
  /** Opens a noun phrase: a determiner, a noun (a proper noun even when not trusted), a number. */
  nounPhrase: boolean;
  /** Can open an object or a complement: a noun phrase, "that", an object pronoun, a wh-word. */
  object: boolean;
  /** A modal or a do-support auxiliary ("can", "do" in "do you know"). */
  modal: boolean;
  /** The infinitive marker ("to" before a verb). */
  infinitive: boolean;
  /** A preposition. */
  preposition: boolean;
  /** Can be a subject: a pronoun or a noun. */
  subject: boolean;
  /** The partitive "of" ("all of that"). */
  partitive: boolean;
  /** A form of "be", also in a contraction ("it's", "we're"). */
  be: boolean;
  /** A past participle ("held"). */
  pastParticiple: boolean;
}

export interface Tagger {
  /**
   * Tags the tokens of one sentence (its words and punctuation as written, without
   * spaces), one tag per token. A token the language writes as two words for its
   * tagger ("don't") takes its first word's tag.
   */
  tag(tokens: readonly string[]): TokenTag[];
  /** Tags at or above this confidence are trusted. */
  readonly threshold: number;
  /** How each word of a tagged sentence is used (the language's grammar). */
  uses(words: readonly TaggedWord[]): WordUse[];
  /** What a tagged word is among the language's closed classes. */
  role(word: TaggedWord): WordRole;
}

/** The model a language pack ships for its tagger. */
export type TaggerModel = PerceptronModel;

/**
 * Whether a tag counts as evidence: the tagger is confident, it is not a proper-noun
 * tag (a name is no word to look up; "Deposit my specimen" at a sentence start), and it
 * agrees with the word's form: a form that is not a headword of its own (an inflected
 * form) cannot carry a bare tag ("calmer" as a noun).
 */
export function trustedTag(
  tag: TokenTag,
  threshold: number,
  form: string,
  bases: readonly string[],
): boolean {
  if (tag.confidence < threshold || tag.proper) return false;
  return !(bases.length > 0 && !bases.includes(form) && !tag.morph);
}
