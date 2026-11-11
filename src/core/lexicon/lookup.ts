import type { DictPack, PosPack } from "../packs/types";
import { own } from "../util";

export interface Sense {
  pos?: string;
  text: string;
  /**
   * The English sense a translation-table sense translates ("source of
   * illumination"), shown before its words.
   */
  hint?: string;
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

/** The sense as shown: without 『』 emphasis marks and 〈C〉/〈U〉 countability markers. */
function displayText(sense: string): string {
  return sense
    .replace(/〈[CU]〉/g, "")
    .replace(/[『』]/g, "")
    .trim();
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
  const found = own(dict, key);
  if (!found) return undefined;
  const [short, senses] = found;
  const candidates = own(pos, key) ?? [];
  return {
    short,
    senses: senses.map((raw) => {
      const label =
        candidates.length === 1 ? candidates[0] : inferPos(raw, candidates);
      const text = displayText(raw);
      return label === undefined ? { text } : { pos: label, text };
    }),
  };
}
