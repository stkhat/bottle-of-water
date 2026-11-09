import type { DictPack, PosPack } from "./types";

export interface Sense {
  pos?: string;
  text: string;
}
export interface Entry {
  short: string;
  senses: Sense[];
}

// Checked in this order; the first one that is among the word's parts of speech wins.
const ENDINGS: readonly [pos: string, ending: RegExp][] = [
  ["verb", /(する|る|う|く|す|つ|む|ぶ|ぐ|ぬ)$/],
  ["adjective", /(的な|な|い|の)$/],
  ["adverb", /(に|く|て|と)$/],
];

/** The gloss without notes (《》〈〉()[]) or 『』 marks, for reading its ending. */
function glossOf(sense: string): string {
  let out = "";
  let depth = 0;
  for (const ch of sense) {
    if ("《〈(（[".includes(ch)) depth++;
    else if ("》〉)）]".includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch !== "『" && ch !== "』") out += ch;
  }
  return out.replace(/[\s,、;。]+$/, "");
}

function inferPos(
  sense: string,
  candidates: readonly string[],
): string | undefined {
  const gloss = glossOf(sense);
  for (const [pos, ending] of ENDINGS) {
    if (!candidates.includes(pos)) continue;
    if (ending.test(gloss) || (pos === "verb" && sense.includes("…を")))
      return pos;
  }
  return undefined;
}

/**
 * Dictionary entry for a word or phrase. Senses are labeled with the part of speech
 * when the word has only one, or when the Japanese gloss ending points to one of its
 * parts of speech (verb, adjective, adverb).
 */
export function lookup(
  term: string,
  dict: DictPack,
  pos: PosPack,
): Entry | undefined {
  const key = term.toLowerCase();
  if (!Object.hasOwn(dict, key)) return undefined;
  const [short, senses] = dict[key]!;
  const candidates = Object.hasOwn(pos, key) ? (pos[key] ?? []) : [];
  return {
    short,
    senses: senses.map((text) => {
      const label =
        candidates.length === 1 ? candidates[0] : inferPos(text, candidates);
      return label === undefined ? { text } : { pos: label, text };
    }),
  };
}
