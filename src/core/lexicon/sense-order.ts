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
  preposition: [
    "preposition",
    "conjunction",
    "particle",
    "prepositional phrase",
  ],
  adverb: ["adverb", "particle"],
};

/** Whether a sense labelled `label` can be what a word tagged `pos` means. */
export const accepts = (pos: string, label: string | undefined) =>
  label !== undefined &&
  (Object.hasOwn(ACCEPTS, pos) ? ACCEPTS[pos]! : [pos]).includes(label);

/**
 * The order to show `senses` in for a word tagged `pos`, or undefined to keep the
 * dictionary's. The first usable sense (`usable`: one with a line to show) stays first
 * unless there is positive evidence against it: its label is stated (not a guess from
 * its neighbours; a guess that also fits an adverb does not count against an adverb)
 * and conflicts with the tag, and the entry has senses of the tagged part of speech.
 * Then those come first — with the unlabelled senses right before one of them, which
 * head its block (EJDict: "企て,試み" before the labelled nouns of "attempt") — the
 * first core translation among them leading when the source marks one (EJDict's 『』).
 */
export function senseOrder(
  senses: readonly Sense[],
  pos: string,
  usable: (index: number) => boolean = () => true,
): number[] | undefined {
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

/** `items` in `order` (all of them as they are without one). */
export const inOrder = <T>(
  items: readonly T[],
  order: readonly number[] | undefined,
) => (order === undefined ? [...items] : order.map((i) => items[i]!));
