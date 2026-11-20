// The learning-language pack build shared by every language whose pack comes from
// English Wiktionary's entries of it (kaikki, CC BY-SA): a frequency list's forms, the
// extract's form-of and alt-of senses and a treebank's lemmas →
// data/packs/<lang>/{freq,vocab,ipa,pos,phrases,names}.json,
// data/packs/<lang>/lemmas/{index,dict-<n>}.json and the dictionary into English,
// data/packs/<lang>-en/{index,dict-<n>}.json. CORE: what a language changes is its
// `LearningBuild` (es-kaikki.ts, fr-kaikki.ts).
import { createWriteStream, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { singleIpa } from "../../src/core/lexicon/ipa.ts";
import { splitElisions } from "../../src/core/text/tokenize.ts";
import { shortOfDefinition } from "../../src/core/lexicon/short-lines.ts";
import {
  splitCompound,
  type CompoundRules,
} from "../../src/core/lexicon/compounds.ts";
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
import { slimForms, translationSenses } from "./edition-tables.ts";
import {
  COMPOUND_PART,
  compoundSense,
  createPartGlosses,
} from "./compound-senses.ts";
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
  /**
   * The language capitalises every noun (German "Haus", "Essen"): a headword written
   * with a capital and then lower case is a word like a lowercase one, its form-of
   * senses count ("Häuser": plural of Haus), and a key both spellings share ("essen":
   * essen, to eat; Essen, food) has the senses of both, the lowercase headword's first
   * (`CAPITAL_ROOM`). Spanish and French write such headwords for names only.
   */
  nounsCapitalised?: boolean;
  /**
   * A pronunciation as the language's own edition writes it (`ipaPaths`), in slashes:
   * Wiktionnaire's "\\me.zɔ̃\\" (the default), de.wiktionary's "[haʊ̯s]".
   */
  editionIpa?: (ipa: string) => string;
  /**
   * The language writes a separable verb's particle apart in a main clause ("er fängt
   * morgen an": anfangen): a finite form the verb's entry lists with its particle
   * ("fängt an") is a form of the verb too, after its other bases, which the grammar
   * chooses where the particle stands in the clause (src/core/tagging/de.ts).
   */
  separableVerbs?: boolean;
  /**
   * How the language joins closed compounds (`COMPOUND_RULES`): a name that would read
   * as one joins the names lexicon, so that it does not ("Deutschland").
   */
  compounds?: CompoundRules;
  /**
   * The verbs whose reflexive pronoun is part of the verb, not its object ("s'appeler":
   * to be called; "se passer": to happen; not "se dire", "se voir"): their senses
   * kaikki tags reflexive are labelled "reflexive" (`REFLEXIVE_LABEL`). None when
   * undefined.
   */
  pronominalVerb?: (verb: string) => boolean;
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
/**
 * Senses a key's capitalised headword keeps at least when the lowercase one fills the
 * rest (`LearningBuild.nounsCapitalised`): "sie" (she; they) keeps Sie's "you (polite)".
 */
const CAPITAL_ROOM = 2;

/**
 * The part of speech a verb's sense that is its use as an auxiliary (`auxiliaryUse`) is
 * given ("haben": forms the perfect aspect; "werden": forms the future tense; avoir:
 * used to form the compound tenses; aller: to be going (to)): rule A2 shows it first
 * where the grammar reads the verb as an auxiliary (`AUXILIARY`) and the verb's other
 * senses first where the tag reads it as a verb ("ich habe ein Auto": to have). The
 * word's parts of speech count it as a verb.
 */
const AUXILIARY_LABEL = "auxiliary";

/**
 * The part of speech a pronominal verb's sense (`LearningBuild.pronominalVerb`) that
 * kaikki tags reflexive is given ("s'appeler": to be called; "se passer": to take
 * place, to happen): rule A2 shows it first where the grammar reads the verb as
 * pronominal ("il se passe"), the verb's other senses where it reads a plain verb ("il
 * passe"). The word's parts of speech count it as a verb.
 */
const REFLEXIVE_LABEL = "reflexive";

/**
 * The part of speech a pronominal verb's sense whose reflexive pronoun is a dative
 * (its indirect object, beside a direct one) is given: kaikki's "(transitive, dative
 * reflexive)" senses (German "sich etwas vorstellen": to imagine; "sich etwas
 * leisten": to afford). Rule A2 shows them first where the grammar reads a dative
 * reflexive pronoun ("ich stelle mir … vor"), the REFLEXIVE_LABEL ones where it reads
 * an accusative one ("ich stelle mich vor": to introduce oneself), both where the
 * pronoun's case does not show ("sich").
 */
const DATIVE_REFLEXIVE_LABEL = "dative reflexive";

/** The labels of a verb's senses that are one use of it (`AUXILIARY_LABEL`, `REFLEXIVE_LABEL`). */
const VERB_USES: ReadonlySet<string> = new Set([
  AUXILIARY_LABEL,
  REFLEXIVE_LABEL,
  DATIVE_REFLEXIVE_LABEL,
]);

/**
 * A reflexive sense whose pronoun is a dative beside a direct object (kaikki tags it
 * dative, or its qualifier says "dative reflexive", and transitive): "(transitive,
 * dative reflexive) to imagine". Not one with no direct object ("(dative reflexive,
 * colloquial) to get cracking": "ich mache mir Sorgen" is no use of it).
 */
export function dativeReflexive(sense: KaikkiSense): boolean {
  const tags = sense.tags ?? [];
  const qualifiers = (sense.raw_glosses ?? []).flatMap((gloss) =>
    typeof gloss === "string"
      ? [/^\(([^)]*)\)/u.exec(gloss.trim())?.[1] ?? ""]
      : [],
  );
  const says = (pattern: RegExp) =>
    qualifiers.some((qualifier) => pattern.test(qualifier));
  return (
    (tags.includes("dative") || says(/\bdative reflexive\b/iu)) &&
    (tags.includes("transitive") || says(/(?<!in)transitive\b/iu))
  );
}

/** The parts of speech whose first sense past the cap gains a place (`keptSenses`): function words, adverbs and interjections. */
const PROMOTED: ReadonlySet<string> = new Set([
  ...["pronoun", "article", "determiner", "conjunction", "preposition"],
  ...["contraction", "adverb", "interjection"],
]);

/**
 * Up to `max` of a word's senses, in their order, each part of speech keeping its
 * first: a part whose first sense falls past the cap takes the place of the last sense
 * of a part that has more than one ("sein": the determiner "his" after the verb's
 * senses and the noun), so rule A2 has a sense of each part to show; only a function
 * word's, an adverb's or an interjection's part (`PROMOTED`), and only a sense with a
 * meaning.
 */
export function keptSenses(senses: readonly Sense[], max = MAX_SENSES) {
  const kept = senses.slice(0, max);
  for (const sense of senses.slice(max)) {
    if (kept.some(([pos]) => pos === sense[0])) continue;
    // A function word's, an adverb's or an interjection's meaning: a tag tells those
    // apart reliably ("juste" the adverb: exactly; "que" the pronoun: what; Spanish
    // "Bueno," okay), while a noun, verb or adjective sense past the cap mostly shows
    // where the tagger erred ("En avez-vous" → the noun avoir, "asset"; "c'est
    // gentil" → "pagan"): judged 4 : 22 against, the others 25 : 3 for (L1-5). Only a
    // meaning: a sense that only describes the word's use has none to show (French
    // "de" as an article: "Used in the plural with prepositioned adjectives"; the
    // preposition's "of" reads better there).
    if (!PROMOTED.has(sense[0])) continue;
    if (topLevelParts(sense[1], ";").every(describesGrammar)) continue;
    for (let i = kept.length - 1; i >= 0; i--) {
      const pos = kept[i]![0];
      if (kept.filter(([other]) => other === pos).length < 2) continue;
      kept.splice(i, 1);
      kept.push(sense);
      break;
    }
  }
  return kept;
}

/**
 * How many times as often as in lower case the examples must write a key capitalised
 * inside a sentence for its capitalised headword's senses to come first
 * (`capitalFirst`).
 */
const CAPITAL_FIRST = 3;

/** A word written with a capital, then lower case ("Haus"; not "USA", "McDonald"). */
const capitalisedSpelling = (word: string, lower: string) =>
  word !== lower && word === lower.charAt(0).toUpperCase() + lower.slice(1);
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

/**
 * A sense: its part of speech and text, and "capital" for one of a capitalised headword
 * the key shares with a lowercase one (`LearningBuild.nounsCapitalised`: Sie's "you
 * (polite)" under "sie"), so the hover shows it first where the page writes the word
 * capitalised inside a sentence, and the card writes the headword so.
 */
type Sense = [pos: string, text: string, use?: SenseUse];

/**
 * A sense's third item: CAPITAL_USE, or a personal pronoun's number ("singular",
 * "plural": `pronounNumber`).
 */
type SenseUse = typeof CAPITAL_USE | "singular" | "plural";

/** The gender tags kaikki gives a third-person pronoun's sense ("sie": feminine, she). */
const GENDERS: readonly string[] = ["feminine", "masculine", "neuter"];

/**
 * A personal pronoun's sense's number, from kaikki's tags: "plural" ("sie": they;
 * them), "singular" or a gender, which only the singular has ("sie": she; her);
 * undefined for one tagged neither or both (the polite "Sie", either).
 */
export function pronounNumber(
  sense: KaikkiSense,
): "singular" | "plural" | undefined {
  const tags = sense.tags ?? [];
  const plural = tags.includes("plural");
  const singular =
    tags.includes("singular") || GENDERS.some((tag) => tags.includes(tag));
  return plural === singular ? undefined : plural ? "plural" : "singular";
}

/** The third item of a capitalised headword's sense (`Sense`). */
const CAPITAL_USE = "capital";

/**
 * A key a lowercase headword shares marks its capitalised headword's senses
 * (`CAPITAL_USE`) when the examples write it capitalised inside a sentence at least
 * once for this many times in lower case (and `MIN_CAPITALISED` times at least): a
 * capital there then marks that headword ("Sie": 1 in 8, "Ihr" 1 in 23, "Reich" more
 * often than "reich"), not a word that only starts an utterance or a title ("Ja" 1 in
 * 81, "Aber" 1 in 900, "Heute", "So"), whose capitalised headword ("a yes", "a but")
 * a capital at the wrong place would put first.
 */
const CAPITAL_MARKED = 40;

/** `senses` with each part of speech and text once, the first of each kept. */
const onceEach = (senses: readonly Sense[]) =>
  senses.filter(
    (sense, i) =>
      senses.findIndex(
        (other) => other[0] === sense[0] && other[1] === sense[1],
      ) === i,
  );

/**
 * A qualifier's part saying the verb comes right before an infinitive, a gerund or a
 * participle, as an auxiliary does ("when followed by an infinitive verb": aller's
 * "to be going (to)"; "preceding the gerund of a verb": ir's "to go on"); not a verb
 * whose infinitive a preposition introduces ("followed by à and infinitive": réussir's
 * "to manage to do something", a verb with its complement).
 */
const AUXILIARY_CONSTRUCTION =
  /^(?:when )?(?:followed by|preceding)\s+(?:(?:an?|the)\s+)?(?:bare\s+)?(?:infinitive|gerund|participle)\b/i;
/** Qualifier parts that leave a sense the construction's alone. */
const TRANSITIVITY = /^(?:in)?transitive$/i;

/**
 * A raw gloss's leading qualifier names only the auxiliary's construction
 * (`AUXILIARY_CONSTRUCTION`), with or without a transitivity: not one that asks for
 * another use too ("(reflexive, followed by an infinitive) to get": se faire, not the
 * causative "faire construire").
 */
function auxiliaryQualifier(gloss: string): boolean {
  const qualifier = /^\(([^)]*)\)/u.exec(gloss.trim())?.[1];
  if (qualifier === undefined) return false;
  const parts = qualifier.split(",").map((part) => part.trim());
  return (
    parts.some((part) => AUXILIARY_CONSTRUCTION.test(part)) &&
    parts.every(
      (part) => AUXILIARY_CONSTRUCTION.test(part) || TRANSITIVITY.test(part),
    )
  );
}

/**
 * The sense is the verb's use as an auxiliary: kaikki tags it so (avoir "used to form
 * the compound tenses", haber, estar before a gerund, ir "to be going to"), or its
 * qualifier names the construction (`auxiliaryQualifier`). Rule A2 shows these first
 * where the grammar reads the word as an auxiliary (AUXILIARY_LABEL).
 */
export function auxiliaryUse(sense: KaikkiSense): boolean {
  return (
    (sense.tags ?? []).includes("auxiliary") ||
    (sense.raw_glosses ?? []).some(
      (gloss) => typeof gloss === "string" && auxiliaryQualifier(gloss),
    )
  );
}

/** A key's headwords of one spelling: one has a meaning; their form-of senses' bases. */
interface Spelling {
  meaning: boolean;
  bases: string[];
}

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
 * sense with no meaning (obsolete, archaic, misspelt), nor a contraction of words. kaikki splits a gloss at its
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
  // A contraction of words stands for more than the word it names first ("ins":
  // contraction of in (“(in)to”) + das); a contraction of one word is that word cut
  // short (French "info": contraction of information; "p'tit": of petit).
  if (tags.includes("contraction") && /\s\+\s/u.test(gloss)) return undefined;
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
 * (“the”)" → "the; masculine plural of el", also with a note after it in the bracket:
 * "plural of un (“some”, the plural indefinite article)" → "some; plural of un (the
 * plural indefinite article)". Undefined without one.
 */
export function quotedMeaning(gloss: string): string | undefined {
  const quoted =
    /^(.*?\bof\s+[^\s,;:()]+)\s*\(“([^”]+)”(?:\s*,\s*([^()]+))?\)\s*$/u.exec(
      gloss,
    );
  if (!quoted) return undefined;
  const note = quoted[3]?.trim();
  return `${quoted[2]!.trim()}; ${quoted[1]!.trim()}${note ? ` (${note})` : ""}`;
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
  const parts = literal ? undefined : partsMeaning(gloss);
  if (parts !== undefined) return parts;
  const quoted = literal
    ? undefined
    : /\s*\(\s*(['‘“][^)]*['’”])\s*\)\s*$/u.exec(gloss);
  const found = literal ?? quoted;
  if (!found) return pointerMeaning(gloss);
  const meaning = found[1]!.replace(/['‘’“”]/gu, "").trim();
  const pointer = (
    gloss.slice(0, found.index) + gloss.slice(found.index + found[0].length)
  ).trim();
  return meaning ? `${meaning}; ${pointer}` : undefined;
}

/**
 * A contraction's meaning from its parts' quoted glosses, each part having one:
 * "contraction of an (“on(to)”) + das (“the”)" → "on(to) the; contraction of an + das";
 * "dem (“the”, masculine/neuter dative singular)" counts as "the".
 */
function partsMeaning(gloss: string): string | undefined {
  const of = /^(.*?\bof\s+)(.+)$/su.exec(gloss);
  if (!of) return undefined;
  const parts = of[2]!
    .split(/\s+\+\s+/u)
    .map((part) => /^([^\s(]+)\s*\(“([^”]+)”[^)]*\)/u.exec(part.trim()));
  if (parts.length < 2 || parts.some((part) => !part)) return undefined;
  const meaning = parts.map((part) => part![2]!.trim()).join(" ");
  return `${meaning}; ${of[1]!}${parts.map((part) => part![1]!).join(" + ")}`;
}

/**
 * A part of a closed-class gloss that describes the word's grammar rather than
 * translating it: it names a part of speech ("feminine plural definite article",
 * "first-person singular pronoun in the nominative case").
 */
const GRAMMAR_NAME =
  /\b(?:article|pronoun|determiner|preposition|conjunction|contraction)s?\b/i;

/** A usage note where a translation would be: "Used as the object of a verb to …". */
const USAGE_NOTE = /^used\b/i;

/**
 * A gloss part describes the word's grammar or use rather than translating it: its
 * first sentence names a part of speech (`GRAMMAR_NAME`) or is a usage note
 * (`USAGE_NOTE`); "of it, of them. Replaces the partitive article" translates.
 */
const describesGrammar = (part: string) => {
  const sentence = part.split(/(?<=\.)\s+(?=\p{Lu})/u)[0]!;
  return GRAMMAR_NAME.test(sentence) || USAGE_NOTE.test(sentence);
};

/** A description ending in a part of speech's name, a comma, then the rest. */
const DESCRIBED =
  /^([^,()]*\b(?:article|pronoun|determiner|preposition|conjunction|contraction)s?)\s*,\s*([^,]+)$/i;

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
 * at ":" or a last "," ("nominative masculine singular definite article, the" → "the;
 * nominative masculine singular definite article"); a description names a part of
 * speech or is a usage note (`describesGrammar`: "Used as the object of a verb to
 * indicate an indefinite quantity; of it, of them" → "of it, of them; Used as …").
 * Unchanged when it already starts with a translation or gives none ("plural
 * masculine or neuter pronoun").
 */
export function translationFirst(gloss: string): string {
  const parts = topLevelParts(gloss, ";").flatMap((part) => {
    const [head, ...rest] = topLevelParts(part, ":");
    if (rest.length > 0 && describesGrammar(head!))
      return [head!, rest.join(": ")];
    // A description that names the part of speech, then a comma and the translation:
    // "nominative masculine singular definite article, the".
    const named = DESCRIBED.exec(part);
    return named ? [named[1]!, named[2]!] : [part];
  });
  if (!describesGrammar(parts[0] ?? "") || parts.every(describesGrammar))
    return gloss;
  return [
    ...parts.filter((part) => !describesGrammar(part)),
    ...parts.filter(describesGrammar),
  ].join("; ");
}

/** A fixed expression counts once the treebanks have it this often as one … */
const FIXED_MIN_COUNT = 5;
/** … at least as often as not where its words stand in a row (annotations differ between treebanks). */
const FIXED_MIN_SHARE = 0.5;

/** The treebanks write these words as one fixed expression often enough (`PhraseBuildLanguage.fixed`). */
const fixedExpression = (count?: { fixed: number; all: number }) =>
  count !== undefined &&
  count.fixed >= FIXED_MIN_COUNT &&
  count.fixed / count.all >= FIXED_MIN_SHARE;

/** Most words a translation's first item has; a gloss of more describes (as `describes` in short-lines.ts). */
const TRANSLATION_WORDS = 3;

/** A gloss's first item (up to a comma or semicolon) outside brackets, without ellipses ("not ... any more"). */
const firstItem = (gloss: string) =>
  gloss
    .replace(/\([^()]*\)|\[[^[\]]*\]/gu, " ")
    .split(/[,;]/u)[0]!
    .replace(/\.\.\.|…/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);

/** A subsense that only heads its parent's group: kaikki's "general senses". */
const GROUP_HEADING = /^general senses?$/iu;

/** A gloss's items, split at commas and semicolons outside brackets, in lower case. */
const itemsOf = (gloss: string) =>
  gloss
    .replace(/\([^()]*\)/gu, " ")
    .split(/[,;]/u)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/**
 * The parent glosses of an entry's nested senses whose meaning should come first
 * (kaikki lists a subsense's parent gloss before its own: "blow, hit, strike" → "sound
 * of the action"): a parent that translates (its first item of at most
 * TRANSLATION_WORDS words; not the word itself, nor one that introduces its
 * subsenses: "a chamber in its various senses, including:") with a subsense that
 * describes (its first item longer) or only heads the group (`GROUP_HEADING`), and
 * none that says it again ("to give back" → "to return, to restore, to give back").
 * A subsense that translates keeps its place ("introduces a comparison" → "than";
 * "to retain, hold" → "to hold back, rein in": judged better than the parent first,
 * L1-5). `own`: the glosses the entry gives as senses of their own.
 */
function leadingParents(
  word: string,
  senses: readonly KaikkiSense[],
  own: ReadonlySet<string>,
): Set<string> {
  const subs = new Map<string, string[]>();
  for (const sense of senses) {
    if (!isUsable(sense) || sense.glosses.length < 2) continue;
    const [parent] = sense.glosses;
    if (typeof parent !== "string") continue;
    const list = subs.get(parent.trim()) ?? [];
    list.push(glossOf(sense).trim());
    subs.set(parent.trim(), list);
  }
  const leading = new Set<string>();
  for (const [parent, glosses] of subs) {
    const words = firstItem(parent).length;
    if (
      own.has(parent) ||
      parent.toLowerCase() === word.toLowerCase() ||
      /(?::|\bincluding|\bespecially)\s*$/iu.test(parent) ||
      words === 0 ||
      words > TRANSLATION_WORDS
    )
      continue;
    const said = parent.toLowerCase();
    if (glosses.some((gloss) => itemsOf(gloss).includes(said))) continue;
    if (
      glosses.some(
        (gloss) =>
          GROUP_HEADING.test(gloss) ||
          firstItem(gloss).length > TRANSLATION_WORDS,
      )
    )
      leading.add(parent);
  }
  return leading;
}

/**
 * One sense with a meaning: its part of speech and text; for an alt-of sense that
 * counts (`altOfTarget`), its target, and whether the text is only the pointer.
 */
interface SenseItem {
  def: Sense;
  sense: KaikkiSense;
  alt?: { target: string; pointerOnly: boolean };
  /** From a capitalised headword the key shares (`LearningBuild.nounsCapitalised`). */
  capital?: true;
}

/** The parts of speech whose senses in mathematics are an operator's (`usableSenses`). */
const OPERATOR_POS: ReadonlySet<string> = new Set([
  "adverb",
  "conjunction",
  "preposition",
]);

/**
 * An entry's senses with a meaning, in the source's order (an operator's last): a usable sense's gloss; a
 * form-of sense's meaning after its pointer ("me": "accusative of yo: me"; the clitic
 * pronouns, possessives and demonstratives have no other); an alt-of sense's
 * `altMeaning`, else its pointer. Proper-noun entries (Brasil, Carlos, Acapulco) give
 * none, so a word with only those is not a vocabulary word; a word with other entries
 * keeps their senses.
 */
function usableSenses(
  entry: KaikkiEntry,
  pronominalVerb: (verb: string) => boolean = () => false,
): SenseItem[] {
  if (entry.pos === "name") return [];
  const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
  const pronominal = pos === "verb" && pronominalVerb(entry.word ?? "");
  const closed = CLOSED_CLASSES.has(pos);
  const translated = (gloss: string) =>
    closed ? translationFirst(gloss) : gloss;
  // The glosses the entry's senses give as their own: a parent sense listed alone too
  // is not repeated before its subsenses (devoir's "must, to have to, should").
  const own = new Set(
    (entry.senses ?? []).filter(isUsable).map((sense) => glossOf(sense).trim()),
  );
  const leading = leadingParents(entry.word ?? "", entry.senses ?? [], own);
  const parents = new Set<string>();
  // An operator's sense (a function word's or an adverb's sense in mathematics: "mal",
  // times; "plus") comes after the word's other senses: it needs numbers around it,
  // which "noch mal" and "guck mal" have not.
  const operator = (sense: KaikkiSense) =>
    OPERATOR_POS.has(pos) && (sense.topics ?? []).includes("mathematics");
  const senses = [
    ...(entry.senses ?? []).filter((sense) => !operator(sense)),
    ...(entry.senses ?? []).filter(operator),
  ];
  return senses.flatMap((sense): SenseItem[] => {
    if (isUsable(sense)) {
      // An auxiliary's first gloss is what it does ("used to form compound tenses");
      // the ones under it list where (être: "the passive voice", "all reflexive verbs").
      if (pos === "verb" && auxiliaryUse(sense)) {
        const [first] = sense.glosses;
        const gloss = (
          typeof first === "string" ? first : glossOf(sense)
        ).trim();
        return [{ def: [AUXILIARY_LABEL, gloss], sense }];
      }
      const gloss = glossOf(sense).trim();
      if (pronominal && (sense.tags ?? []).includes("reflexive"))
        return [
          {
            def: [
              dativeReflexive(sense) ? DATIVE_REFLEXIVE_LABEL : REFLEXIVE_LABEL,
              gloss,
            ],
            sense,
          },
        ];
      const [first] = sense.glosses;
      const parent =
        typeof first === "string" && leading.has(first.trim())
          ? first.trim()
          : undefined;
      // A personal pronoun's sense carries its number, which the grammar may read
      // from its verb ("sie sind": they).
      const number = pos === "pronoun" ? pronounNumber(sense) : undefined;
      if (number !== undefined)
        return [{ def: [pos, translated(gloss), number], sense }];
      // The parent's meaning before its group's first subsense, once; a heading
      // subsense gives way to it.
      const before: SenseItem[] =
        parent !== undefined && !parents.has(parent)
          ? [{ def: [pos, translated(parent)], sense }]
          : [];
      if (parent !== undefined) parents.add(parent);
      if (parent !== undefined && GROUP_HEADING.test(gloss)) return before;
      return [...before, { def: [pos, translated(gloss)], sense }];
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

/**
 * A term's senses as the pack keeps them: each once (être's auxiliary senses differ
 * only in what kaikki lists under them), the first MAX_SENSES, and an auxiliary's or
 * a pronominal verb's senses (`VERB_USES`) after them wherever the source lists them
 * (ir: "to be going to" is its eleventh; passer: "to take place, to happen" its
 * thirtieth), since they are what the word means where the grammar reads that use.
 */
function definition(senses: Sense[]): DefsPack[string] {
  const once = onceEach(senses);
  const kept = [
    ...once.slice(0, MAX_SENSES),
    ...once.slice(MAX_SENSES).filter(([pos]) => VERB_USES.has(pos)),
  ];
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
    fixed,
    headRank = HEAD_RANK,
    casePaths = [],
    ipaPaths = [],
    phraseScoring = {},
    ownEditionExamples = true,
    written,
    tablesPath,
    nativeWord = () => false,
  }: {
    freqTop?: number;
    /** The treebanks' lemma counts (`treebankLemmas`), which order a form's bases. */
    treebank?: LemmaCounts;
    /**
     * The treebanks' fixed expressions with how often they are written as one of how
     * often their words stand in a row (`fixedExpressions`), for the phrase score.
     */
    fixed?: ReadonlyMap<string, { fixed: number; all: number }>;
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
    /**
     * Whether `casePaths`' examples join the phrase build's example corpus (Spanish:
     * yes; French: no, judged, as its score's count terms were tuned on fewer examples;
     * they still attest multi-word nouns, B1's size cap).
     */
    ownEditionExamples?: boolean;
    /**
     * The frequency list's forms as written, case kept, in rank order, for a language
     * that capitalises its nouns: a form ranks the bases of the headword spelt as it
     * is ("Reisen" ranks Reise, "reisen" itself; `rankedBases`).
     */
    written?: readonly string[];
    /**
     * The language's own edition cut to its names, form-of senses and tables
     * (`slimTables`): the second source of the words and forms `path` lacks
     * (`editionWords`).
     */
    tablesPath?: string;
    /**
     * Whether a key is a word or a name of the dictionary's language (English: its
     * pack's vocabulary, inflected forms and names), which the second source
     * (`tablesPath`) leaves out: what the subtitles' frequency list ranks high among
     * the words English Wiktionary lacks is the subtitles' English ("hey", "sir",
     * "daddy", "crew") and persons' names (Ken, Mac, Sharon, Bobby), which an English
     * speaker needs no translation of; a loanword spelt as in English ("Smartphone",
     * "Gossip") neither.
     */
    nativeWord?: (key: string) => boolean;
  } = {},
) {
  /** The frequency list's forms in current use (`withoutHeadLabels`). */
  const inUse = new Set(forms.slice(0, headRank));
  interface Bucket {
    /** Its senses with a meaning, in the source's order (`usableSenses`). */
    items: Omit<SenseItem, "sense">[];
    /** Its senses, which the pack keeps the first of (`definition`). */
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
  /**
   * How the examples write each word inside a sentence (`capitalFirst`), read before
   * the senses are ordered: a language that capitalises its nouns only.
   */
  const inside = language.nounsCapitalised
    ? createCaseCounter(lang)
    : undefined;
  /** The entries of each headword written with an apostrophe (`ownWord`). */
  const apostrophes = new Map<string, KaikkiEntry[]>();
  /**
   * Each key's headwords by spelling, lowercase and capitalised (German): whether one
   * has a meaning and what its form-of senses point to (`rankedBases`).
   */
  const spellings = {
    lower: new Map<string, Spelling>(),
    capital: new Map<string, Spelling>(),
  };
  /** Whether a verb's first sense is reflexive, by its first verb entry. */
  const reflexiveFirst = new Map<string, boolean>();
  /** A separable verb's finite forms written apart: "fängt" → anfangen, … */
  const separated = new Map<string, Set<string>>();
  /** How compounds' etymologies gloss their parts (`compoundSense`). */
  const partGlosses = createPartGlosses();
  /** The keys of proper-noun headwords (Hans, Berlin), which the second source leaves out. */
  const proper = new Set<string>();
  const bucketOf = (buckets: Map<string, Bucket>, key: string) => {
    let bucket = buckets.get(key);
    if (!bucket)
      buckets.set(
        key,
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
    return bucket;
  };
  const stats = await eachEntry(path, (read) => {
    if (read.lang_code !== lang) return;
    names.add(read);
    if (read.pos === "name") proper.add(read.word.trim().toLowerCase());
    if (language.compounds) partGlosses.add(read);
    cases.add(read);
    inside?.add(read);
    const word = read.word.trim().replaceAll("’", "'");
    const lower = word.toLowerCase();
    const entry = inUse.has(lower) ? withoutHeadLabels(read) : read;
    // Multi-word entries are the phrase build's (`importPhrases`).
    if (/\s/.test(lower) || !WORD.test(lower)) return;
    if (language.separableVerbs && entry.pos === "verb" && word === lower)
      for (const { form } of entry.forms ?? []) {
        const written = typeof form === "string" ? form.trim() : "";
        const [stem, particle, ...more] = written.split(/\s+/);
        if (
          more.length > 0 ||
          !stem ||
          !particle ||
          !WORD.test(stem) ||
          !lower.startsWith(particle) ||
          lower === particle
        )
          continue;
        const verbs = separated.get(stem) ?? new Set<string>();
        verbs.add(lower);
        separated.set(stem, verbs);
      }
    if (/['-]/.test(lower) && language.ownWord) {
      const found = apostrophes.get(lower);
      if (found) found.push(entry);
      else apostrophes.set(lower, [entry]);
    }
    // A verb whose first sense (its first verb entry's) is reflexive keeps its
    // order wherever it is read: the label would put that sense back where the
    // grammar reads no reflexive pronoun (German treffen "to meet", duschen).
    if (entry.pos === "verb" && !reflexiveFirst.has(lower))
      reflexiveFirst.set(
        lower,
        ((entry.senses ?? []).find(isUsable)?.tags ?? []).includes("reflexive"),
      );
    const items = usableSenses(
      entry,
      reflexiveFirst.get(lower) === true ? undefined : language.pronominalVerb,
    );
    const capital =
      language.nounsCapitalised === true && capitalisedSpelling(word, lower);
    // A capitalised word of a language that capitalises nouns is spelt as one.
    const spelt = word === lower || capital;
    const bucket = bucketOf(spelt ? exact : folded, lower);
    for (const { def, alt } of items)
      bucket.items.push({
        def,
        ...(alt && { alt }),
        ...(capital && { capital: true as const }),
      });
    bucket.ipa ??= firstPhonemicIpa(entry);
    if (spelt) {
      const bases = pointerBases(entry, false, WORD);
      if (language.nounsCapitalised) {
        const byCase = capital ? spellings.capital : spellings.lower;
        const found = byCase.get(lower) ?? { meaning: false, bases: [] };
        found.meaning ||= items.length > 0;
        found.bases.push(...bases);
        byCase.set(lower, found);
      }
      bucket.form ||= bases.length > 0;
      if (bases.length > 0 && typeof entry.pos === "string")
        bucket.formPos.add(posLabel(entry.pos));
      bucket.bases.push(...bases);
      bucket.altBases.push(...pointerBases(entry, true, WORD));
    }
  });
  const edition = tablesPath
    ? await editionWords(tablesPath)
    : { words: 0, forms: 0 };
  /**
   * The second source (`tablesPath`, the language's own edition): a key `path` gives
   * no meaning, no base and no proper noun (in either edition) takes the edition's
   * senses from its English translations (`translationSenses`), and its form-of
   * entries' and inflection tables' forms as its forms ("Kommissarin": police
   * commissioner; "Rucola"; "läuft", which English Wiktionary points to "laufen 'to
   * run'"). A word English Wiktionary has keeps everything it gives, and gains only
   * forms it lacks. Names stay out: given names and surnames that are words too
   * (Bobby, Vanessa) are proper nouns in one of the editions.
   */
  async function editionWords(tables: string) {
    /** The parts of speech the second source reads: words, not affixes, phrases or abbreviations. */
    const EDITION_POS: ReadonlySet<string> = new Set([
      ...["noun", "verb", "adj", "adv", "intj", "num"],
      ...["pron", "det", "conj", "prep", "postp", "particle"],
    ]);
    await eachEntry(
      tables,
      (entry) => {
        if (entry.lang_code === lang && entry.pos === "name")
          proper.add(entry.word.trim().toLowerCase());
      },
      (line) => !line.includes('"pos":"name"'),
    );
    // What `path` gives, before the edition adds to it.
    const given = new Set(
      [...exact, ...folded]
        .filter(([, b]) => b.items.length > 0 || b.bases.length > 0)
        .map(([key]) => key),
    );
    const open = (key: string) =>
      !given.has(key) && !proper.has(key) && !nativeWord(key);
    const counts = { words: 0, forms: 0 };
    const addBase = (form: string, base: string, label: string) => {
      if (form === base || !WORD.test(form) || !open(form)) return;
      const bucket = bucketOf(exact, form);
      if (bucket.bases.includes(base)) return;
      if (bucket.bases.length === 0) counts.forms++;
      bucket.form = true;
      bucket.bases.push(base);
      bucket.formPos.add(label);
    };
    await eachEntry(tables, (entry) => {
      if (entry.lang_code !== lang || !EDITION_POS.has(entry.pos ?? "")) return;
      const word = entry.word.trim().replaceAll("’", "'");
      const key = word.toLowerCase();
      // A headword written as a word: in lower case, or capitalised where the
      // language capitalises nouns; an initialism's key ("ELN", "TeX", "IT") is
      // another word's, which text writes in lower case ("Elngeld", "it").
      const spelt =
        word === key ||
        (language.nounsCapitalised === true && capitalisedSpelling(word, key));
      if (!spelt || /\s/.test(key) || !WORD.test(key) || proper.has(key))
        return;
      const label = posLabel(entry.pos!);
      for (const base of pointerBases(entry, false, WORD))
        addBase(key, base, label);
      for (const form of slimForms(entry)) addBase(form, key, label);
      const senses = open(key) ? translationSenses(entry) : [];
      if (senses.length === 0) return;
      const bucket = bucketOf(exact, key);
      if (bucket.items.length === 0) counts.words++;
      const capital =
        language.nounsCapitalised === true && capitalisedSpelling(word, key);
      for (const def of senses)
        bucket.items.push({ def, ...(capital && { capital: true as const }) });
    });
    return counts;
  }
  // A headword with an apostrophe or a hyphen that is no word of its own ("qu'il": que
  // + il), or that text reads in parts ("j'aime", "est-il"), is left to its parts,
  // which the tokenizer splits it into.
  for (const [word, entries] of apostrophes)
    if (
      (splitElisions(word, lang).length > 1 || word.includes("-")) &&
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
  // form: "os" is a form of vosotros, not "alternative form of ox". An inflected form's
  // alt-of sense still counts, without its target as a base, when the target is
  // more frequent than every word its form-of senses point to: German "mal" is
  // einmal's informal form ("once, sometime", the "mal" of "noch mal", "guck mal")
  // more than malen's imperative.
  const rankOf = (word: string) => ranks.get(word) ?? Infinity;
  const likelierAlt = (word: string, target: string | undefined) => {
    if (target === undefined) return false;
    const bases = exact.get(word)?.bases ?? [];
    return (
      bases.length > 0 &&
      bases.every((base) => rankOf(target.toLowerCase()) < rankOf(base))
    );
  };
  if (inside)
    for (const more of casePaths)
      await eachEntry(
        more,
        (entry) => inside.add(entry),
        (line) => !line.includes('"examples"'),
      );
  /**
   * The examples write the key capitalised inside a sentence CAPITAL_FIRST times as
   * often as in lower case or more (MIN_CAPITALISED times at least): its capitalised
   * headword is the word most text means ("Mensch", a human being, not the pronoun
   * "mensch"; "Laden", a shop, not "laden", to load). Inside a sentence, where a
   * capital marks a noun, not an utterance's start ("Nein", "Hallo").
   */
  const capitalFirst = (key: string) => {
    const [capitalised, lower] = inside?.counts.get(key) ?? [0, 0];
    return (
      capitalised >= MIN_CAPITALISED && capitalised >= CAPITAL_FIRST * lower
    );
  };
  /** The examples' capitals mark the key's capitalised headword (`CAPITAL_MARKED`). */
  const capitalMarked = (key: string) => {
    const [capitalised, lower] = inside?.counts.get(key) ?? [0, 0];
    return (
      capitalised >= MIN_CAPITALISED && capitalised * CAPITAL_MARKED >= lower
    );
  };
  // A key's capitalised headwords' senses come after its lowercase ones' (before them
  // when `capitalFirst`), with room for CAPITAL_ROOM of the second; each part of
  // speech keeps its first sense (`keptSenses`).
  for (const [word, bucket] of [...exact, ...folded]) {
    const form = exact.get(word)?.form ?? false;
    const items = bucket.items.filter(
      ({ alt }) => !(alt && form) || likelierAlt(word, alt.target),
    );
    // A rescued alt-of sense of a part of speech the word has no other sense of comes
    // last: "los" is "rid of", "going on" before lose's "loose".
    const rescued = (item: (typeof items)[number]) =>
      item.alt !== undefined && form;
    const ownPos = new Set(
      items.filter((item) => !rescued(item)).map(({ def }) => def[0]),
    );
    const late = (item: (typeof items)[number]) =>
      rescued(item) && !ownPos.has(item.def[0]);
    const counted = [
      ...items.filter((item) => !late(item)),
      ...items.filter(late),
    ];
    const marked = counted.every((item) => item.capital) || capitalMarked(word);
    const senseOf = ({
      def,
      alt,
      capital,
    }: Omit<SenseItem, "sense">): Sense => {
      const [pos, text] = alt?.pointerOnly
        ? targetMeaning(def, alt.target)
        : def;
      if (capital && marked) return [pos, text, CAPITAL_USE];
      return def[2] !== undefined && !alt ? [pos, text, def[2]] : [pos, text];
    };
    for (const { def } of counted)
      if (def[0]) bucket.pos.add(VERB_USES.has(def[0]) ? "verb" : def[0]);
    const lower = onceEach(
      counted.filter((item) => !item.capital).map(senseOf),
    );
    const capital = onceEach(
      counted.filter((item) => item.capital).map(senseOf),
    );
    const [first, second] = capitalFirst(word)
      ? [capital, lower]
      : [lower, capital];
    const room = Math.min(CAPITAL_ROOM, second.length);
    const kept = keptSenses([
      ...keptSenses(first, MAX_SENSES - room),
      ...second,
    ]);
    // An auxiliary's and a pronominal verb's senses past the cap come after the
    // others (`definition`).
    const shown = new Set(kept.map(([pos, text]) => `${pos}\n${text}`));
    bucket.senses.push(
      ...kept,
      ...[...first, ...second].filter(
        ([pos, text]) => VERB_USES.has(pos) && !shown.has(`${pos}\n${text}`),
      ),
    );
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
        const found = firstPhonemicIpa(entry, language.editionIpa ?? slashed);
        if (found) moreIpa.set(word, found);
      },
      (line) =>
        !(examples && line.includes('"examples"')) &&
        !(sounds && line.includes('"ipa"')),
    );
  }
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
  // A word's sense as a compound's part, where its compounds use another than its
  // first (`compoundSense`): under its key and COMPOUND_PART ("bahn-": railway).
  let partSenses = 0;
  if (language.compounds)
    for (const word of vocab) {
      const [, senses] = defs[word]!;
      const chosen = compoundSense(senses, (capital) =>
        partGlosses.of(word, capital),
      );
      if (chosen === undefined) continue;
      const [label, text] = senses[chosen]!;
      defs[`${word}${COMPOUND_PART}`] = definition([[label, text]]);
      partSenses++;
    }
  /**
   * A name that would read as a closed compound of the language's words (German
   * "Deutschland": deutsch + Land, "Frankreich", "Lehmann", "Wolfenstein"): the names
   * lexicon keeps it so that it does not (`LanguagePack.compound`).
   */
  const compoundRules = language.compounds;
  const compoundName = (key: string) =>
    compoundRules !== undefined &&
    splitCompound(
      key,
      {
        lemmas: (word) => [
          ...(vocabSet.has(word) ? [word] : []),
          ...[lemmas[word] ?? []].flat(),
        ],
        partsOfSpeech: (word) => pos[word] ?? [],
      },
      compoundRules,
      true,
    ) !== undefined;
  // The names lexicon (rule D): kaikki's proper-name entries that are vocabulary words,
  // inflected forms of them (Argentina, Marina), given names, or names that would read
  // as compounds.
  const namesPack = names.pack(
    (key) =>
      vocabSet.has(key) || Object.hasOwn(lemmas, key) || compoundName(key),
    (key) => {
      const [capitalised, lower] = cases.counts.get(key) ?? [0, 0];
      return (
        capitalised >= MIN_CAPITALISED &&
        capitalised >= MOSTLY_CAPITALISED * lower
      );
    },
  );
  // A form that is a vocabulary word ranks only itself: "para", "pero" and "como" would
  // otherwise put parar, perar and comer among the most common words.
  /**
   * The bases a written form of the list ranks (`written`): those of the headword spelt
   * as it is, capitalised ("Reisen": Reise) or lowercase ("reisen": itself), a
   * headword with a meaning only itself, as a listed form does; a form of a form, its
   * base's bases. A capital no headword is spelt with (a sentence's first word) is the
   * lowercase word's; a spelling with no bases, every base of its key.
   */
  const rankedBases = (form: string): string[] => {
    const key = form.toLowerCase().replaceAll("’", "'");
    const found =
      (capitalisedSpelling(form, key)
        ? spellings.capital.get(key)
        : undefined) ?? spellings.lower.get(key);
    const all = vocabSet.has(key) ? [key] : [lemmas[key] ?? []].flat();
    if (!found) return all;
    if (found.meaning && vocabSet.has(key)) return [key];
    const bases = [
      ...new Set(
        found.bases.flatMap((base) =>
          vocabSet.has(base) ? [base] : [lemmas[base] ?? []].flat(),
        ),
      ),
    ].filter((base) => vocabSet.has(base));
    return bases.length > 0
      ? byTreebank(form.toLowerCase(), bases, treebank)
      : all;
  };
  const freq = buildFrequency(
    written
      ? written.map((form, i) => ({ rank: i + 1, words: rankedBases(form) }))
      : listed.map((form) => ({ rank: ranks.get(form)!, words: [form] })),
    Object.fromEntries(
      Object.entries(lemmas).filter(([form]) => !vocabSet.has(form)),
    ),
    vocab,
    freqTop,
  );

  // A separable verb's forms written apart reach it after their other bases, once the
  // frequency list has ranked those: "geht" ranks gehen, not ausgehen.
  let separableForms = 0;
  for (const [stem, verbs] of separated) {
    const own = [lemmas[stem] ?? []].flat();
    if (own.length === 0 && !vocabSet.has(stem)) continue;
    const more = [...verbs]
      .filter((verb) => vocabSet.has(verb) && !own.includes(verb))
      .sort(byCodeUnit);
    if (more.length === 0) continue;
    const bases = [...(own.length > 0 ? own : [stem]), ...more];
    lemmas[stem] = bases;
    separableForms++;
  }

  // Phrase patterns as English's (rules B1, B2, B2b, B4), with the language's settings:
  // every multi-word entry with a sense of its own whose words are vocabulary words,
  // forms or slots; highlighted by the idiomaticity score over the example corpus of
  // both editions. Each is defined by its senses, best first (rule C2).
  const built = await importPhrases(path, {
    vocab,
    lemmas,
    dict: {},
    language: ENGLISH_PHRASES,
    build: {
      ...language.phraseBuild(pos, lemmas),
      ...(fixed && { fixed: (key: string) => fixedExpression(fixed.get(key)) }),
    },
    examples: ownEditionExamples ? [path, ...casePaths] : [path],
    ...(!ownEditionExamples && { attestation: [path, ...casePaths] }),
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
      separableForms,
      partSenses,
      editionWords: edition.words,
      editionForms: edition.forms,
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
    `${stats.reordered} with their bases reordered by the treebanks, ` +
    `${stats.separableForms} with a separable verb) in ` +
    `${shards(`${lang}/lemmas`)} shards, ` +
    `${stats.ipa} IPA, ${stats.pos} words with parts of speech, ` +
    `${stats.editionWords} words and ${stats.editionForms} forms from the language's own edition, ` +
    `${stats.partSenses} compound parts' senses, ` +
    `${stats.detect} detected and ${stats.more} more phrase patterns, ` +
    `${stats.names} names (${stats.capitalisedNames} mostly capitalised), ` +
    `${stats.terms} dictionary terms in ${shards(`${lang}-en`)} shards`
  );
}

/**
 * A learning language's entry of its own edition cut to what the build reads of it:
 * examples and IPA.
 */
export function slimEntry(entry: KaikkiEntry): KaikkiEntry | undefined {
  const senses = (entry.senses ?? []).flatMap((sense) => {
    const examples = (sense as { examples?: unknown[] }).examples;
    return Array.isArray(examples) && examples.length > 0 ? [{ examples }] : [];
  });
  const sounds = (entry.sounds ?? []).filter(
    (sound) => typeof sound.ipa === "string",
  );
  if (senses.length === 0 && sounds.length === 0) return undefined;
  return {
    word: entry.word,
    lang_code: entry.lang_code,
    ...(entry.pos !== undefined && { pos: entry.pos }),
    ...(senses.length > 0 && { senses }),
    ...(sounds.length > 0 && {
      sounds: sounds.map(({ ipa }) => ({ ipa })),
    }),
  } as KaikkiEntry;
}

/**
 * Writes `slim`, the `lang` entries of the edition at `edition` cut by `slimEntry`,
 * once: the editions are several GB.
 */
export async function slimEdition(lang: string, edition: string, slim: string) {
  if (existsSync(slim)) return;
  console.log(`Cutting ${edition} to its examples and IPA`);
  const partial = `${slim}.partial`;
  const out = createWriteStream(partial);
  await eachEntry(
    edition,
    (entry) => {
      if (entry.lang_code !== lang) return;
      const cut = slimEntry(entry);
      if (cut) out.write(`${JSON.stringify(cut)}\n`);
    },
    (line) => !line.includes(`"lang_code": "${lang}"`),
  );
  await new Promise<void>((resolve, reject) =>
    out.end((error?: Error | null) => (error ? reject(error) : resolve())),
  );
  renameSync(partial, slim);
}
