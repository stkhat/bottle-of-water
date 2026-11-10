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

/** An entry as a source has it, with the language of its glosses when that is not `to`. */
type Found = Entry & { glossLang?: string };

/**
 * A dictionary over `find`, which looks a normalized term up: entries get the term's IPA
 * and are phrases when the term has more than one word.
 */
function dictionaryOver(
  from: string,
  to: string,
  ipa: IpaPack,
  find: (head: string) => Found | undefined,
): DictionaryProvider {
  return {
    from,
    to,
    short: (term) => find(normalize(term))?.short,
    entry: (term) => {
      const head = normalize(term);
      const found = find(head);
      if (!found) return undefined;
      const headIpa = ipaFor(head, ipa);
      return {
        head,
        kind: head.includes(" ") ? "phrase" : "word",
        ...(headIpa !== undefined && { ipa: headIpa }),
        short: found.short,
        senses: found.senses,
        ...(found.glossLang !== undefined && { glossLang: found.glossLang }),
      };
    },
  };
}

/**
 * English → Japanese with IPA from Wiktionary. A term is looked up in EJDict, then in
 * Wiktionary's Japanese translations of phrases, then in Wiktionary's English
 * definitions of phrases (marked with `glossLang: "en"`).
 */
export function createEnJaDictionary(
  data: EnJaDictionaryData,
): DictionaryProvider {
  return dictionaryOver("en", "ja", data.ipa, (head) => {
    const found =
      lookup(head, data.dict, data.pos) ?? lookup(head, data.phrases, NO_POS);
    if (found) return found;
    const definition = definitionOf(head, data.defs);
    return definition && { ...definition, glossLang: "en" };
  });
}

export interface DefsDictionaryData {
  from: string;
  to: string;
  /** <from>-<to>/dict-<n>.json, merged: meanings in `to`, each sense with its pos */
  defs: DefsPack;
  /** <from>/ipa.json */
  ipa: IpaPack;
}

/**
 * A dictionary whose senses carry their part of speech, with meanings in the `to`
 * language (Spanish → English from Wiktionary) and IPA from the learning language's pack.
 */
export function createDefsDictionary({
  from,
  to,
  defs,
  ipa,
}: DefsDictionaryData): DictionaryProvider {
  return dictionaryOver(from, to, ipa, (head) => definitionOf(head, defs));
}

/** A DefsPack entry as an `Entry`. */
function definitionOf(head: string, defs: DefsPack): Entry | undefined {
  if (!Object.hasOwn(defs, head)) return undefined;
  const [short, senses] = defs[head]!;
  return { short, senses: senses.map(([pos, text]) => ({ pos, text })) };
}
