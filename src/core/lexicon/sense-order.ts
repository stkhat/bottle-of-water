/**
 * Rule A2: the senses of the part of speech a word is tagged with here, first.
 * Language-independent: it reads only the senses' labels (a source's own, or the data
 * build's) and the tag's part of speech (`Span.pos`).
 */
import type { Sense } from "./lookup";

/**
 * The sense labels a tag's part of speech accepts: sources label a little differently
 * (the tagger calls "nothing" a noun, Wiktionary has articles and particles).
 */
const ACCEPTS: Readonly<Record<string, readonly string[]>> = {
  noun: ["noun", "pronoun", "proper noun"],
  determiner: ["determiner", "article"],
  interjection: ["interjection", "particle"],
  particle: ["particle", "preposition"],
  // A preposition joined to an article ("des": de + les, "del") is tagged a preposition.
  preposition: [
    "preposition",
    "conjunction",
    "particle",
    "prepositional phrase",
    "contraction",
  ],
  adverb: ["adverb", "particle"],
};

/**
 * The part of speech of a word used as an auxiliary ("has" in "has been"): no source
 * labels a sense so, so rule A2 puts first only the senses its source calls auxiliary
 * (`AUXILIARY_SENSE`) and otherwise keeps the dictionary's order, and a pair
 * dictionary shows its grammar pointer however wide ("Pair pointers").
 */
export const AUXILIARY = "auxiliary";

/**
 * The part of speech of an auxiliary looked up by its base for want of an entry of its
 * own (en-ru "has been" → have): its senses come in AUXILIARY's order, but where the
 * base has none its source calls auxiliary, the hover shows no meaning (`entry`'s
 * `lines` empty): the base's lexical meanings ("иметь", to own) are not what the word
 * means there, and the card's grammar line ("has → have") is.
 */
export const AUXILIARY_BASE = "auxiliary base";

/**
 * The part of speech of a verb the grammar reads as pronominal ("il se passe", "je
 * m'appelle"; `WordUse.pronominal`): the senses its source labels REFLEXIVE come
 * first, else it is read as the verb it is.
 */
export const PRONOMINAL = "pronominal";

/**
 * The label a learning pack gives a pronominal verb's senses its source tags
 * reflexive (French passer: "to take place, to happen"): what the verb means where
 * the grammar reads it as pronominal, and no verb's sense where it reads a plain verb
 * ("il passe": to pass).
 */
const REFLEXIVE = "reflexive";

/** A word used as an auxiliary, with or without an entry of its own. */
export const isAuxiliary = (pos: string | undefined) =>
  pos === AUXILIARY || pos === AUXILIARY_BASE;

/**
 * A translation table's English sense that says it is an auxiliary's (English
 * Wiktionary's "auxiliary used in forming the perfect", "auxiliary: used to form the
 * passive voice"): what a verb means where it is used as one (en-it "has been" → have
 * → avere, essere before avere, tenere).
 */
const AUXILIARY_SENSE = /\bauxiliary\b/i;

/**
 * The source calls the sense an auxiliary's: a learning pack marks it so
 * (`Sense.auxiliary`), the data build labels it so (an edition's "haber (como verbo
 * auxiliar)": PAIR "Auxiliary senses"), or its English sense says so (`AUXILIARY_SENSE`).
 */
const auxiliarySense = (sense: Sense) =>
  sense.auxiliary === true ||
  sense.pos === AUXILIARY ||
  AUXILIARY_SENSE.test(sense.hint ?? "");

/** Some sense its source calls an auxiliary's (`auxiliarySense`). */
export const hasAuxiliarySense = (senses: readonly Sense[]) =>
  senses.some(auxiliarySense);

/** Whether a sense labelled `label` can be what a word tagged `pos` means. */
export const accepts = (pos: string, label: string | undefined) =>
  label !== undefined &&
  (Object.hasOwn(ACCEPTS, pos) ? ACCEPTS[pos]! : [pos]).includes(label);

/**
 * The open classes, which the tagger and the sources name alike; closed classes and
 * contractions they label differently (pt "all": adjective, the tagger's determiner;
 * "that's": contraction).
 */
const OPEN_CLASSES: readonly string[] = ["noun", "verb", "adjective", "adverb"];

/**
 * A sense labelled `label` cannot be what a word tagged `pos` means, on positive
 * evidence: both are open classes and the tag does not accept the label (better/JJR
 * and the verb "to improve"). A closed class, an auxiliary or an unknown label never
 * conflicts, as the sources and the tagger label those differently.
 */
export const conflicts = (pos: string, label: string | undefined) =>
  OPEN_CLASSES.includes(pos) &&
  label !== undefined &&
  OPEN_CLASSES.includes(label) &&
  !accepts(pos, label);

/**
 * An entry has no sense a word tagged `pos` can mean, on positive evidence: the tag
 * and every sense's label are open classes, each label stated (not taken from its
 * neighbours or guessed), and none accepts the tag (pt "other": only the verb "tratar
 * como diferente", read as an adjective). Never for an auxiliary, whose senses no
 * source labels so.
 */
export const lacksSenseOf = (senses: readonly Sense[], pos: string) =>
  OPEN_CLASSES.includes(pos) &&
  senses.length > 0 &&
  senses.every(
    (sense) =>
      sense.pos !== undefined &&
      OPEN_CLASSES.includes(sense.pos) &&
      sense.posBy === undefined &&
      !accepts(pos, sense.pos),
  );

/**
 * The order to show `senses` in for a word tagged `pos`, or undefined to keep the
 * dictionary's. The first usable sense (`usable`: one with a line to show) stays first
 * unless there is positive evidence against it: its label is stated (not a guess from
 * its neighbours; a guess that also fits an adverb does not count against an adverb)
 * and conflicts with the tag, and the entry has senses of the tagged part of speech.
 * Then those come first — with the unlabelled senses right before one of them, which
 * head its block (EJDict: "企て,試み" before the labelled nouns of "attempt") — the
 * first core translation among them leading when the source marks one (EJDict's 『』).
 * For an auxiliary (AUXILIARY), the senses its source calls auxiliary come first;
 * with none, a lead of another open class gives way to the verb's senses. For a
 * pronominal verb (PRONOMINAL), its REFLEXIVE senses, else the verb's.
 */
export function senseOrder(
  senses: readonly Sense[],
  pos: string,
  usable: (index: number) => boolean = () => true,
): number[] | undefined {
  if (pos === PRONOMINAL) {
    const lead = senses.findIndex((_, i) => usable(i));
    const front = senses
      .map((_, k) => k)
      .filter((k) => usable(k) && senses[k]!.pos === REFLEXIVE);
    if (front.length === 0) return senseOrder(senses, "verb", usable);
    if (front[0] === lead) return undefined;
    return [
      ...front,
      ...senses.map((_, k) => k).filter((k) => !front.includes(k)),
    ];
  }
  if (isAuxiliary(pos)) {
    if (hasAuxiliarySense(senses)) return auxiliaryOrder(senses, usable);
    // An auxiliary whose source calls none of its senses an auxiliary's is the verb
    // it is, where its lead is of another open class (French devoir before an
    // infinitive: "must", not the noun "duty").
    const lead = senses.find((_, i) => usable(i));
    return conflicts("verb", lead?.pos) && lead?.posBy === undefined
      ? senseOrder(senses, "verb", usable)
      : undefined;
  }
  const first = senses.findIndex((_, i) => usable(i));
  const lead = senses[first];
  if (
    !lead?.pos ||
    lead.posBy === "gap" ||
    (lead.posBy === "weak" && pos === "adverb") ||
    accepts(pos, lead.pos)
  )
    return undefined;
  const inBlock = (k: number) => {
    if (!usable(k)) return false;
    if (senses[k]!.pos !== undefined) return accepts(pos, senses[k]!.pos);
    const next = senses.slice(k + 1).find((sense) => sense.pos !== undefined);
    return accepts(pos, next?.pos);
  };
  const block = senses.map((_, k) => k).filter((k) => k > first && inBlock(k));
  if (block.length === 0) return undefined;
  const chosen = block.find((k) => senses[k]!.core) ?? block[0]!;
  const front = [chosen, ...block.filter((k) => k !== chosen)];
  return [
    ...front,
    ...senses.map((_, k) => k).filter((k) => !front.includes(k)),
  ];
}

/**
 * For a word used as an auxiliary: the usable senses its source calls auxiliary
 * (`auxiliarySense`) first, or undefined to keep the dictionary's order when none is
 * or they lead already.
 */
function auxiliaryOrder(
  senses: readonly Sense[],
  usable: (index: number) => boolean,
): number[] | undefined {
  const indices = senses.map((_, k) => k);
  const front = indices.filter((k) => usable(k) && auxiliarySense(senses[k]!));
  if (front.length === 0 || front[0] === indices.find(usable)) return undefined;
  return [...front, ...indices.filter((k) => !front.includes(k))];
}

/** `items` in `order` (all of them as they are without one). */
export const inOrder = <T>(
  items: readonly T[],
  order: readonly number[] | undefined,
) => (order === undefined ? [...items] : order.map((i) => items[i]!));
