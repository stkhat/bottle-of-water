// kaikki.org Spanish Wiktionary extract (CC BY-SA), the Spanish frequency list and the
// UD Spanish treebanks' lemmas → data/packs/es/{freq,vocab,ipa,pos,phrases,names}.json,
// data/packs/es/lemmas/{index,dict-<n>}.json and data/packs/es-en/{index,dict-<n>}.json
// (then run npm run data:publish)
// The Spanish Wiktionary extract (kaikki-es-edition.jsonl) gives only its examples, which
// say how Spanish writes each name (`MOSTLY_CAPITALISED`) and, with kaikki-es's own,
// make the phrase build's example corpus (`importPhrases`, rule B2).
// Usage: node scripts/data/es-kaikki.ts [path]   (default data/raw/kaikki-es.jsonl; run es-frequency.ts first)
import { rmSync } from "node:fs";
import { join } from "node:path";
import { singleIpa } from "../../src/core/lexicon/ipa.ts";
import { shortOfDefinition } from "../../src/core/lexicon/short-lines.ts";
import type { DefsPack } from "../../src/core/packs/types.ts";
import { SPANISH_RULES } from "../../src/core/phrases/es.ts";
import {
  byCodeUnit,
  PACKS_DIR,
  eachEntry,
  posLabel,
  RAW_DIR,
  writeShards,
  writePack,
  type KaikkiEntry,
  type KaikkiSense,
} from "./common.ts";
import { ES_FORMS, frequencyForms, readEsFrequency } from "./es-frequency.ts";
import { treebankLemmas, type LemmaCounts } from "./es-tagger.ts";
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

const KAIKKI_ES_PATH = join(RAW_DIR, "kaikki-es.jsonl");
/** The Spanish Wiktionary extract: its examples only (`MOSTLY_CAPITALISED`, rule B2). */
const KAIKKI_ES_EDITION_PATH = join(RAW_DIR, "kaikki-es-edition.jsonl");
/**
 * A name the examples write capitalised inside a sentence at least this many times as
 * often as in lower case (and at least `MIN_CAPITALISED` times) is marked "c" in the
 * names lexicon: rule D counts it as rare whatever the frequency list says, since the
 * list folds case ("chile" ranks among the 3,000 most common words because of Chile).
 */
const MOSTLY_CAPITALISED = 2;
const MIN_CAPITALISED = 3;
/**
 * Closed classes whose words name no thing, quality or action: a phrase pattern of
 * these only is not detected ("lo que"; `closedClass`).
 */
const GRAMMAR_CLASSES: ReadonlySet<string> = new Set([
  "pronoun",
  "article",
  "determiner",
  "conjunction",
]);
/** The closed classes, prepositions included: function words. */
const CLOSED_CLASSES: ReadonlySet<string> = new Set([
  ...GRAMMAR_CLASSES,
  "preposition",
  "contraction",
]);
/**
 * Senses of a word read for a phrase's gloss bag: its first ones. kaikki-es glosses a
 * function word with every phrase it makes ("de": of, from, about…; "sobre todo" and
 * "ya que" would look explained by their words).
 */
const PHRASE_WORD_SENSES = 3;

/**
 * The phrase build's LEARNING settings for Spanish (`PhraseBuildLanguage`): its words
 * (accented lowercase letters), Wiktionary's slots ("tomar el pelo a alguien"), the
 * auxiliaries whose patterns are not detected (detection matches by base: "estar en"
 * would match every "está en"), and its closed classes from the words' main parts of
 * speech (`pos`; a form outside the vocabulary takes its first base's).
 */
export function spanishPhraseBuild(
  pos: Readonly<Record<string, readonly string[]>>,
  lemmas: Readonly<Record<string, string | readonly string[]>>,
): PhraseBuildLanguage {
  const main = (word: string) => {
    if (Object.hasOwn(pos, word)) return pos[word]![0];
    const base = Object.hasOwn(lemmas, word)
      ? [lemmas[word]!].flat()[0]
      : undefined;
    return base !== undefined && Object.hasOwn(pos, base)
      ? pos[base]![0]
      : undefined;
  };
  return {
    lang: "es",
    slots: new Set(SPANISH_RULES.slots.keys()),
    slotSpellings: new Map(),
    auxiliaries: new Set(["ser", "estar", "haber"]),
    word: /^\p{Ll}+$/u,
    wordSenses: PHRASE_WORD_SENSES,
    functionWordSenses: 1,
    functionWord: (word) =>
      Object.hasOwn(pos, word) && CLOSED_CLASSES.has(pos[word]![0] ?? ""),
    closedClass: (key) =>
      key.split(" ").every((word) => GRAMMAR_CLASSES.has(main(word) ?? "")),
  };
}
const WORD = /^\p{L}+$/u;
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
/** Alt-of senses that stand for a longer term ("ESO", "ONU"). */
const ACRONYM_TAGS: ReadonlySet<string> = new Set(["acronym", "initialism"]);

type Sense = [pos: string, text: string];

function firstPhonemicIpa(entry: KaikkiEntry) {
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa !== "string") continue;
    const ipa = singleIpa(sound.ipa);
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
function pointerBases(entry: KaikkiEntry, alt: boolean) {
  const bases: string[] = [];
  for (const sense of entry.senses ?? []) {
    if ((sense.tags ?? []).some((tag) => IGNORED_FORM_TAGS.has(tag))) continue;
    const words = alt
      ? [altOfTarget(sense) ?? []].flat()
      : pointerTargets(sense.form_of);
    for (const word of words) {
      const base = word.toLowerCase();
      if (WORD.test(base)) bases.push(base);
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
 * target's meaning (`buildEsPacks`).
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
 * contraction) with its translation first, as a content word's is: kaikki-es often
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
      if (target === undefined) return [];
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

export type EsPacks = Awaited<ReturnType<typeof buildEsPacks>>;

/**
 * Builds the Spanish pack from the frequency-list `forms` (lowercase single words in
 * rank order): the vocabulary is every base with a meaning that a form reaches (the
 * form itself, or what its form-of entries point to). Entries spelt exactly like the
 * lowercase word win; entries in another casing (Brasil) are used only when there are
 * none with a meaning.
 */
export async function buildEsPacks(
  path: string,
  forms: string[],
  {
    freqTop = FREQ_TOP,
    treebank = NO_LEMMAS,
    headRank = HEAD_RANK,
    casePaths = [],
    phraseScoring = {},
  }: {
    freqTop?: number;
    /** The treebanks' lemma counts (`treebankLemmas`), which order a form's bases. */
    treebank?: LemmaCounts;
    /** How many of `forms` are in current use (`withoutHeadLabels`). */
    headRank?: number;
    /**
     * More extracts whose Spanish examples say how names are written and make the
     * phrase build's example corpus (`path`'s own examples always count).
     */
    casePaths?: readonly string[];
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
  const cases = createCaseCounter("es");
  const stats = await eachEntry(path, (read) => {
    if (read.lang_code !== "es") return;
    names.add(read);
    cases.add(read);
    const word = read.word.trim();
    const lower = word.toLowerCase();
    const entry = inUse.has(lower) ? withoutHeadLabels(read) : read;
    // Multi-word entries are the phrase build's (`importPhrases`).
    if (/\s/.test(lower) || !WORD.test(lower)) return;
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
      const bases = pointerBases(entry, false);
      bucket.form ||= bases.length > 0;
      if (bases.length > 0 && typeof entry.pos === "string")
        bucket.formPos.add(posLabel(entry.pos));
      bucket.bases.push(...bases);
      bucket.altBases.push(...pointerBases(entry, true));
    }
  });
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
  /** Gives a form its bases among `within`, likeliest first; returns them. */
  const lemmatize = (form: string, within: (base: string) => boolean) => {
    const found = [...new Set(exact.get(form)?.bases ?? [])]
      .filter((base) => base !== form && within(base))
      .sort(byCodeUnit);
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
  for (const form of forms) {
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
  for (const more of casePaths)
    await eachEntry(
      more,
      (entry) => cases.add(entry),
      (line) => !line.includes('"examples"'),
    );
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
    const wordIpa = exact.get(word)?.ipa ?? folded.get(word)?.ipa;
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
    forms.map((form, i) => ({ rank: i + 1, words: [form] })),
    Object.fromEntries(
      Object.entries(lemmas).filter(([form]) => !vocabSet.has(form)),
    ),
    vocab,
    freqTop,
  );

  // Phrase patterns as English's (rules B1, B2, B2b, B4), with the Spanish settings:
  // every multi-word entry with a sense of its own whose words are vocabulary words,
  // forms or slots; highlighted by the idiomaticity score over the example corpus of
  // both editions. Each is defined by its senses, best first (rule C2).
  const built = await importPhrases(path, {
    vocab,
    lemmas,
    dict: {},
    language: ENGLISH_PHRASES,
    build: spanishPhraseBuild(pos, lemmas),
    examples: [path, ...casePaths],
    ...phraseScoring,
  });
  const { phrases } = built;
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
 * Writes es/ and the es-en dictionary shards with their index under `dir`, removing old
 * shards. The lemma table (every kaikki form of the vocabulary, ~10 MB) is sharded in
 * es/lemmas/ like a dictionary. Returns the paths written, relative to `dir`.
 */
export function writeEsPacks(
  { freq, vocab, lemmas, ipa, pos, phrases, defs, names }: EsPacks,
  dir = PACKS_DIR,
) {
  const index = writeShards("es-en", defs, dir);
  rmSync(join(dir, "es", "lemmas.json"), { force: true });
  const lemmaIndex = writeShards("es/lemmas", lemmas, dir);
  writePack("es/freq.json", freq, dir);
  writePack("es/vocab.json", vocab, dir);
  writePack("es/ipa.json", ipa, dir);
  writePack("es/pos.json", pos, dir);
  writePack("es/phrases.json", phrases, dir, { lists: true });
  writePack("es/names.json", names, dir);
  return [
    ...["freq", "vocab", "ipa", "pos", "phrases", "names"].map(
      (f) => `es/${f}.json`,
    ),
    ...lemmaIndex.shards.map(({ file }) => `es/lemmas/${file}`),
    "es/lemmas/index.json",
    ...index.shards.map(({ file }) => `es-en/${file}`),
    "es-en/index.json",
  ];
}

async function main() {
  const forms = frequencyForms(await readEsFrequency(ES_FORMS));
  const packs = await buildEsPacks(process.argv[2] ?? KAIKKI_ES_PATH, forms, {
    treebank: await treebankLemmas(),
    casePaths: [KAIKKI_ES_EDITION_PATH],
  });
  const written = writeEsPacks(packs);
  const { stats } = packs;
  console.log(
    `kaikki-es: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.forms} frequency-list forms (first ${ES_FORMS} entries) → ` +
      `${stats.vocab} vocabulary words, ${stats.lemmas} lemma forms ` +
      `(${stats.moreForms} outside the list, ${stats.moreWords} of them vocabulary words; ` +
      `${stats.reordered} with their ` +
      `bases reordered by the treebanks) in ` +
      `${written.filter((p) => p.startsWith("es/lemmas/dict-")).length} shards, ` +
      `${stats.ipa} IPA, ${stats.pos} words with parts of speech, ` +
      `${stats.detect} detected and ${stats.more} more phrase patterns, ` +
      `${stats.names} names (${stats.capitalisedNames} mostly capitalised), ` +
      `${stats.terms} dictionary terms in ` +
      `${written.filter((p) => p.startsWith("es-en/dict-")).length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
