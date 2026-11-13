import type { DictPack, PosPack, SensePosPack } from "../packs/types";
import { own } from "../util";
import { decodeSenseLabels, type LabelSource } from "./sense-labels";

export interface Sense {
  pos?: string;
  /**
   * How the data build found `pos` for a source without labels: a guess that also fits
   * an adverb ("weak"), or from the senses around it ("gap"). Missing: the sense says
   * it, or the source labels it.
   */
  posBy?: LabelSource;
  /** The source marks the sense as a core translation (EJDict's 『』). */
  core?: true;
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

/** The sense as shown: without 『』 emphasis marks and 〈C〉/〈U〉 countability markers. */
function displayText(sense: string): string {
  return sense
    .replace(/〈[CU]〉/g, "")
    .replace(/[『』]/g, "")
    .trim();
}

/**
 * Dictionary entry for a word or phrase. Senses are labeled with the part of speech
 * when the word has only one, or as the data build labelled them (`labels`,
 * en-ja/pos.json, or the entry's own third item) for a term with several.
 */
export function lookup(
  term: string,
  dict: DictPack,
  pos: PosPack,
  labels: SensePosPack = {},
): Entry | undefined {
  const key = term.toLowerCase();
  const found = own(dict, key);
  if (!found) return undefined;
  const [short, senses, ownLabels] = found;
  const candidates = own(pos, key) ?? [];
  const code = own(labels, key) ?? ownLabels;
  const decoded = code === undefined ? [] : decodeSenseLabels(code);
  return {
    short,
    senses: senses.map((raw, i) => {
      const text = displayText(raw);
      if (candidates.length === 1) return { pos: candidates[0]!, text };
      return { ...decoded[i], text };
    }),
  };
}
