import { ipaFor } from "./packs/ipa";
import { lookup, type Entry, type Sense } from "./packs/lookup";
import type { DefsPack, DictPack, IpaPack, PosPack } from "./packs/types";

export type { Sense };

export interface DictionaryEntry {
  /** The term as looked up: a base form, or a phrase's base forms joined by spaces. */
  head: string;
  kind: "word" | "phrase";
  ipa?: string;
  /** Short translation for the hover card. */
  short: string;
  senses: Sense[];
  /**
   * Language of `short` and `senses` when it is not the dictionary's `to` language
   * (an English definition of a phrase no translation covers: "en").
   */
  glossLang?: string;
}

/** Short translations and dictionary entries from the learning language to the native one. */
export interface DictionaryProvider {
  readonly from: string;
  readonly to: string;
  short(term: string): string | undefined;
  entry(term: string): DictionaryEntry | undefined;
}

export interface EnJaDictionaryData {
  /** en-ja/dict-<n>.json, merged: EJDict */
  dict: DictPack;
  /** en-ja/phrases.json: Japanese translations of phrases EJDict lacks */
  phrases: DictPack;
  /** en-defs/dict-<n>.json, merged: English definitions of phrases neither has */
  defs: DefsPack;
  /** en/pos.json */
  pos: PosPack;
  /** en/ipa.json */
  ipa: IpaPack;
}

/** A term key: lowercase words separated by single spaces. */
function normalize(term: string): string {
  return term.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

const NO_POS: PosPack = {};

/**
 * English → Japanese with IPA from Wiktionary. A term is looked up in EJDict, then in
 * Wiktionary's Japanese translations of phrases, then in Wiktionary's English
 * definitions of phrases (marked with `glossLang: "en"`).
 */
export function createEnJaDictionary(
  data: EnJaDictionaryData,
): DictionaryProvider {
  const find = (head: string): (Entry & { glossLang?: string }) | undefined =>
    lookup(head, data.dict, data.pos) ??
    lookup(head, data.phrases, NO_POS) ??
    definitionOf(head, data.defs);
  return {
    from: "en",
    to: "ja",
    short: (term) => find(normalize(term))?.short,
    entry: (term) => {
      const head = normalize(term);
      const found = find(head);
      if (!found) return undefined;
      const ipa = ipaFor(head, data.ipa);
      return {
        head,
        kind: head.includes(" ") ? "phrase" : "word",
        ...(ipa !== undefined && { ipa }),
        short: found.short,
        senses: found.senses,
        ...(found.glossLang !== undefined && { glossLang: found.glossLang }),
      };
    },
  };
}

function definitionOf(
  head: string,
  defs: DefsPack,
): (Entry & { glossLang: string }) | undefined {
  if (!Object.hasOwn(defs, head)) return undefined;
  const [short, senses] = defs[head]!;
  return {
    short,
    senses: senses.map(([pos, text]) => ({ pos, text })),
    glossLang: "en",
  };
}
