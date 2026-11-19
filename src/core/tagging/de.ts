/**
 * German's tagger: the averaged perceptron trained on UD German GSD (universal tags,
 * with the verb form of verbs and auxiliaries: VERB.Fin, AUX.Part, …; a separable
 * verb's particle as PART.Vz) over the tokens as Langle writes them ("im", "zum" as
 * one), and German grammar for how a tagged word is used. German puts the verb's
 * other parts at the clause's end ("Ich habe ihn gestern gesehen", "Er fängt morgen
 * an") or the finite verb there ("…, dass er ihn gesehen hat"), so a word's partner
 * is found anywhere in its clause, not within a few words: haben, sein (with the
 * verbs that take it) and werden with a participle or an infinitive are auxiliaries;
 * a separable verb's finite form with its particle is that verb ("fängt … an":
 * anfangen); sein + another participle is a state ("ist geschlossen"); "sein" before
 * a noun is the possessive.
 */
import { GERMAN_RULES } from "../phrases/de";
import { tagSentence, type PerceptronModel } from "./perceptron";
import type { Tagger, TaggedWord, WordRole, WordUse } from "./tagger";
import { formOf, trustedTagOf, udTokenTag } from "./ud";

/**
 * A tag's score margin from which it is trusted. On GSD's dev set, 5 keeps about 93%
 * of the tokens at about 95% accuracy (scripts/data/de-tagger.ts).
 */
const THRESHOLD = 5;

/** The auxiliaries of the compound tenses, the future and the passive. */
const TENSE_AUXILIARIES = ["haben", "sein", "werden"];

/** The modal verbs, which take an infinitive ("kann schwimmen"). */
const MODALS = ["können", "müssen", "dürfen", "sollen", "wollen", "mögen"];

/**
 * The verbs whose perfect takes sein (a closed class, as German grammar lists them:
 * verbs of motion and of a change of state), also with a separable particle
 * ("angekommen", "aufgestanden", "zurückgegangen").
 */
const SEIN_VERBS: ReadonlySet<string> = new Set([
  ...["sein", "werden", "bleiben", "gehen", "kommen", "fahren", "fliegen"],
  ...["laufen", "rennen", "reisen", "fallen", "sterben", "passieren"],
  ...["geschehen", "gelingen", "misslingen", "wachsen", "springen", "steigen"],
  ...["sinken", "ziehen", "wandern", "treten", "stehen", "schlafen", "wachen"],
  ...["verschwinden", "erscheinen", "entstehen", "folgen", "begegnen"],
  ...["platzen", "schmelzen", "explodieren", "landen", "reiten", "klettern"],
  ...["kriechen", "stürzen", "eilen", "schwimmen", "ertrinken", "entkommen"],
  ...["einschlafen", "aufwachen", "umziehen", "verunglücken", "zerfallen"],
]);

/**
 * Separable particles a verb of SEIN_VERBS may carry, one or more ("an" in
 * "angekommen", "zurück" in "zurückgegangen", "hin" + "auf"): a closed class.
 */
const PARTICLES = new RegExp(
  `^(?:${[
    ...["ab", "an", "auf", "aus", "bei", "da", "durch", "ein", "empor"],
    ...["entgegen", "fort", "her", "hin", "los", "mit", "nach", "nieder"],
    ...["rein", "raus", "rüber", "runter", "vor", "vorbei", "weg", "weiter"],
    ...["wieder", "zu", "zurück", "zusammen", "über", "unter", "um", "voran"],
  ].join("|")})+$`,
);

/** A verb whose perfect takes sein, itself or with separable particles. */
const takesSein = (verb: string) =>
  SEIN_VERBS.has(verb) ||
  [...SEIN_VERBS].some(
    (base) =>
      verb.length > base.length &&
      verb.endsWith(base) &&
      PARTICLES.test(verb.slice(0, -base.length)),
  );

/** The verb forms a word may be an auxiliary or a modal of. */
const isAuxiliaryForm = (word: TaggedWord) =>
  word.tag.label === "verb" &&
  [...TENSE_AUXILIARIES, ...MODALS].some((verb) => formOf(word, verb));

const isParticiple = (word: TaggedWord) => /\.Part$/.test(word.tag.tag);
const isInfinitive = (word: TaggedWord) => /\.Inf$/.test(word.tag.tag);

/** The indices of word `i`'s clause: the words between two pauses. */
function clauseOf(words: readonly TaggedWord[], i: number) {
  let start = i;
  while (start > 0 && !words[start]!.pauseBefore) start--;
  let end = i + 1;
  while (end < words.length && !words[end]!.pauseBefore) end++;
  return { start, end };
}

/**
 * Whether the nonfinite verb at `n` belongs to the auxiliary or modal at `a`: both in
 * one clause, with no other auxiliary or modal between them ("Ich habe Hunger und er
 * hat gegessen": "gegessen" is hat's). Either may come first: the auxiliary second in
 * a verb-final clause ("…, dass er es gesehen hat").
 */
function belongs(words: readonly TaggedWord[], a: number, n: number) {
  const [from, to] = a < n ? [a, n] : [n, a];
  for (let k = from + 1; k < to; k++) {
    if (words[k]!.pauseBefore) return false;
    if (isAuxiliaryForm(words[k]!)) return false;
  }
  return !words[to]!.pauseBefore;
}

/**
 * The verb whose participle a word tagged as an adjective is, at its clause's end in
 * a clause of haben (`end`: the clause's end): haben takes no predicative adjective,
 * so "Deine Kinder haben dich sehr vermisst" is vermissen's perfect, not "missing",
 * which the tagger reads after "sehr". The word ends as participles do (-t, -en) and
 * the pack lists an infinitive (-n) among its bases. Undefined otherwise.
 */
function adjectiveParticiple(
  words: readonly TaggedWord[],
  n: number,
  end: number,
): string | undefined {
  const word = words[n]!;
  if (word.tag.label !== "adjective" || n !== end - 1) return undefined;
  if (!/(?:t|en)$/.test(word.form)) return undefined;
  return word.bases.find((base) => base !== word.form && /n$/.test(base));
}

/**
 * What the auxiliary candidate at `i` takes in its clause: a participle (haben;
 * werden, the passive; sein with a verb that takes it, the perfect) or an infinitive
 * (werden, the future; a modal). Tags count here whether trusted or not: a closed
 * class. Undefined when none belongs to it.
 */
function partner(words: readonly TaggedWord[], i: number) {
  const word = words[i]!;
  if (!isAuxiliaryForm(word)) return undefined;
  const { start, end } = clauseOf(words, i);
  for (let n = start; n < end; n++) {
    if (n === i || !belongs(words, i, n)) continue;
    const other = words[n]!;
    if (isParticiple(other)) {
      if (formOf(word, "haben") || formOf(word, "werden")) return n;
      if (formOf(word, "sein") && other.bases.some(takesSein)) return n;
    }
    if (
      formOf(word, "haben") &&
      adjectiveParticiple(words, n, end) !== undefined
    )
      return n;
    if (
      isInfinitive(other) &&
      (formOf(word, "werden") || MODALS.some((verb) => formOf(word, verb)))
    )
      return n;
  }
  return undefined;
}

/**
 * Whether the word at `i` is an auxiliary: a form of haben, sein or werden with its
 * participle or infinitive in the clause, or a modal with its infinitive (`partners`,
 * each word's `partner`), as French pouvoir and devoir are read (L1-5): rule A2 then
 * shows the senses kaikki tags auxiliary ("kann … schwimmen": "to be able (to do or be
 * something), can"; "muss … gehen": "to have to (do something); must"), and a modal
 * with no infinitive its own verb senses ("Ich kann Deutsch": "to be able to do
 * something implied"). A copula takes no verb ("ist groß").
 */
const auxiliary = (
  words: readonly TaggedWord[],
  i: number,
  partners: readonly (number | undefined)[],
) =>
  [...TENSE_AUXILIARIES, ...MODALS].some((verb) => formOf(words[i]!, verb)) &&
  partners[i] !== undefined;

/**
 * How a word tagged as a verb is used: a participle or an infinitive an auxiliary or
 * a modal takes is a verb there ("aux"); a participle with a form of sein that is no
 * auxiliary is a state ("ist geschlossen", "bin verletzt"), read as the adjective its
 * entry may have (false).
 */
function verbal(
  words: readonly TaggedWord[],
  i: number,
  partners: readonly (number | undefined)[],
): WordUse["verbal"] {
  const tag = trustedTagOf(words[i]);
  if (tag?.label !== "verb") return false;
  if (tag.tag.endsWith(".Fin")) return "finite";
  if (partners.includes(i)) return "aux";
  if (!tag.tag.endsWith(".Part")) return "other";
  const { start, end } = clauseOf(words, i);
  for (let k = start; k < end; k++)
    if (k !== i && formOf(words[k]!, "sein") && words[k]!.tag.label === "verb")
      return false;
  return "other";
}

/**
 * An infinitive right after a trusted determiner or preposition is a noun: "das
 * Essen", "beim Laufen", "zum Leben" (the infinitive used as a noun, which German
 * writes capitalised). A finite verb may follow a postposition ("Den Angaben zufolge
 * soll es …"), so only the infinitive.
 */
function nounAfter(words: readonly TaggedWord[], i: number): boolean {
  const word = words[i]!;
  const before = words[i - 1];
  return (
    /^(VERB|AUX)\.Inf$/.test(word.tag.tag) &&
    before !== undefined &&
    !word.pauseBefore &&
    before.trusted &&
    (before.tag.tag === "DET" || before.tag.tag === "ADP")
  );
}

/**
 * The separable verb a finite verb is a form of here: its particle stands later in
 * the clause ("Er fängt morgen an": anfangen; "Ruf mich an": anrufen), tagged as one
 * or, as the clause's last word, as a preposition or an adverb, and the pack lists
 * that verb among the form's bases (the lemma table gives "fängt" anfangen too).
 */
function separable(words: readonly TaggedWord[], i: number) {
  const word = words[i]!;
  if (!/^(VERB|AUX)\.Fin$/.test(word.tag.tag)) return undefined;
  // A capital inside a sentence is a noun's ("Sankt"), not a verb's.
  if (word.capital === true && i > 0) return undefined;
  const { end } = clauseOf(words, i);
  for (let k = end - 1; k > i; k--) {
    const particle = words[k]!;
    const last = k === end - 1;
    const tagged =
      particle.tag.tag === "PART.Vz" ||
      (last && /^(ADP|ADV)$/.test(particle.tag.tag));
    if (!tagged) continue;
    const stem = simple(word);
    if (stem !== undefined && word.bases.includes(particle.form + stem))
      return particle.form + stem;
  }
  return undefined;
}

/**
 * The base the grammar decides for a form of a closed class of verbs, whatever the
 * tagger's margin (`WordUse.base`), when no separable verb's particle stands in the
 * clause (`separable`): a modal's form is the modal; a form of haben, sein or werden
 * tagged as a verb is that verb ("habe": haben, not the noun Habe, possessions); a
 * form that is also a separable verb's is the simple verb's.
 */
function closedBase(words: readonly TaggedWord[], i: number) {
  const word = words[i]!;
  // A modal's form is never anything else ("Kannst du": können, not the noun Können).
  const modal = MODALS.find(
    (base) => word.bases.includes(base) && base !== word.form,
  );
  if (modal !== undefined) return modal;
  if (word.tag.label !== "verb") return undefined;
  const auxiliary = TENSE_AUXILIARIES.find(
    (base) => word.bases.includes(base) && base !== word.form,
  );
  if (auxiliary !== undefined) return auxiliary;
  // Without its particle in the clause, a form is the simple verb's ("wir essen":
  // essen, not aufessen).
  return simple(word);
}

/**
 * The verbs among a word's bases that its separable verbs are made of: "rufen" for
 * "rufe" (anrufen, aufrufen), not the noun Ruf, whose plural it also is. In the order
 * of the bases (the pack lists the simple verb before its separable ones).
 */
const stems = (word: TaggedWord) =>
  word.bases.filter((stem) =>
    word.bases.some(
      (base) =>
        base.length > stem.length &&
        base.endsWith(stem) &&
        PARTICLES.test(base.slice(0, -stem.length)),
    ),
  );

/** A word's simple verb when it is also a separable verb's form (`stems`). */
const simple = (word: TaggedWord) => stems(word)[0];

/** Subject pronouns in the nominative, which follow the verb in a question. */
const SUBJECTS: ReadonlySet<string> = new Set([
  ...["ich", "du", "er", "sie", "es", "wir", "ihr", "man"],
]);

/**
 * A clause's first word right before a subject pronoun is its verb, a question's or
 * an imperative's ("Wissen Sie …?", "Kannst du …?", "Gehen wir"), which its capital
 * makes the tagger read as a noun: German puts the verb first there.
 */
function verbFirst(words: readonly TaggedWord[], i: number) {
  const word = words[i]!;
  const next = words[i + 1];
  return (
    (i === 0 || word.pauseBefore) &&
    next !== undefined &&
    !next.pauseBefore &&
    SUBJECTS.has(next.form) &&
    word.tag.label !== "verb" &&
    !/^(DET|PRON|ADV|SCONJ|CCONJ|ADP|PART)/.test(word.tag.tag) &&
    word.bases.length > 0
  );
}

/**
 * The part of speech of "sein" from where it stands: before a noun or an adjective
 * the possessive ("sein Haus", "sein neues Auto"), at its clause's end the verb ("Das
 * kann sein", "um müde zu sein").
 */
function seinPos(words: readonly TaggedWord[], i: number) {
  if (words[i]!.form !== "sein") return undefined;
  const next = words[i + 1];
  if (!next || next.pauseBefore) return "verb";
  if (/^(NOUN|PROPN|ADJ)$/.test(next.tag.tag)) return "determiner";
  return undefined;
}

/**
 * A preposition joined to the article (am, im, zum, …: `GERMAN_RULES.contractions`) is
 * that contraction, whatever the tag ("am Montag": on the), but "am" before a
 * superlative that no noun follows is the superlative's particle ("am besten").
 */
function contractionPos(words: readonly TaggedWord[], i: number) {
  const word = words[i]!;
  if (!GERMAN_RULES.contractions?.has(word.form)) return undefined;
  const next = words[i + 1];
  const after = words[i + 2];
  if (
    word.form === "am" &&
    next !== undefined &&
    !next.pauseBefore &&
    /sten$/.test(next.form) &&
    (after === undefined || after.pauseBefore || after.tag.label !== "noun")
  )
    return "particle";
  return "contraction";
}

/**
 * German capitalises its nouns: a capitalised word inside a sentence is one, whatever
 * the tagger is sure of ("eine Kartoffel mit Haaren": Haar, not haaren, to moult). Not
 * a sentence's first word, a pronoun or determiner (the polite Sie, Ihr), a name, or
 * a word the grammar reads otherwise.
 */
function capitalNoun(words: readonly TaggedWord[], i: number) {
  const word = words[i]!;
  return (
    word.capital === true &&
    i > 0 &&
    !word.tag.proper &&
    !/^(PRON|DET)$/.test(word.tag.tag) &&
    !(word.trusted && word.tag.label !== "noun")
  );
}

function use(
  words: readonly TaggedWord[],
  i: number,
  partners: readonly (number | undefined)[],
): WordUse {
  const word = words[i]!;
  const how = verbal(words, i, partners);
  const previousTag = trustedTagOf(words[i - 1]);
  const noun = nounAfter(words, i);
  const compound = noun ? undefined : separable(words, i);
  const base = noun ? undefined : (compound ?? closedBase(words, i));
  const possessive = seinPos(words, i);
  const first = verbFirst(words, i);
  const contraction = contractionPos(words, i);
  const capitalised = capitalNoun(words, i) && !first;
  // An adjective-tagged participle a form of haben takes is its verb.
  const participle = partners.includes(i)
    ? adjectiveParticiple(words, i, clauseOf(words, i).end)
    : undefined;
  // A participle in a state reads as the adjective it is ("ist geschlossen": closed).
  const state = how === false && trustedTagOf(word)?.label === "verb";
  return {
    auxiliary: auxiliary(words, i, partners),
    verbal: noun ? "other" : how,
    // A participle may stand for a preposition at a clause's start or after a noun.
    prepositionSlot:
      /^VERB\.Part$/.test(trustedTagOf(word)?.tag ?? "") &&
      how !== "aux" &&
      (i === 0 || word.pauseBefore || previousTag?.label === "noun"),
    ...(noun && { label: "noun" }),
    ...(state && !noun && { grammarPos: "adjective" }),
    ...(possessive !== undefined && { grammarPos: possessive }),
    ...(first && { grammarPos: "verb" }),
    ...(capitalised && base === undefined && { grammarPos: "noun" }),
    ...(contraction !== undefined && { grammarPos: contraction }),
    ...(base !== undefined && { base, grammarPos: "verb" }),
    ...(participle !== undefined && { base: participle, grammarPos: "verb" }),
    ...(compound !== undefined && { separable: true as const }),
  };
}

/**
 * Personal pronouns and possessive determiners (a closed class), in every case; not
 * "es" or "man".
 */
const PERSONAL: ReadonlySet<string> = new Set([
  ...["ich", "du", "er", "sie", "wir", "ihr", "mich", "dich", "ihn", "uns"],
  ...["euch", "mir", "dir", "ihm", "ihnen", "sich"],
  ...["mein", "dein", "sein", "unser", "euer"],
  ...["meine", "deine", "seine", "ihre", "unsere", "eure"],
  ...["meinen", "deinen", "seinen", "ihren", "unseren", "euren"],
  ...["meinem", "deinem", "seinem", "ihrem", "unserem", "eurem"],
  ...["meiner", "deiner", "seiner", "ihrer", "unserer", "eurer"],
  ...["meines", "deines", "seines", "ihres", "unseres", "eures"],
]);

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
    object: nounPhrase || raw === "PRON" || form === "dass",
    modal: MODALS.some((verb) => formOf(word, verb)) && raw.startsWith("AUX"),
    personal: PERSONAL.has(form),
    // "zu" before an infinitive ("um zu gehen").
    infinitive: form === "zu" && raw === "PART",
    preposition: tag?.label === "preposition",
    subject: tag?.label === "pronoun" || tag?.label === "noun",
    partitive: form === "von",
    be: formOf(word, "sein"),
    pastParticiple: raw.endsWith(".Part"),
  };
}

export function germanTagger(model: PerceptronModel): Tagger {
  return {
    threshold: THRESHOLD,
    // A contraction ("im", "zum") is one token, as in the treebank's surface text;
    // the model learned its first word's tag for it.
    tag: (tokens) =>
      tagSentence(
        model,
        tokens.map((token) => token.replaceAll("’", "'")),
      ).map(({ tag, margin }) => udTokenTag(tag, margin)),
    uses: (words) => {
      const partners = words.map((_, i) => partner(words, i));
      return words.map((_, i) => use(words, i, partners));
    },
    role,
  };
}
