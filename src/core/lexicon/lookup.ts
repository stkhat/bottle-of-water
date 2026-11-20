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
  /**
   * The source marks the sense as the verb's use as an auxiliary (a definitions pack's
   * "auxiliary": French avoir "used to form the compound tenses", aller "to be going
   * (to)"), which rule A2 puts first where the word is one.
   */
  auxiliary?: true;
  /**
   * The sense is a capitalised headword's, under a key a lowercase headword shares (a
   * definitions pack's "capital": German Sie, "you (polite)", under "sie"; Essen,
   * "food", under "essen"): shown first where the page writes the word capitalised in
   * a way that counts, and the card's headword is then capitalised.
   */
  capital?: true;
  /**
   * The number of a personal pronoun's sense (a definitions pack's "singular",
   * "plural": German sie's "she; her" and "they; them"): where the grammar reads the
   * pronoun's number from its verb ("sie sind"), the senses of the other number come
   * after (`senseOrder`).
   */
  number?: "singular" | "plural";
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
