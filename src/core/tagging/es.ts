/**
 * Spanish's tagger: the averaged perceptron trained on UD Spanish AnCora and GSD
 * (universal tags, with the verb form of verbs and auxiliaries: VERB.Fin, AUX.Part, …),
 * and Spanish grammar for how a tagged word is used: auxiliaries as the treebanks'
 * AUX tag marks them before a participle, gerund or infinitive (haber, estar, ser,
 * modals), and states (ser / estar + participle). Spanish has no particles: rule P2
 * stays off.
 */
import { tagSentence, type PerceptronModel } from "./perceptron";
import type { Tagger, TaggedWord, WordRole, WordUse } from "./tagger";
import { formOf, NONFINITE, trustedTagOf, udTokenTag } from "./ud";

/**
 * A tag's score margin from which it is trusted. On the treebanks' dev sets, 5 keeps
 * about 98% of AnCora's tokens at about 98% accuracy, 97% of GSD's at about 97%.
 */
const THRESHOLD = 5;

/** A verb's base, its infinitive ("ir"; not the letter "e" of "es"). */
const INFINITIVE = /(ar|er|ir|ír)$/;

/** A form of ser or estar, the verbs of states. */
const isBe = (word: TaggedWord) => formOf(word, "ser") || formOf(word, "estar");

/** Words that may stand between an auxiliary and its verb: no, adverbs, clitics. */
const BETWEEN: ReadonlySet<string> = new Set(["adverb", "pronoun"]);

/**
 * The verb form an AUX-tagged word at `i` takes as an auxiliary: a participle, gerund
 * or infinitive within four words with only adverbs or clitic pronouns between ("ha
 * comido", "está lloviendo", "puede venir", "no lo he visto"); none for a copula,
 * which is AUX in the treebanks too but takes no verb ("es importante"). Tags count
 * here whether trusted or not: a closed class.
 */
function auxiliaryVerb(
  words: readonly TaggedWord[],
  i: number,
): string | undefined {
  if (!words[i]!.tag.tag.startsWith("AUX")) return undefined;
  for (let j = i + 1; j < Math.min(words.length, i + 5); j++) {
    const { tag, pauseBefore } = words[j]!;
    if (pauseBefore) return undefined;
    if (NONFINITE.test(tag.tag)) return tag.tag;
    if (!BETWEEN.has(tag.label)) return undefined;
  }
  return undefined;
}

/**
 * The verb of a form that ser shares with another (fui, fue, fuera: ser and ir), as
 * `notCopula` reads it.
 */
const otherThanSer = (word: TaggedWord) =>
  word.bases.find(
    (base) => base !== "ser" && base !== word.form && INFINITIVE.test(base),
  );

/**
 * Whether the word at `i` is an auxiliary (`auxiliaryVerb`). Ser is one only before a
 * participle, the passive ("fue elegido"): before an infinitive it is the copula of a
 * clause ("lo que quiero es sacar", "el reto era ser escuchado"), and a form it
 * shares with ir is ir before a gerund ("fue creciendo": went on growing; `notCopula`).
 */
function auxiliary(words: readonly TaggedWord[], i: number): boolean {
  const verb = auxiliaryVerb(words, i);
  if (verb === undefined) return false;
  const word = words[i]!;
  if (!formOf(word, "ser") || verb.endsWith(".Part")) return true;
  return verb.endsWith(".Ger") && otherThanSer(word) !== undefined;
}

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

/**
 * The unstressed object pronouns (a closed class), which stand right before their
 * verb, or before another of them ("se lo dijo"), when they are not attached to it.
 */
const CLITICS: ReadonlySet<string> = new Set([
  ...["me", "te", "se", "nos", "os", "lo", "la", "los", "las", "le", "les"],
]);

/** The clitics that are also definite articles: lo (neuter), la, los, las. */
const ARTICLE_CLITICS: ReadonlySet<string> = new Set([
  "lo",
  "la",
  "los",
  "las",
]);

/**
 * A clitic that is also an article, tagged as a pronoun with no verb (nor another
 * clitic) right after it, is not used as a clitic but as the article: "lo que", "lo
 * mejor", "lo de ayer" (the neuter article "the, that which is", not "him, it"). A noun
 * right after it is more often a verb the tagger missed than the
 * article's noun, which the tagger tags as a determiner's ("la casa").
 */
function articleNotClitic(words: readonly TaggedWord[], i: number): boolean {
  const word = words[i]!;
  if (!word.tag.tag.startsWith("PRON") || !ARTICLE_CLITICS.has(word.form))
    return false;
  const next = words[i + 1];
  return (
    next !== undefined &&
    !next.pauseBefore &&
    !/^(VERB|AUX|NOUN|PROPN)/.test(next.tag.tag) &&
    !CLITICS.has(next.form)
  );
}

/** The reflexive pronouns among the clitics. */
const REFLEXIVES: ReadonlySet<string> = new Set([
  "me",
  "te",
  "se",
  "nos",
  "os",
]);

/**
 * A form the copula ser shares with another verb (fui, fue, fuera: ser and ir) is the
 * other verb where the copula cannot stand: right after an object clitic ("se fue",
 * "me fue bien"; not the attribute "lo": "lo fue") or before "a" ("fui a Madrid",
 * "fue a ver"), as ser takes neither, nor a gerund ("fue creciendo"). After a
 * reflexive pronoun it is that verb's pronominal use ("se fueron de campamento": irse).
 */
function notCopula(
  words: readonly TaggedWord[],
  i: number,
): Pick<WordUse, "base" | "pronominal"> {
  const word = words[i]!;
  if (!word.bases.includes("ser")) return {};
  const other = otherThanSer(word);
  if (other === undefined) return {};
  const before = words[i - 1];
  const next = words[i + 1];
  const clitic =
    before !== undefined &&
    !word.pauseBefore &&
    CLITICS.has(before.form) &&
    !ARTICLE_CLITICS.has(before.form);
  const toA =
    next !== undefined &&
    !next.pauseBefore &&
    (next.form === "a" || next.form === "al");
  const gerund = auxiliaryVerb(words, i)?.endsWith(".Ger") === true;
  if (!clitic && !toA && !gerund) return {};
  return {
    base: other,
    ...(clitic && REFLEXIVES.has(before.form) && { pronominal: true }),
  };
}

function use(words: readonly TaggedWord[], i: number): WordUse {
  return {
    auxiliary: auxiliary(words, i),
    verbal: verbal(words, i),
    // A participle does not stand for a preposition in Spanish.
    prepositionSlot: false,
    ...(articleNotClitic(words, i) && { label: "determiner" }),
    ...notCopula(words, i),
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
      ).map(({ tag, margin }) => udTokenTag(tag, margin)),
    uses: (words) => words.map((_, i) => use(words, i)),
    role,
  };
}
