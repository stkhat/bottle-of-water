// The learning-language pack build shared by every language whose pack comes from
// English Wiktionary's entries of it (kaikki, CC BY-SA): a frequency list's forms, the
// extract's form-of and alt-of senses and a treebank's lemmas →
// data/packs/<lang>/{freq,vocab,ipa,pos,phrases,names}.json,
// data/packs/<lang>/lemmas/{index,dict-<n>}.json and the dictionary into English,
// data/packs/<lang>-en/{index,dict-<n>}.json. CORE: what a language changes is its
// `LearningBuild` (es-kaikki.ts, fr-kaikki.ts).
import { rmSync } from "node:fs";
import { join } from "node:path";
import { singleIpa } from "../../src/core/lexicon/ipa.ts";
import { splitElisions } from "../../src/core/text/tokenize.ts";
import { shortOfDefinition } from "../../src/core/lexicon/short-lines.ts";
import type { DefsPack } from "../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import {
  byCodeUnit,
  PACKS_DIR,
  eachEntry,
  posLabel,
  writeShards,
  writePack,
  type KaikkiEntry,
  type KaikkiSense,
} from "./common.ts";
import type { LemmaCounts } from "./es-tagger.ts";
import { buildFrequency } from "./frequency.ts";
import { createCaseCounter } from "./examples.ts";
import { ENGLISH_PHRASES } from "./idiomaticity.ts";
import { createNames } from "./kaikki.ts";
import {
  glossOf,
  importPhrases,
  isUsable,
  type PhraseBuildLanguage,
  type PhraseInputs,
} from "./phrases.ts";

/**
 * What the build needs to know of a learning language (LEARNING): its kaikki language
 * code, the shape of its words and its phrase build's settings.
 */
export interface LearningBuild {
  /** kaikki's language code, which is also the pack's name ("es", "fr"). */
  lang: string;
  /**
   * A single word as the tokenizer keeps it, in lower case with ' for ’: Spanish
   * letters only; French letters with inner apostrophes and an elided word's final one
   * ("aujourd'hui", "l'").
   */
  word: RegExp;
  /**
   * Whether a headword written with an apostrophe is a word of its own, and not only
   * the words the tokenizer splits it into (`tokenize`'s elisions): French "qu'il"
   * (contraction of que + il) and "j'ai" (compound of je and ai) are not, "d'accord"
   * and "aujourd'hui" are. Every headword is one when undefined.
   */
  ownWord?: (entries: readonly KaikkiEntry[]) => boolean;
  /**
   * Whether text reads such a word of its own as one: a treebank joins its parts as a
   * fixed expression ("d'accord", "d'abord") or a pronominal verb ("s'agit"), not as
   * a clause ("j'aime": I like, not the noun "a like"). Every one is when undefined.
   */
  readWhole?: (word: string) => boolean;
  /** The phrase build's settings, from the words' parts of speech and lemmas. */
  phraseBuild(
    pos: Readonly<Record<string, readonly string[]>>,
    lemmas: Readonly<Record<string, string | readonly string[]>>,
  ): PhraseBuildLanguage;
  /**
   * Whether every phrase pattern is only matched for saved phrases and selections,
   * none highlighted: while the language's phrase rules are not judged yet.
   */
  selectOnlyPhrases?: boolean;
}

/**
 * Closed classes whose words name no thing, quality or action: a phrase pattern of
 * these only is not detected ("lo que"; `closedClass`).
 */
export const GRAMMAR_CLASSES: ReadonlySet<string> = new Set([
  "pronoun",
  "article",
  "determiner",
  "conjunction",
]);
/** The closed classes, prepositions included: function words. */
export const CLOSED_CLASSES: ReadonlySet<string> = new Set([
  ...GRAMMAR_CLASSES,
  "preposition",
  "contraction",
]);
const FREQ_TOP = 30000;
const MAX_SENSES = 6;
// Form-of and alt-of senses that do not make the word a form of the word they point to.
const IGNORED_FORM_TAGS = new Set([
  "obsolete",
  "archaic",
  "misspelling",
  "nonstandard",
  "pronunciation-spelling",
]);
/**
 * Register labels Wiktionary writes on a head line ("fin m or f (archaic f)") and
 * kaikki copies onto every sense of the entry.
 */
const REGISTER_TAGS: readonly string[] = ["obsolete", "archaic"];
/**
 * A word among the frequency list's this many most frequent forms is in current use:
 * a register label every sense of its entry carries is the head line's
 * (`withoutHeadLabels`).
 */
const HEAD_RANK = 50000;
/**
 * A name the examples write capitalised inside a sentence at least this many times as
 * often as in lower case (and at least `MIN_CAPITALISED` times) is marked "c" in the
 * names lexicon: rule D counts it as rare whatever the frequency list says, since the
 * list folds case ("chile" ranks among the 3,000 most common words because of Chile).
 */
const MOSTLY_CAPITALISED = 2;
const MIN_CAPITALISED = 3;
/** Alt-of senses that stand for a longer term ("ESO", "ONU"). */
const ACRONYM_TAGS: ReadonlySet<string> = new Set(["acronym", "initialism"]);

type Sense = [pos: string, text: string];

function firstPhonemicIpa(
  entry: KaikkiEntry,
  written: (ipa: string) => string = (ipa) => ipa,
) {
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa !== "string") continue;
    const ipa = singleIpa(written(sound.ipa));
    if (ipa?.startsWith("/")) return ipa;
  }
  return undefined;
}

/**
 * The entry with the register labels every one of its senses carries taken off them:
 * kaikki copies a head line's labels onto each sense ("fin": archaic as a feminine
 * noun, on "end" and "purpose" alike; "vosotros": archaic in the Philippines). Applied
 * to a word in current use only, where such a label is not the word's. A label a
 * sense's gloss writes is that sense's own ("vos": obsolete form of os).
 */
export function withoutHeadLabels(entry: KaikkiEntry): KaikkiEntry {
  const senses = entry.senses ?? [];
  const everywhere = REGISTER_TAGS.filter(
    (tag) =>
      senses.length > 0 &&
      senses.every(
        (sense) =>
          (sense.tags ?? []).includes(tag) &&
          !(sense.glosses ?? []).some(
            (gloss) =>
              typeof gloss === "string" &&
              new RegExp(`\\b${tag}\\b`, "i").test(gloss),
          ),
      ),
  );
  if (everywhere.length === 0) return entry;
  return {
    ...entry,
    senses: senses.map((sense) => ({
      ...sense,
      tags: (sense.tags ?? []).filter((tag) => !everywhere.includes(tag)),
    })),
  };
}

/** The words a form-of or alt-of sense points to, as kaikki lists them. */
function pointerTargets(targets: unknown): string[] {
  if (!Array.isArray(targets)) return [];
  return targets.flatMap((target: unknown) => {
    const word =
      target !== null && typeof target === "object"
        ? (target as { word?: unknown }).word
        : undefined;
    return typeof word === "string" ? [word.trim()] : [];
  });
}

/** What a pointer's gloss names after its "of", up to a bracket or a punctuation mark. */
const named = (gloss: string) =>
  /\bof\s+([^,;:(]+)/u.exec(gloss)?.[1]?.trim() ?? "";

/**
 * The one word an alt-of sense makes the word another spelling or form of ("muy":
 * apocopic form of mucho; "vídeo": alternative form of video; "este": superseded
 * spelling of éste), else undefined: an abbreviation of a longer term ("ESO": acronym
 * of Educación Secundaria Obligatoria; "al": contraction of a + el) is none, nor is a
 * sense with no meaning (obsolete, archaic, misspelt). kaikki splits a gloss at its
 * commas into more targets ("apocopic form of tuyo, your": tuyo, your); the one the
 * gloss names after "of" is the target.
 */
function altOfTarget(sense: KaikkiSense): string | undefined {
  const [target] = pointerTargets(sense.alt_of);
  const gloss: unknown = sense.glosses?.at(-1);
  if (target === undefined || typeof gloss !== "string") return undefined;
  if (/\s/.test(target) || named(gloss) !== target) return undefined;
  const tags = sense.tags ?? [];
  if (tags.some((tag) => ACRONYM_TAGS.has(tag) || UNUSABLE_TAGS.has(tag)))
    return undefined;
  return target;
}

/**
 * The single-word bases an entry's form-of senses (`alt` false) or alt-of senses
 * (`alt` true) point to, lowercased; junk such as "-er" left out.
 */
function pointerBases(entry: KaikkiEntry, alt: boolean, word: RegExp) {
  const bases: string[] = [];
  for (const sense of entry.senses ?? []) {
    if ((sense.tags ?? []).some((tag) => IGNORED_FORM_TAGS.has(tag))) continue;
    const words = alt
      ? [altOfTarget(sense) ?? []].flat()
      : pointerTargets(sense.form_of);
    for (const target of words) {
      const base = target.toLowerCase().replaceAll("’", "'");
      if (word.test(base)) bases.push(base);
    }
  }
  return bases;
}

/** Form-of and alt-of senses that give no meaning, as `isUsable` leaves such senses out. */
const UNUSABLE_TAGS: ReadonlySet<string> = new Set([
  "obsolete",
  "archaic",
  "misspelling",
]);
const OPENING = "([{“‘";
const CLOSING = ")]}”’";

/** A pointer's target of one word, with or without a bracketed note ("primero (first)"). */
const oneWord = (target: string) =>
  /^[^\s,;:()]+$/u.test(target.replace(/\([^)]*\)/g, "").trim());
/** A participle clause about the pointer, not a meaning: "deprecated in 2010", "used in …". */
const ABOUT_POINTER = /^\s*\p{L}+(?:ed|ing)\b/u;

/**
 * The meaning a pointer's gloss gives after its target, put first: "dative of ellos
 * and ellas; to them, for them" → "to them, for them; dative of ellos and ellas";
 * "female equivalent of chico: girl" → "girl; female equivalent of chico"; "apocopic
 * form of tuyo, your" → "your; apocopic form of tuyo". The pointer ends at the first
 * ";" or ":" outside brackets and quotes after its "of" (the quoted gloss in "of colar
 * (“to sift; to dupe”)" is its target's). In a gloss with neither, it ends at a ","
 * after a one-word target when a meaning follows, not a clause about the pointer
 * ("superseded spelling of guion, deprecated in 2010"); before a ";" a comma
 * separates targets ("accusative of ella, ello, and usted; her, it, you"). Undefined
 * for a gloss that only points ("plural of casa").
 */
export function pointerMeaning(gloss: string): string | undefined {
  const of = /\bof\s/.exec(gloss);
  if (!of) return undefined;
  const target = of.index + of[0].length;
  let depth = 0;
  let comma: number | undefined;
  let end: number | undefined;
  for (let i = of.index; i < gloss.length && end === undefined; i++) {
    const c = gloss[i]!;
    if (OPENING.includes(c)) depth++;
    else if (CLOSING.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth > 0) continue;
    else if (c === ";" || c === ":") end = i;
    else if (
      c === "," &&
      comma === undefined &&
      oneWord(gloss.slice(target, i)) &&
      !ABOUT_POINTER.test(gloss.slice(i + 1))
    )
      comma = i;
  }
  end ??= comma;
  if (end === undefined) return undefined;
  const pointer = gloss.slice(0, end).trim();
  const meaning = gloss.slice(end + 1).trim();
  return meaning ? `${meaning}; ${pointer}` : undefined;
}

/**
 * The meaning an alt-of gloss gives: after its target, as a form-of gloss's
 * (`pointerMeaning`: "apocopic form of mucho; very" → "very; apocopic form of mucho"),
 * or the quoted gloss of its target, which another form of the word shares ("apocopic
 * form of bueno (“good, fine”)" → "good, fine; apocopic form of bueno"). Undefined
 * for a gloss that only points ("alternative form of quizá"): the sense then takes its
 * target's meaning (`buildLearningPacks`).
 */
export function altMeaning(gloss: string): string | undefined {
  return pointerMeaning(gloss) ?? quotedMeaning(gloss);
}

/**
 * The quoted gloss of a pointer's one-word target, put first: "masculine plural of el
 * (“the”)" → "the; masculine plural of el". Undefined without one.
 */
export function quotedMeaning(gloss: string): string | undefined {
  const quoted = /^(.*?\bof\s+[^\s,;:()]+)\s*\(“([^”]+)”\)\s*$/u.exec(gloss);
  return quoted ? `${quoted[2]!.trim()}; ${quoted[1]!.trim()}` : undefined;
}

/**
 * The meaning a contraction's gloss gives of the words it joins, put first: the literal
 * one Wiktionary's template writes ("contraction of à + le, literally “to the, for the,
 * at the”" → "to the, for the, at the; contraction of à + le"), or a quoted one in
 * closing brackets ("Contraction of à + les ('to the' or 'of the')"). Undefined for a
 * gloss that only names the words ("contraction of que + il").
 */
export function contractionMeaning(gloss: string): string | undefined {
  const literal = /,?\s*\bliterally\s+“([^”]+)”/u.exec(gloss);
  const quoted = literal
    ? undefined
    : /\s*\(\s*(['‘“][^)]*['’”])\s*\)\s*$/u.exec(gloss);
  const found = literal ?? quoted;
  if (!found) return undefined;
  const meaning = found[1]!.replace(/['‘’“”]/gu, "").trim();
  const pointer = (
    gloss.slice(0, found.index) + gloss.slice(found.index + found[0].length)
  ).trim();
  return meaning ? `${meaning}; ${pointer}` : undefined;
}

/**
 * A part of a closed-class gloss that describes the word's grammar rather than
 * translating it: it names a part of speech ("feminine plural definite article",
 * "first-person singular pronoun in the nominative case").
 */
const GRAMMAR_NAME =
  /\b(?:article|pronoun|determiner|preposition|conjunction|contraction)s?\b/i;

/** The parts of a gloss split at each `separator` outside brackets and quotes. */
function topLevelParts(gloss: string, separator: string) {
  const parts: string[] = [];
  let depth = 0;
  let at = 0;
  for (let i = 0; i < gloss.length; i++) {
    const c = gloss[i]!;
    if (OPENING.includes(c)) depth++;
    else if (CLOSING.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === separator) {
      parts.push(gloss.slice(at, i));
      at = i + 1;
    }
  }
  parts.push(gloss.slice(at));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * A closed-class gloss (article, determiner, pronoun, preposition, conjunction,
 * contraction) with its translation first, as a content word's is: kaikki often
 * describes such a word before translating it ("feminine plural definite article;
 * the" → "the; feminine plural definite article"; "A reflexive or reciprocal pronoun:
 * oneself, himself" → "oneself, himself; A reflexive or reciprocal pronoun"), and the
 * hover line is the first part. The parts are split at ";" and, after a description,
 * at ":"; a description names a part of speech (`GRAMMAR_NAME`). Unchanged when it
 * already starts with a translation or gives none ("plural masculine or neuter
 * pronoun").
 */
export function translationFirst(gloss: string): string {
  const parts = topLevelParts(gloss, ";").flatMap((part) => {
    const [head, ...rest] = topLevelParts(part, ":");
    return rest.length > 0 && GRAMMAR_NAME.test(head!)
      ? [head!, rest.join(": ")]
      : [part];
  });
  const describes = (part: string) => GRAMMAR_NAME.test(part);
  if (!describes(parts[0] ?? "") || parts.every(describes)) return gloss;
  return [
    ...parts.filter((part) => !describes(part)),
    ...parts.filter(describes),
  ].join("; ");
}

/**
 * One sense with a meaning: its part of speech and text; for an alt-of sense that
 * counts (`altOfTarget`), its target, and whether the text is only the pointer.
 */
interface SenseItem {
  def: Sense;
  sense: KaikkiSense;
  alt?: { target: string; pointerOnly: boolean };
}

/**
 * An entry's senses with a meaning, in the source's order: a usable sense's gloss; a
 * form-of sense's meaning after its pointer ("me": "accusative of yo: me"; the clitic
 * pronouns, possessives and demonstratives have no other); an alt-of sense's
 * `altMeaning`, else its pointer. Proper-noun entries (Brasil, Carlos, Acapulco) give
 * none, so a word with only those is not a vocabulary word; a word with other entries
 * keeps their senses.
 */
function usableSenses(entry: KaikkiEntry): SenseItem[] {
  if (entry.pos === "name") return [];
  const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
  const closed = CLOSED_CLASSES.has(pos);
  return (entry.senses ?? []).flatMap((sense): SenseItem[] => {
    if (isUsable(sense)) {
      const gloss = glossOf(sense).trim();
      return [{ def: [pos, closed ? translationFirst(gloss) : gloss], sense }];
    }
    const last: unknown = sense.glosses?.at(-1);
    const gloss = typeof last === "string" ? last.trim() : "";
    if (!gloss) return [];
    if (Array.isArray(sense.alt_of)) {
      const target = altOfTarget(sense);
      if (target === undefined) {
        const meaning = (sense.tags ?? []).includes("contraction")
          ? contractionMeaning(gloss)
          : undefined;
        return meaning ? [{ def: [pos, meaning], sense }] : [];
      }
      const meaning = altMeaning(gloss);
      return [
        {
          def: [pos, meaning ?? gloss],
          sense,
          alt: { target, pointerOnly: meaning === undefined },
        },
      ];
    }
    if (!Array.isArray(sense.form_of)) return [];
    if ((sense.tags ?? []).some((tag) => UNUSABLE_TAGS.has(tag))) return [];
    // A closed-class form translates as its base does: its target's quoted gloss is
    // its meaning ("los": masculine plural of el (“the”)). Not a content word's: the
    // quote glosses one sense of the base ("colas": … of colar (“to confer”)).
    const meaning =
      pointerMeaning(gloss) ?? (closed ? quotedMeaning(gloss) : undefined);
    return meaning ? [{ def: [pos, meaning], sense }] : [];
  });
}

const NO_LEMMAS: LemmaCounts = {
  byForm: new Map(),
  byLemma: new Map(),
  byTag: new Map(),
};

/** The universal tags of each dictionary part of speech, as src/core/tagging/es.ts maps them. */
const TAGS_OF: Readonly<Record<string, readonly string[]>> = {
  noun: ["NOUN", "PROPN"],
  verb: ["VERB", "AUX"],
  adjective: ["ADJ"],
  adverb: ["ADV"],
  preposition: ["ADP"],
  contraction: ["ADP"],
  conjunction: ["CCONJ", "SCONJ"],
  determiner: ["DET"],
  article: ["DET"],
  pronoun: ["PRON"],
  numeral: ["NUM"],
  interjection: ["INTJ"],
};

/**
 * A word's parts of speech (its entries', in the source's order), the one the
 * treebanks tag it with most often first: "de" is a preposition before the letter's
 * noun, "la" an article before the note. Ties keep the source's order.
 */
export function byTreebankTags(
  word: string,
  labels: readonly string[],
  treebank: LemmaCounts,
): string[] {
  const count = (label: string) => taggedAs(word, label, treebank);
  return [...labels].sort((a, b) => count(b) - count(a));
}

/** How often the treebanks tag `word` with the tags of a dictionary part of speech. */
function taggedAs(word: string, label: string, { byTag }: LemmaCounts) {
  return (Object.hasOwn(TAGS_OF, label) ? TAGS_OF[label]! : []).reduce(
    (sum, tag) => sum + (byTag.get(`${word} ${tag}`) ?? 0),
    0,
  );
}

/**
 * A word's parts of speech (`pos.json`): those of its senses with a meaning, then the
 * closed classes of its form-of senses that the treebanks tag it with ("una": the
 * pronoun, and the determiner it is a form of uno as), the treebanks' most frequent
 * first (`byTreebankTags`). A form-of sense of a closed class gives the word its
 * grammar, which the fit and name rules read ("los Párrocos": a determiner), even
 * when its meaning is its base's; a content word's form-of senses add nothing (the
 * verb forms "una", "como" stay what their own senses say).
 */
export function partsOfSpeech(
  word: string,
  meant: Iterable<string>,
  forms: Iterable<string>,
  treebank: LemmaCounts,
): string[] {
  const labels = new Set(meant);
  for (const label of forms)
    if (CLOSED_CLASSES.has(label) && taggedAs(word, label, treebank) > 0)
      labels.add(label);
  return byTreebankTags(word, [...labels], treebank);
}

/**
 * How many of a form's treebank lemmas the bases' own frequencies weigh as: a form the
 * treebanks lemmatize only once or twice ("Vengo" as vengar) does not outweigh a base
 * they use far more often (venir).
 */
const PRIOR_WEIGHT = 5;

/**
 * A form's bases in the order the treebanks give it them, likeliest first: how often
 * they lemmatize the form as each base, plus PRIOR_WEIGHT shared among the bases by
 * how often the treebanks use each at all; ties as given. A form two verbs share goes
 * to the likelier one ("creo": creer before crear, "siento": sentir before sentar),
 * which rule A1 then reads it as (`LanguagePack.basesInOrder`), and the frequency list
 * ranks that one by the form (`buildFrequency`).
 */
export function byTreebank(
  form: string,
  bases: readonly string[],
  { byForm, byLemma }: LemmaCounts,
): string[] {
  const used = (base: string) => byLemma.get(base) ?? 0;
  const total = bases.reduce((sum, base) => sum + used(base), 0);
  const score = (base: string) =>
    (byForm.get(`${form} ${base}`) ?? 0) +
    (total > 0 ? (PRIOR_WEIGHT * used(base)) / total : 0);
  return [...bases].sort((a, b) => score(b) - score(a));
}

function definition(senses: Sense[]): DefsPack[string] {
  const kept = senses.slice(0, MAX_SENSES);
  return [shortOfDefinition(kept[0]![1]), kept];
}

export type LearningPacks = Awaited<ReturnType<typeof buildLearningPacks>>;

/** A pronunciation as Wiktionnaire writes it, "\\me.zɔ̃\\", in slashes: "/me.zɔ̃/". */
const slashed = (ipa: string) => ipa.replace(/^\\(.*)\\$/su, "/$1/");

/**
 * Builds a learning language's pack from the frequency-list `forms` (lowercase single
 * words in rank order, as the list writes them): the vocabulary is every base with a
 * meaning that a form reaches (the form itself, or what its form-of entries point to).
 * Entries spelt exactly like the lowercase word win; entries in another casing
 * (Brasil) are used only when there are none with a meaning. A headword the list
 * writes as more than one form ("jusqu'à" as jusqu' and à: the language's elisions,
 * `splitElisions`) is reached when it is a word of its own (`LearningBuild.ownWord`)
 * and the list has each part, ranked as its rarest part.
 */
export async function buildLearningPacks(
  language: LearningBuild,
  path: string,
  forms: string[],
  {
    freqTop = FREQ_TOP,
    treebank = NO_LEMMAS,
    headRank = HEAD_RANK,
    casePaths = [],
    ipaPaths = [],
    phraseScoring = {},
  }: {
    freqTop?: number;
    /** The treebanks' lemma counts (`treebankLemmas`), which order a form's bases. */
    treebank?: LemmaCounts;
    /** How many of `forms` are in current use (`withoutHeadLabels`). */
    headRank?: number;
    /**
     * More extracts whose examples in the language say how names are written and make
     * the phrase build's example corpus (`path`'s own examples always count).
     */
    casePaths?: readonly string[];
    /**
     * More extracts whose pronunciations give a vocabulary word the IPA `path` lacks
     * (the language's own edition: Wiktionnaire writes it "\\li.ʁe\\").
     */
    ipaPaths?: readonly string[];
    /** The phrase score's stopwords, for a small extract (`importPhrases`). */
    phraseScoring?: Pick<PhraseInputs, "stopwords">;
  } = {},
) {
  /** The frequency list's forms in current use (`withoutHeadLabels`). */
  const inUse = new Set(forms.slice(0, headRank));
  interface Bucket {
    /** Its senses with a meaning, in the source's order (`usableSenses`). */
    items: Omit<SenseItem, "sense">[];
    /** Its senses as the pack gives them (up to MAX_SENSES). */
    senses: Sense[];
    /** An entry of it says it is an inflected form (only for exact spellings). */
    form: boolean;
    ipa: string | undefined;
    /** What its form-of senses point to (only for exact spellings). */
    bases: string[];
    /** What its alt-of senses point to (only for exact spellings). */
    altBases: string[];
    /** The parts of speech of its senses, in the source's order. */
    pos: Set<string>;
    /** The parts of speech of its form-of senses (only for exact spellings). */
    formPos: Set<string>;
  }
  const exact = new Map<string, Bucket>();
  const folded = new Map<string, Bucket>();
  const names = createNames();
  const { lang, word: WORD } = language;
  const cases = createCaseCounter(lang);
  /** The entries of each headword written with an apostrophe (`ownWord`). */
  const apostrophes = new Map<string, KaikkiEntry[]>();
  const stats = await eachEntry(path, (read) => {
    if (read.lang_code !== lang) return;
    names.add(read);
    cases.add(read);
    const word = read.word.trim().replaceAll("’", "'");
    const lower = word.toLowerCase();
    const entry = inUse.has(lower) ? withoutHeadLabels(read) : read;
    // Multi-word entries are the phrase build's (`importPhrases`).
    if (/\s/.test(lower) || !WORD.test(lower)) return;
    if (lower.includes("'") && language.ownWord) {
      const found = apostrophes.get(lower);
      if (found) found.push(entry);
      else apostrophes.set(lower, [entry]);
    }
    const items = usableSenses(entry);
    const buckets = word === lower ? exact : folded;
    let bucket = buckets.get(lower);
    if (!bucket)
      buckets.set(
        lower,
        (bucket = {
          items: [],
          senses: [],
          form: false,
          ipa: undefined,
          bases: [],
          altBases: [],
          pos: new Set(),
          formPos: new Set(),
        }),
      );
    for (const { def, alt } of items)
      bucket.items.push(alt ? { def, alt } : { def });
    bucket.ipa ??= firstPhonemicIpa(entry);
    if (word === lower) {
      const bases = pointerBases(entry, false, WORD);
      bucket.form ||= bases.length > 0;
      if (bases.length > 0 && typeof entry.pos === "string")
        bucket.formPos.add(posLabel(entry.pos));
      bucket.bases.push(...bases);
      bucket.altBases.push(...pointerBases(entry, true, WORD));
    }
  });
  // A headword with an apostrophe that is no word of its own ("qu'il": que + il) is
  // left to its parts, which the tokenizer splits it into.
  for (const [word, entries] of apostrophes)
    if (
      splitElisions(word, lang).length > 1 &&
      (!language.ownWord!(entries) || language.readWhole?.(word) === false)
    ) {
      exact.delete(word);
      folded.delete(word);
    }
  /** Each listed form's rank; a headword the list writes in parts, its rarest part's. */
  const ranks = new Map<string, number>();
  forms.forEach((form, i) => {
    if (!ranks.has(form)) ranks.set(form, i + 1);
  });
  for (const word of exact.keys()) {
    if (ranks.has(word)) continue;
    const parts = splitElisions(word, lang);
    if (parts.length < 2 || !parts.every((part) => ranks.has(part))) continue;
    ranks.set(word, Math.max(...parts.map((part) => ranks.get(part)!)));
  }
  const listed = [...ranks].sort((a, b) => a[1] - b[1]).map(([form]) => form);
  /**
   * What an alt-of sense that only points means: its target's first meaning of the
   * same part of speech, else its first ("sólo", adverb: superseded spelling of solo →
   * "only; solely; just"), with the pointer after it; the pointer alone when the
   * target has none.
   */
  const targetMeaning = ([pos, pointer]: Sense, target: string): Sense => {
    const key = target.toLowerCase();
    const meanings = [exact.get(key), folded.get(key)]
      .flatMap((bucket) => bucket?.items ?? [])
      .filter((item) => !item.alt?.pointerOnly)
      .map(({ def }) => def);
    const found = meanings.find(([label]) => label === pos) ?? meanings.at(0);
    return found ? [pos, `${found[1]}; ${pointer}`] : [pos, pointer];
  };
  // Alt-of senses count, with their targets as bases, unless the word is an inflected
  // form: "os" is a form of vosotros, not "alternative form of ox".
  for (const [word, bucket] of [...exact, ...folded]) {
    const form = exact.get(word)?.form ?? false;
    for (const { def, alt } of bucket.items) {
      if (alt && form) continue;
      if (bucket.senses.length < MAX_SENSES)
        bucket.senses.push(
          alt?.pointerOnly ? targetMeaning(def, alt.target) : def,
        );
      if (def[0]) bucket.pos.add(def[0]);
    }
    if (!form) bucket.bases.push(...bucket.altBases);
  }

  const meaningOf = (word: string) =>
    [exact.get(word), folded.get(word)].find(
      (b): b is Bucket => (b?.senses.length ?? 0) > 0,
    );
  const vocabSet = new Set<string>();
  const lemmas: Record<string, string | string[]> = {};
  let reordered = 0;
  /** What a form's form-of senses point to, but itself. */
  const pointed = (form: string) =>
    (exact.get(form)?.bases ?? []).filter((base) => base !== form);
  /**
   * Gives a form its bases among `within`, likeliest first; returns them. A base
   * outside `within` that is only a form itself gives its own bases: French "appelés"
   * is the plural of appelé, the participle of appeler.
   */
  const lemmatize = (form: string, within: (base: string) => boolean) => {
    const found = [
      ...new Set(
        pointed(form).flatMap((base) =>
          within(base)
            ? [base]
            : pointed(base).filter((next) => next !== form && within(next)),
        ),
      ),
    ].sort(byCodeUnit);
    const bases = byTreebank(form, found, treebank);
    if (bases[0] !== found[0]) reordered++;
    if (bases.length > 0) lemmas[form] = bases.length === 1 ? bases[0]! : bases;
    return bases;
  };
  // The vocabulary: the listed forms with a meaning and the bases with one that they
  // reach, and in turn those bases' own ("tus" → tu → tuyo).
  const reached: string[] = [];
  const reach = (word: string) => {
    if (vocabSet.has(word)) return;
    vocabSet.add(word);
    reached.push(word);
  };
  const lemmatized = new Set<string>();
  for (const form of listed) {
    if (meaningOf(form)) reach(form);
    lemmatized.add(form);
    for (const base of lemmatize(form, (b) => !!meaningOf(b))) reach(base);
  }
  for (let i = 0; i < reached.length; i++) {
    const word = reached[i]!;
    if (lemmatized.has(word)) continue;
    lemmatized.add(word);
    for (const base of lemmatize(word, (b) => !!meaningOf(b))) reach(base);
  }
  // Every other form a kaikki entry gives of a vocabulary word (all of a verb's forms,
  // clitic forms such as "cuéntales"). One with a meaning of its own is a vocabulary
  // word too ("ajá": aha, and a form of ajar), as a listed form would be.
  let moreForms = 0;
  let moreWords = 0;
  for (const form of exact.keys()) {
    if (lemmatized.has(form)) continue;
    if (lemmatize(form, (b) => vocabSet.has(b)).length === 0) continue;
    moreForms++;
    if (meaningOf(form)) {
      vocabSet.add(form);
      moreWords++;
    }
  }
  const vocab = [...vocabSet].sort(byCodeUnit);
  /** Pronunciations `ipaPaths` give vocabulary words `path` has none for. */
  const moreIpa = new Map<string, string>();
  const ownIpa = (word: string) =>
    exact.get(word)?.ipa ?? folded.get(word)?.ipa;
  for (const more of new Set([...casePaths, ...ipaPaths])) {
    const examples = casePaths.includes(more);
    const sounds = ipaPaths.includes(more);
    await eachEntry(
      more,
      (entry) => {
        if (examples) cases.add(entry);
        if (!sounds || entry.lang_code !== lang) return;
        const written = entry.word.trim().replaceAll("’", "'");
        const word = written.toLowerCase();
        if (!vocabSet.has(word) || ownIpa(word) !== undefined) return;
        // An entry spelt exactly like the word wins, as in `path`.
        if (written !== word && moreIpa.has(word)) return;
        const found = firstPhonemicIpa(entry, slashed);
        if (found) moreIpa.set(word, found);
      },
      (line) =>
        !(examples && line.includes('"examples"')) &&
        !(sounds && line.includes('"ipa"')),
    );
  }
  // The names lexicon (rule D): kaikki's proper-name entries that are vocabulary words,
  // inflected forms of them (Argentina, Marina) or given names.
  const namesPack = names.pack(
    (key) => vocabSet.has(key) || Object.hasOwn(lemmas, key),
    (key) => {
      const [capitalised, lower] = cases.counts.get(key) ?? [0, 0];
      return (
        capitalised >= MIN_CAPITALISED &&
        capitalised >= MOSTLY_CAPITALISED * lower
      );
    },
  );
  const ipa: Record<string, string> = {};
  const defs: Record<string, DefsPack[string]> = {};
  const pos: Record<string, string[]> = {};
  for (const word of vocab) {
    const wordIpa = ownIpa(word) ?? moreIpa.get(word);
    if (wordIpa) ipa[word] = wordIpa;
    const bucket = meaningOf(word)!;
    defs[word] = definition(bucket.senses);
    const labels = partsOfSpeech(
      word,
      bucket.pos,
      exact.get(word)?.formPos ?? [],
      treebank,
    );
    if (labels.length > 0) pos[word] = labels;
  }
  // A form that is a vocabulary word ranks only itself: "para", "pero" and "como" would
  // otherwise put parar, perar and comer among the most common words.
  const freq = buildFrequency(
    listed.map((form) => ({ rank: ranks.get(form)!, words: [form] })),
    Object.fromEntries(
      Object.entries(lemmas).filter(([form]) => !vocabSet.has(form)),
    ),
    vocab,
    freqTop,
  );

  // Phrase patterns as English's (rules B1, B2, B2b, B4), with the language's settings:
  // every multi-word entry with a sense of its own whose words are vocabulary words,
  // forms or slots; highlighted by the idiomaticity score over the example corpus of
  // both editions. Each is defined by its senses, best first (rule C2).
  const built = await importPhrases(path, {
    vocab,
    lemmas,
    dict: {},
    language: ENGLISH_PHRASES,
    build: language.phraseBuild(pos, lemmas),
    examples: [path, ...casePaths],
    ...phraseScoring,
  });
  const phrases = language.selectOnlyPhrases
    ? selectOnly(built.phrases)
    : built.phrases;
  for (const { key, evidence } of built.verdicts) {
    const senses = evidence.senses.map(({ pos: label, gloss }): Sense => [
      posLabel(label),
      gloss,
    ]);
    if (senses.length > 0) defs[key] = definition(senses);
  }

  return {
    freq,
    vocab,
    lemmas,
    ipa,
    pos,
    phrases,
    defs,
    names: namesPack,
    stats: {
      ...stats,
      forms: forms.length,
      vocab: vocab.length,
      lemmas: Object.keys(lemmas).length,
      moreForms,
      moreWords,
      ipa: Object.keys(ipa).length,
      pos: Object.keys(pos).length,
      reordered,
      detect: phrases.detect.length,
      more: phrases.more.length,
      terms: Object.keys(defs).length,
      names: Object.keys(namesPack).length,
      capitalisedNames: Object.values(namesPack).filter((kinds) =>
        kinds.includes("c"),
      ).length,
    },
  };
}

/**
 * The patterns with none highlighted: the `detect` ones join `more` (in code-unit
 * order, each with its parts of speech), matched for saved phrases and selections.
 */
export function selectOnly(patterns: PhrasePatterns): PhrasePatterns {
  const { detect, more, pos } = patterns;
  const codes = (list: string | undefined, n: number) =>
    list === undefined ? [] : list.split(" ").slice(0, n);
  const rows = [
    ...detect.map((key, i) => [key, codes(pos?.detect, detect.length)[i]]),
    ...more.map((key, i) => [key, codes(pos?.more, more.length)[i]]),
  ].sort(([a], [b]) => byCodeUnit(a!, b!));
  return {
    ...patterns,
    detect: [],
    more: rows.map(([key]) => key!),
    ...(pos && {
      pos: { detect: "", more: rows.map(([, code]) => code ?? "-").join(" ") },
    }),
  };
}

/**
 * Writes `<lang>/` and the `<lang>-en` dictionary shards with their index under `dir`,
 * removing old shards. The lemma table (every kaikki form of the vocabulary, ~10 MB in
 * Spanish) is sharded in `<lang>/lemmas/` like a dictionary. Returns the paths written,
 * relative to `dir`.
 */
export function writeLearningPacks(
  lang: string,
  { freq, vocab, lemmas, ipa, pos, phrases, defs, names }: LearningPacks,
  dir = PACKS_DIR,
) {
  const pair = `${lang}-en`;
  const index = writeShards(pair, defs, dir);
  rmSync(join(dir, lang, "lemmas.json"), { force: true });
  const lemmaIndex = writeShards(`${lang}/lemmas`, lemmas, dir);
  writePack(`${lang}/freq.json`, freq, dir);
  writePack(`${lang}/vocab.json`, vocab, dir);
  writePack(`${lang}/ipa.json`, ipa, dir);
  writePack(`${lang}/pos.json`, pos, dir);
  writePack(`${lang}/phrases.json`, phrases, dir, { lists: true });
  writePack(`${lang}/names.json`, names, dir);
  return [
    ...["freq", "vocab", "ipa", "pos", "phrases", "names"].map(
      (f) => `${lang}/${f}.json`,
    ),
    ...lemmaIndex.shards.map(({ file }) => `${lang}/lemmas/${file}`),
    `${lang}/lemmas/index.json`,
    ...index.shards.map(({ file }) => `${pair}/${file}`),
    `${pair}/index.json`,
  ];
}

/** The build's summary line, for a pack written to `written`. */
export function buildSummary(
  lang: string,
  { stats }: LearningPacks,
  written: readonly string[],
) {
  const shards = (dir: string) =>
    written.filter((path) => path.startsWith(`${dir}/dict-`)).length;
  return (
    `kaikki-${lang}: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
    `${stats.forms} frequency-list forms → ` +
    `${stats.vocab} vocabulary words, ${stats.lemmas} lemma forms ` +
    `(${stats.moreForms} outside the list, ${stats.moreWords} of them vocabulary words; ` +
    `${stats.reordered} with their bases reordered by the treebanks) in ` +
    `${shards(`${lang}/lemmas`)} shards, ` +
    `${stats.ipa} IPA, ${stats.pos} words with parts of speech, ` +
    `${stats.detect} detected and ${stats.more} more phrase patterns, ` +
    `${stats.names} names (${stats.capitalisedNames} mostly capitalised), ` +
    `${stats.terms} dictionary terms in ${shards(`${lang}-en`)} shards`
  );
}
