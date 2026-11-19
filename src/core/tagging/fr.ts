/**
 * French's tagger: the averaged perceptron trained on UD French GSD (universal tags,
 * with the verb form of verbs and auxiliaries: VERB.Fin, AUX.Part, …) over the tokens
 * as Langle writes them (elisions apart: "l'", "qu'"; "du", "au", "des" as one), and
 * French grammar for how a tagged word is used: the auxiliaries avoir and être before
 * a participle (also after a reflexive pronoun: "s'est levé", "se sont vus"), aller
 * before an infinitive (the near future), the negation "ne … pas" and its kin, and a
 * verb form right after a determiner or preposition, which is a noun ("l'été", "le
 * fait", "d'été"). French has no particles: rule P2 stays off.
 */
import { tagSentence, type PerceptronModel } from "./perceptron";
import type { Tagger, TaggedWord, WordRole, WordUse } from "./tagger";
import { formOf, NONFINITE, trustedTagOf, udTokenTag } from "./ud";

/**
 * A tag's score margin from which it is trusted. On GSD's dev set, 5 keeps about 96%
 * of the tokens at about 97% accuracy (scripts/data/fr-tagger.ts).
 */
const THRESHOLD = 5;

/** A form of avoir or être, the auxiliaries of the compound tenses and the passive. */
const isAuxiliaryVerb = (word: TaggedWord) =>
  formOf(word, "avoir") || formOf(word, "être");

/**
 * Words that may stand between an auxiliary and its verb: the negation, adverbs,
 * object pronouns, an inverted subject ("n'a pas vu", "l'a déjà dit", "a-t-il vu",
 * "vais le faire").
 */
const BETWEEN: ReadonlySet<string> = new Set(["adverb", "pronoun"]);

/**
 * Whether the word at `i` is an auxiliary: tagged AUX (avoir, être; the treebank also
 * tags causative faire so) with a participle or an infinitive within four words and
 * only adverbs or pronouns between ("a mangé", "s'est levé", "n'avait jamais vu",
 * "fait construire"); or a finite form of aller with an infinitive so (the near
 * future: "va pleuvoir", "je vais le faire"), which the treebank tags as a verb. A
 * copula is AUX too but takes no verb ("est grand"). Tags count here whether trusted
 * or not: a closed class.
 */
function auxiliary(words: readonly TaggedWord[], i: number): boolean {
  const word = words[i]!;
  const aux = word.tag.tag.startsWith("AUX");
  const nearFuture =
    !aux && word.tag.tag === "VERB.Fin" && formOf(word, "aller");
  if (!aux && !nearFuture) return false;
  for (let j = i + 1; j < Math.min(words.length, i + 5); j++) {
    const { tag, pauseBefore } = words[j]!;
    if (pauseBefore) return false;
    if (aux ? NONFINITE.test(tag.tag) : /^(VERB|AUX)\.Inf$/.test(tag.tag))
      return true;
    if (!BETWEEN.has(tag.label)) return false;
  }
  return false;
}

/**
 * The verbs whose compound tenses take être (a closed class, as French grammar lists
 * them): "est venu", "sont partis", "est né".
 */
const ETRE_VERBS: ReadonlySet<string> = new Set([
  ...["aller", "venir", "arriver", "partir", "entrer", "sortir", "monter"],
  ...["descendre", "naître", "mourir", "rester", "tomber", "retourner"],
  ...["passer", "devenir", "revenir", "rentrer", "repartir", "ressortir"],
  ...["remonter", "redescendre", "retomber", "parvenir", "survenir"],
  ...["intervenir", "décéder", "apparaître", "advenir", "renaître"],
]);

/**
 * Reflexive pronouns: before être they make a compound tense ("s'est levé"). "nous"
 * and "vous" are reflexive after themselves ("vous vous êtes vus"), else subjects.
 */
const REFLEXIVES: ReadonlySet<string> = new Set([
  ...["me", "m'", "te", "t'", "se", "s'"],
]);

/**
 * A reflexive pronoun among the object pronouns right before the word at `k` ("s'est",
 * "me le suis", "vous vous êtes").
 */
function reflexiveBefore(words: readonly TaggedWord[], k: number): boolean {
  for (let j = k - 1; j >= 0 && !words[j + 1]!.pauseBefore; j--) {
    const { form } = words[j]!;
    if (REFLEXIVES.has(form)) return true;
    if ((form === "nous" || form === "vous") && words[j - 1]?.form === form)
      return !words[j]!.pauseBefore;
    if (!VERB_CLITICS.has(form)) return false;
  }
  return false;
}

/** The nearest form of avoir or être within three words before `i`. */
function nearestAuxiliaryVerb(words: readonly TaggedWord[], i: number) {
  for (let k = i - 1; k >= Math.max(0, i - 3); k--)
    if (isAuxiliaryVerb(words[k]!)) return k;
  return undefined;
}

/**
 * How a word tagged as a verb is used. A participle after avoir is a compound tense
 * ("a mangé", "n'a pas vu"); after être too when its verb is one that takes être or a
 * reflexive pronoun comes before ("est venu", "s'est levé"). After "été" or with an
 * agent it is a passive ("a été jugé", "est construit par …"); otherwise être +
 * participle may be a state, as Spanish estar + participle is ("je suis désolé",
 * "c'est fermé"), whose entry says it as an adjective, if it has one.
 */
function verbal(words: readonly TaggedWord[], i: number): WordUse["verbal"] {
  const word = words[i]!;
  const tag = trustedTagOf(word);
  if (tag?.label !== "verb") return false;
  if (tag.tag.endsWith(".Fin")) return "finite";
  const k = nearestAuxiliaryVerb(words, i);
  if (!tag.tag.endsWith(".Part") || k === undefined) return "other";
  const auxiliary = words[k]!;
  if (formOf(auxiliary, "avoir") && !formOf(auxiliary, "être")) return "aux";
  if (
    word.bases.some((base) => ETRE_VERBS.has(base)) ||
    reflexiveBefore(words, k)
  )
    return "aux";
  // After "été" (a passive in a compound tense: "a été jugé") or with an agent.
  if (formOf(auxiliary, "été") || words[i + 1]?.form === "par") return "other";
  return false;
}

/** The negative particle, before the verb ("ne", "n'"). */
const NE: ReadonlySet<string> = new Set(["ne", "n'"]);

/**
 * The words that complete a negation with "ne" (a closed class), and the part of
 * speech they are in it: "ne … pas" not (no step), "ne … plus" no more, "ne …
 * personne" nobody (no person), "rien ne" nothing.
 */
const NEGATIONS: Readonly<Record<string, string>> = {
  pas: "adverb",
  plus: "adverb",
  jamais: "adverb",
  point: "adverb",
  guère: "adverb",
  rien: "pronoun",
  personne: "pronoun",
};

/** How many words back a negation word looks for its "ne": "ne le lui a pas dit". */
const NEGATION_REACH = 6;

/**
 * The part of speech a negation word has with "ne" in the same clause: before it, with
 * no pause between ("je ne sais pas", "il n'y a personne"), or right after it ("rien
 * n'a changé", "personne ne sait").
 */
function negation(words: readonly TaggedWord[], i: number): string | undefined {
  const word = words[i]!;
  if (!Object.hasOwn(NEGATIONS, word.form)) return undefined;
  const next = words[i + 1];
  if (next && !next.pauseBefore && NE.has(next.form))
    return NEGATIONS[word.form];
  for (let j = i; j > 0 && i - j < NEGATION_REACH; j--) {
    if (words[j]!.pauseBefore) return undefined;
    if (NE.has(words[j - 1]!.form)) return NEGATIONS[word.form];
  }
  return undefined;
}

/**
 * A finite verb or a participle right after a trusted determiner or preposition is a
 * noun: "l'été", "cet été", "d'été", "en été" (summer, not the participle of être),
 * "le fait que", "l'est" (the east), "un as". Neither stands there (an infinitive does:
 * "de faire"; a gerund after "en": "en mangeant"). The treebank tags these nouns, but
 * "est" and "été" are far more often verbs, so the tagger misses some.
 */
function nounAfter(words: readonly TaggedWord[], i: number): boolean {
  return (
    /^(VERB|AUX)\.(Fin|Part)$/.test(words[i]!.tag.tag) && afterArticle(words, i)
  );
}

/**
 * A noun tag right after a trusted determiner or preposition stands whatever its
 * margin: no closed class of verbs claims the word ("vers l'Est": the east, not
 * être); but not after a subject pronoun, whose object pronoun the tagger read as the determiner ("tu l'as",
 * "je la garde").
 */
const nounTagAfter = (words: readonly TaggedWord[], i: number) =>
  words[i]!.tag.tag === "NOUN" &&
  afterArticle(words, i) &&
  !afterSubject(words, i);

/** Right after a trusted determiner or preposition, with no pause between. */
function afterArticle(words: readonly TaggedWord[], i: number): boolean {
  const word = words[i]!;
  const before = words[i - 1];
  return (
    before !== undefined &&
    !word.pauseBefore &&
    before.trusted &&
    (before.tag.tag === "DET" || before.tag.tag === "ADP")
  );
}

/** The verbs the treebank tags AUX: of the compound tenses, the passive, the causative. */
const AUXILIARY_VERBS = ["avoir", "être", "faire"];

/** The auxiliaries of the compound tenses, whose forms are far more often verbs than not. */
const TENSE_AUXILIARIES = ["avoir", "être"];

/** Subject pronouns, which stand before their verb (a closed class). */
const SUBJECT_CLITICS: ReadonlySet<string> = new Set([
  ...["je", "j'", "tu", "t'", "il", "ils", "elle", "elles", "on", "nous"],
  ...["vous", "c'", "ce", "ça"],
]);

/**
 * Object pronouns and the negation, which stand between a subject pronoun and its
 * verb ("tu ne l'as pas", "je le lui ai dit", "il y a", "on s'est vus").
 */
const VERB_CLITICS: ReadonlySet<string> = new Set([
  ...["me", "m'", "te", "t'", "se", "s'", "le", "la", "l'", "les"],
  ...["lui", "leur", "nous", "vous", "y", "en", "ne", "n'"],
]);

/**
 * Subject pronouns that are never anything else before a word ("ce" is also a
 * determiner, "nous", "vous", "elle" also stressed pronouns: "chez vous", "avec elle").
 */
const ONLY_SUBJECTS: ReadonlySet<string> = new Set([
  ...["je", "j'", "tu", "il", "ils", "on"],
]);

/**
 * The word at `i` follows a subject pronoun and nothing but object pronouns or "ne"
 * ("tu as", "t'as", "tu l'as", "tu les as", "on n'est"): it is the subject's verb.
 * `strict`: only after a pronoun that is never anything else (`ONLY_SUBJECTS`).
 */
function afterSubject(
  words: readonly TaggedWord[],
  i: number,
  strict = false,
): boolean {
  const subjects = strict ? ONLY_SUBJECTS : SUBJECT_CLITICS;
  for (let j = i - 1; j >= 0 && !words[j + 1]!.pauseBefore; j--) {
    const { form } = words[j]!;
    if (subjects.has(form)) return true;
    if (!VERB_CLITICS.has(form)) return false;
  }
  return false;
}

/** A verb's base, its infinitive ("faire"; not "fait" itself). */
const INFINITIVE = /(er|ir|ïr|re)$/;

/**
 * The base the grammar decides for a form of a closed class of verbs, whatever the
 * tagger's margin (`WordUse.base`), where no determiner or preposition comes right
 * before (`nounAfter`):
 * - a form tagged AUX is the auxiliary among its bases ("est" → être, not east; "a" →
 *   avoir, not the letter; "suis" → être, not suivre);
 * - a form of avoir or être with no trusted tag, or after a subject pronoun, is that
 *   verb, its likeliest reading by far ("Est-ce que", which the tagger reads as the
 *   region; "tu les as", where it reads "the aces");
 * - any other word right after a subject pronoun (and object pronouns) that is a verb
 *   form is that verb ("tu joues": not the cheek; "je me sens");
 * - a participle whose auxiliary is avoir is its verb's ("as fait" → faire, not
 *   fact); after être it may be an adjective ("c'est parfait", "j'ai été lâche"),
 *   left to the tag;
 * - a form of aller before an infinitive is aller's ("va" in "va pleuvoir").
 */
function closedBase(
  words: readonly TaggedWord[],
  i: number,
  auxiliaries: readonly boolean[],
): string | undefined {
  const word = words[i]!;
  const verbs = word.tag.tag.startsWith("AUX")
    ? AUXILIARY_VERBS
    : !word.trusted || afterSubject(words, i)
      ? TENSE_AUXILIARIES
      : [];
  const verb = verbs.find((base) => word.bases.includes(base));
  if (verb !== undefined) return verb;
  // Any other word right after a subject pronoun is its verb ("tu joues": not the
  // cheek), if it is a form of one.
  if (
    word.tag.label !== "verb" &&
    !VERB_CLITICS.has(word.form) &&
    !SUBJECT_CLITICS.has(word.form) &&
    afterSubject(words, i, true)
  )
    return word.bases.find(
      (base) => base !== word.form && INFINITIVE.test(base),
    );
  if (auxiliaries[i] && formOf(word, "aller")) return "aller";
  let auxiliaryAt = i - 1;
  while (auxiliaryAt >= Math.max(0, i - 4) && !auxiliaries[auxiliaryAt])
    auxiliaryAt--;
  const afterAvoir =
    auxiliaryAt >= Math.max(0, i - 4) && formOf(words[auxiliaryAt]!, "avoir");
  if (/\.Part$/.test(word.tag.tag) && afterAvoir)
    return word.bases.find(
      (base) => base !== word.form && INFINITIVE.test(base),
    );
  return undefined;
}

function use(
  words: readonly TaggedWord[],
  i: number,
  auxiliaries: readonly boolean[],
): WordUse {
  const word = words[i]!;
  const how = verbal(words, i);
  const previousTag = trustedTagOf(words[i - 1]);
  const noun = nounAfter(words, i);
  const negated = negation(words, i);
  const base =
    noun || nounTagAfter(words, i)
      ? undefined
      : closedBase(words, i, auxiliaries);
  // A participle in a state reads as the adjective it is ("c'est fait": done).
  const state = how === false && trustedTagOf(word)?.label === "verb";
  return {
    auxiliary: auxiliaries[i]!,
    verbal: noun ? "other" : how,
    // A participle may stand for a preposition at a clause's start or after a noun
    // ("vu la situation", "passé minuit", "les frais compris").
    prepositionSlot:
      /^VERB\.(Part|Ger)$/.test(trustedTagOf(word)?.tag ?? "") &&
      how !== "aux" &&
      (i === 0 || word.pauseBefore || previousTag?.label === "noun"),
    ...(noun && { label: "noun" }),
    ...(negated !== undefined && { grammarPos: negated }),
    ...(state && !noun && { grammarPos: "adjective" }),
    ...(base !== undefined && { base }),
    // A base the grammar decides against the tag ("tu les as": not "the aces") is a verb.
    ...(base !== undefined &&
      word.tag.label !== "verb" && { grammarPos: "verb" }),
  };
}

/**
 * Personal pronouns and possessive determiners (a closed class): subject, object and
 * stressed forms, elided ones too, and the possessives; not the neuter "ce", "ça",
 * "cela", "y", "en" or "on".
 */
const PERSONAL: ReadonlySet<string> = new Set([
  ...["je", "j'", "tu", "il", "elle", "nous", "vous", "ils", "elles"],
  ...["me", "m'", "te", "t'", "se", "s'", "lui", "leur", "eux"],
  ...["moi", "toi", "soi"],
  ...["mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses"],
  ...["notre", "nos", "votre", "vos", "leurs"],
]);

/** Auxiliaries that are not modals: of the compound tenses and the passive. */
const NOT_MODAL = ["avoir", "être"];

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
    object: nounPhrase || raw === "PRON" || form === "que" || form === "qu'",
    modal:
      raw.startsWith("AUX") && !NOT_MODAL.some((verb) => formOf(word, verb)),
    personal: PERSONAL.has(form),
    // French has no infinitive marker ("to").
    infinitive: false,
    preposition: tag?.label === "preposition",
    subject: tag?.label === "pronoun" || tag?.label === "noun",
    partitive: form === "de" || form === "d'",
    be: formOf(word, "être"),
    pastParticiple: raw.endsWith(".Part"),
  };
}

export function frenchTagger(model: PerceptronModel): Tagger {
  return {
    threshold: THRESHOLD,
    // A contraction ("du", "au") is one token, as in the treebank's surface text; the
    // model learned its first word's tag for it.
    tag: (tokens) =>
      tagSentence(
        model,
        tokens.map((token) => token.replaceAll("’", "'")),
      ).map(({ tag, margin }) => udTokenTag(tag, margin)),
    uses: (words) => {
      const auxiliaries = words.map((_, i) => auxiliary(words, i));
      return words.map((_, i) => use(words, i, auxiliaries));
    },
    role,
  };
}
