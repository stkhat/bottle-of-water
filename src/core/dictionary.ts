import { ipaFor } from "./packs/ipa";
import { lookup, type Sense } from "./packs/lookup";
import type { DictPack, IpaPack, PosPack } from "./packs/types";

export type { Sense };

export interface DictionaryEntry {
  /** The term as looked up: a base form, or a phrase's base forms joined by spaces. */
  head: string;
  kind: "word" | "phrase";
  ipa?: string;
  /** Short translation for the hover card. */
  short: string;
  senses: Sense[];
}

/** Short translations and dictionary entries from the learning language to the native one. */
export interface DictionaryProvider {
  readonly from: string;
  readonly to: string;
  short(term: string): string | undefined;
  entry(term: string): DictionaryEntry | undefined;
}

export interface EnJaDictionaryData {
  /** en-ja/dict-<n>.json, merged */
  dict: DictPack;
  /** en/pos.json */
  pos: PosPack;
  /** en/ipa.json */
  ipa: IpaPack;
}

/** A term key: lowercase words separated by single spaces. */
function normalize(term: string): string {
  return term.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/** English → Japanese from the bundled EJDict pack, with IPA from Wiktionary. */
export function createEnJaDictionary(
  data: EnJaDictionaryData,
): DictionaryProvider {
  return {
    from: "en",
    to: "ja",
    short: (term) => lookup(normalize(term), data.dict, data.pos)?.short,
    entry: (term) => {
      const head = normalize(term);
      const found = lookup(head, data.dict, data.pos);
      if (!found) return undefined;
      const ipa = ipaFor(head, data.ipa);
      return {
        head,
        kind: head.includes(" ") ? "phrase" : "word",
        ...(ipa !== undefined && { ipa }),
        short: found.short,
        senses: found.senses,
      };
    },
  };
}
