/**
 * Spanish's tagger: the averaged perceptron trained on UD Spanish AnCora and GSD
 * (universal tags, with the verb form of verbs and auxiliaries: VERB.Fin, AUX.Part, …),
 * and Spanish grammar for how a tagged word is used: auxiliaries as the treebanks'
 * AUX tag marks them before a participle, gerund or infinitive (haber, estar, ser,
 * modals), and states (ser / estar + participle). Spanish has no particles: rule P2
 * stays off.
 */
import { tagSentence, type PerceptronModel } from "./perceptron";
import type { Tagger, TaggedWord, TokenTag, WordRole, WordUse } from "./tagger";

/**
 * A tag's score margin from which it is trusted. On the treebanks' dev sets, 5 keeps
 * about 98% of AnCora's tokens at about 98% accuracy, 97% of GSD's at about 97%.
 */
const THRESHOLD = 5;

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
 * headword of its own is what they are ("buenas", "nuestras").
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

function tokenTag(tag: string, confidence: number): TokenTag {
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

/** Whether the word is a form of `verb` (ha, está, fue). */
const formOf = (word: TaggedWord, verb: string) =>
  word.form === verb || word.bases.includes(verb);

/** A form of ser or estar, the verbs of states. */
const isBe = (word: TaggedWord) => formOf(word, "ser") || formOf(word, "estar");

/** What an auxiliary is followed by: a participle, a gerund or an infinitive. */
const NONFINITE = /^(VERB|AUX)\.(Part|Ger|Inf)$/;

/** Words that may stand between an auxiliary and its verb: no, adverbs, clitics. */
const BETWEEN: ReadonlySet<string> = new Set(["adverb", "pronoun"]);

/**
 * Whether the word at `i` is an auxiliary: tagged AUX, with its verb (a participle,
 * gerund or infinitive) within four words and only adverbs or clitic pronouns between
 * ("ha comido", "está lloviendo", "puede venir", "no lo he visto"). A copula is AUX
 * in the treebanks too, but takes no verb ("es importante"). Tags count here whether
 * trusted or not: a closed class.
 */
function auxiliary(words: readonly TaggedWord[], i: number): boolean {
  if (!words[i]!.tag.tag.startsWith("AUX")) return false;
  for (let j = i + 1; j < Math.min(words.length, i + 5); j++) {
    const { tag, pauseBefore } = words[j]!;
    if (pauseBefore) return false;
    if (NONFINITE.test(tag.tag)) return true;
    if (!BETWEEN.has(tag.label)) return false;
  }
  return false;
}

const trustedTagOf = (word: TaggedWord | undefined) =>
  word?.trusted ? word.tag : undefined;

function verbal(words: readonly TaggedWord[], i: number): WordUse["verbal"] {
  const tag = trustedTagOf(words[i]);
  if (tag?.label !== "verb") return false;
  if (tag.tag.endsWith(".Fin")) return "finite";
  const before = words.slice(Math.max(0, i - 3), i);
  if (tag.tag.endsWith(".Part") && before.some((w) => formOf(w, "haber")))
    return "aux";
  if (tag.tag.endsWith(".Ger") && before.some((w) => formOf(w, "estar")))
    return "aux";
  // ser / estar + a participle without an agent ("por") may be a state: "está
  // cerrado", "fue elegido por" is a passive.
  if (
    tag.tag.endsWith(".Part") &&
    before.slice(-2).some(isBe) &&
    words[i + 1]?.form !== "por"
  )
    return false;
  return "other";
}

function use(words: readonly TaggedWord[], i: number): WordUse {
  return {
    auxiliary: auxiliary(words, i),
    verbal: verbal(words, i),
    // A participle does not stand for a preposition in Spanish.
    prepositionSlot: false,
  };
}

/**
 * Personal pronouns and possessive determiners (a closed class): subject, object and
 * prepositional forms and the possessives, not the neuter "ello" / "lo".
 */
const PERSONAL: ReadonlySet<string> = new Set([
  ...["yo", "tú", "vos", "usted", "él", "ella", "nosotros", "nosotras"],
  ...["vosotros", "vosotras", "ustedes", "ellos", "ellas"],
  ...["me", "te", "se", "nos", "os", "le", "les", "mí", "ti"],
  ...["conmigo", "contigo", "mi", "mis", "tu", "tus", "su", "sus"],
  ...["nuestro", "nuestra", "nuestros", "nuestras"],
  ...["vuestro", "vuestra", "vuestros", "vuestras"],
]);

/** Auxiliaries that are not modals: of the perfect, the progressive, the passive and states. */
const NOT_MODAL = ["haber", "ser", "estar"];

function role(word: TaggedWord): WordRole {
  const { form } = word;
  const tag = word.trusted ? word.tag : undefined;
  const raw = tag?.tag ?? "";
  const determiner = raw === "DET";
  const nounPhrase =
    determiner || raw === "NOUN" || raw === "NUM" || word.tag.proper;
  return {
    determiner,
    nounPhrase,
    object: nounPhrase || raw === "PRON" || form === "que",
    modal:
      raw.startsWith("AUX") && !NOT_MODAL.some((verb) => formOf(word, verb)),
    personal: PERSONAL.has(form),
    // Spanish has no infinitive marker ("to").
    infinitive: false,
    preposition: tag?.label === "preposition",
    subject: tag?.label === "pronoun" || tag?.label === "noun",
    partitive: form === "de",
    be: isBe(word),
    pastParticiple: raw.endsWith(".Part"),
  };
}

export function spanishTagger(model: PerceptronModel): Tagger {
  return {
    threshold: THRESHOLD,
    // A contraction ("del", "dímelo") is one token, as in the treebanks' surface
    // text; the model learned its first word's tag for it.
    tag: (tokens) =>
      tagSentence(
        model,
        tokens.map((token) => token.replaceAll("’", "'")),
      ).map(({ tag, margin }) => tokenTag(tag, margin)),
    uses: (words) => words.map((_, i) => use(words, i)),
    role,
  };
}
