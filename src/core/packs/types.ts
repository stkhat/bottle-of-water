/** Shapes of the pack files in data/packs/. */

import type { TaggerModel } from "../tagging/tagger";

/** en/tagger.json: the English part-of-speech tagger's model (`PerceptronModel`). */
export type TaggerPack = TaggerModel;

/** en/lemmas.json: inflected form → base form(s). */
export type LemmaPack = Readonly<Record<string, string | readonly string[]>>;
/**
 * es/lemmas/dict-<n>.json (listed in es/lemmas/index.json): a lemma table too large for
 * one file, in shards of consecutive forms, each read as it is: merging ~380,000 forms
 * into one object would cost more than reading them.
 */
export type LemmaShards = readonly LemmaPack[];
/** en/ipa.json: word → US IPA. */
export type IpaPack = Readonly<Record<string, string>>;
/**
 * en/freq.json: base forms in rank order (index 0 = rank 1): the frequency list's, with
 * rule E's words it lacks placed by the example corpus.
 */
export type FreqPack = readonly string[];
/** en/pos.json: word → parts of speech. */
export type PosPack = Readonly<Record<string, readonly string[]>>;
/**
 * en/names.json, es/names.json: the names lexicon (Wiktionary's proper-name entries),
 * by lowercase word → the kinds of name ("g" given name, "s" surname, "p" place, "o"
 * organisation, "x" other), its main kind first, then "c" when the language's own
 * sentences write it capitalised mostly (Spanish Chile: rare as a common word whatever
 * its rank), then "!" when the word is also a capitalised common word (English,
 * Christian), which rule D never takes for a name. Only vocabulary words (in Spanish
 * also their inflected forms) and given names.
 */
export type NamesPack = Readonly<Record<string, string>>;
/**
 * en/vocab.json: the words Langle knows (EJDict's single-word headwords and the words in
 * use that Wiktionary adds, rule E), sorted.
 */
export type VocabPack = readonly string[];
/**
 * en/contractions.json: a contraction, as a key ("i'm", "it's", "gonna") → what it is
 * short for, in the source's order and case (["I am"], ["it is", "it has"]).
 */
export type ContractionPack = Readonly<Record<string, readonly string[]>>;
/**
 * en/capitals.json: the vocabulary's capital-only words, as written (AI, Tokyo, iPhone),
 * sorted: words only where the text writes them so, keyed in lower case.
 */
export type CapitalsPack = readonly string[];
/**
 * en/acronyms.json: acronyms known only by what they stand for (Wikidata's aliases), as
 * written (NYPD) → the names of the things each stands for, most notable first ("New
 * York City Police Department"): words only where the text writes them so and its
 * document spells one of those out (`LanguagePack.acronymExpansions`).
 */
export type AcronymsPack = Readonly<Record<string, readonly string[]>>;
/**
 * en-ja/dict-<n>.json, merged: headword → [short gloss, senses]. en-ja/phrases.json has
 * the same shape: Japanese translations of phrases EJDict lacks, from Wiktionary's
 * translation tables, each sense "《English sense》word,word", with its senses' parts
 * of speech as a third item (`sense-labels.ts`, the source's own: "v v i").
 */
export type DictPack = Readonly<
  Record<
    string,
    readonly [short: string, senses: readonly string[], labels?: string]
  >
>;
/**
 * en-defs/dict-<n>.json, merged: word or phrase → its senses, [part of speech, text][]:
 * English Wiktionary's definitions, the fallback of every English dictionary.
 * es-en, fr-en and de-en have the same shape: English meanings of the learning
 * language's words and phrases. The short definition is not stored: it is always the
 * first sense's (`shortOfDefinition`), made when the entry is looked up (format 2,
 * 2026-11-21; format 1 stored it first, [short, senses], about a third of en-defs).
 */
export type DefsPack = Readonly<Record<string, DefinitionSenses>>;

/**
 * A definitions entry's senses: each one's part of speech and text, and "auxiliary"
 * for a sense the source marks as the verb's use as an auxiliary (`Sense.auxiliary`):
 * learning packs built in L1-3 and L1-4 (`fr-en`, `es-en`); the data build now labels
 * such a sense "auxiliary" instead. "capital" for a sense of a capitalised headword the
 * key shares with a lowercase one (`Sense.capital`; `de-en` from L2-2: Sie's "you
 * (polite)" under "sie", Essen's "food" under "essen"). "singular" or "plural" for a
 * personal pronoun's sense of that number (`Sense.number`; `de-en` from R3: sie's "she;
 * her", "they; them"). "+" and the words that introduce the infinitive a verb's sense
 * is said with, joined by "|" (`Sense.construction`; `es-en` from R4: tener's "to have
 * to", "+que"; "+" for a bare infinitive).
 */
type DefinitionSenses = readonly (readonly [
  pos: string,
  text: string,
  use?: "auxiliary" | "capital" | "singular" | "plural" | `+${string}`,
])[];
/**
 * A pair pack's entry (`PairPack`, `LearningPairPack`): its senses, the index of its
 * source, a third item of the pack's own (`extra`), and its short meaning only where it
 * is not its senses' (`shortOfPairSenses`; format 4, 2026-11-21: a Wikidata description,
 * whole), the third item null when the entry has none. Formats 1–3 (de-fr: 1) stored
 * the short first for every term, [short, senses, source, extra?]; it is made at lookup
 * for 98.5–100% of a pack's terms.
 */
export type PairEntry<Extra> = readonly [
  senses: PairSenses,
  source: number,
  extra?: Extra | null,
  short?: string,
];
/**
 * A pair entry's senses: each one's part of speech and text; a sense from a translation
 * table or a wordnet carries its English sense as a hint ("source of illumination"). A
 * pointer sense (format 2), an edition's form of another word ("Pasado simple del verbo
 * (to) tell" on told), has a null hint and names its target term.
 */
type PairSenses = readonly (readonly [
  pos: string,
  text: string,
  hint?: string | null,
  target?: string,
])[];
/**
 * en-<native>/dict-<n>.json, merged (en-es): term → its entry (`PairEntry`), built by a
 * recipe from human-made sources in order, the first one with the term supplying all of
 * it. `source` indexes the index's `sources`. Capitalised headwords (format 3) are kept
 * apart in capital.json, the first shard, under their `capitalKey` (Japan, Thursday; an
 * acronym in capitals: TV), each with what its meaning is as the third item ("name" or
 * "word", none when it has none: `capitalDictionary` in the data build).
 */
export type PairPack = Readonly<Record<string, PairEntry<"name" | "word">>>;
/**
 * A learning pair's pack (<learning>-<native>, L3: de-fr), merged: as a recipe pair's
 * (`PairPack`), keyed as the learning language's English pair (de-en: lower case), and,
 * in a learning language that capitalises its nouns, a third item with the indices of
 * the senses of the term's capitalised headword where the English pair marks them
 * (German "Sie": the polite you; "Essen": a meal), which the hover shows first where
 * the page writes the word capitalised.
 */
export type LearningPairPack = Readonly<
  Record<string, PairEntry<readonly number[]>>
>;
/**
 * en-ja/pos.json: the parts of speech of EJDict's senses for words with several, one
 * code per sense (`sense-labels.ts`): "n~ v a* a".
 */
export type SensePosPack = Readonly<Record<string, string>>;
/** en-ja/index.json (and the other dictionaries' index.json): the shards, in headword order. */
export interface ShardIndex {
  readonly shards: readonly {
    readonly file: string;
    readonly first: string;
    readonly last: string;
  }[];
  /** A pair pack's sources, by the index each entry gives. */
  readonly sources?: readonly string[];
}
