import type {
  DefsPack,
  DictPack,
  IpaPack,
  PairPack,
  PosPack,
} from "../packs/types";
import { kindOfKey } from "../term-id";
import { own } from "../util";
import { ipaFor } from "./ipa";
import { lookup, type Entry, type Sense } from "./lookup";

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
   * Language of `short` and `senses` when it is not the native language (an English
   * definition of a phrase no translation covers: "en").
   */
  glossLang?: string;
}

export interface DictionaryProvider {
  entry(term: string): DictionaryEntry | undefined;
}

export interface EnJaDictionaryData {
  /** en-ja/dict-<n>.json: EJDict */
  dict: DictPack;
  /** en-ja/phrases.json: Japanese translations of phrases EJDict lacks */
  phrases: DictPack;
  /** en-defs: English definitions of phrases neither has */
  defs: DefsPack;
  pos: PosPack;
  ipa: IpaPack;
}

/** A term key: lowercase words separated by single spaces. */
const normalize = (term: string) =>
  term.toLowerCase().split(/\s+/).filter(Boolean).join(" ");

const NO_POS: PosPack = {};

/** An entry as a source has it, with the language of its glosses when that is not the native one. */
type Found = Entry & { glossLang?: string };

function dictionaryOver(
  ipa: IpaPack,
  find: (head: string) => Found | undefined,
): DictionaryProvider {
  return {
    entry: (term) => {
      const head = normalize(term);
      const found = find(head);
      if (!found) return undefined;
      const headIpa = ipaFor(head, ipa);
      return {
        head,
        kind: kindOfKey(head),
        ...(headIpa !== undefined && { ipa: headIpa }),
        short: found.short,
        senses: found.senses,
        ...(found.glossLang !== undefined && { glossLang: found.glossLang }),
      };
    },
  };
}

/**
 * English → Japanese: EJDict, then Wiktionary's Japanese translations of phrases, then
 * Wiktionary's English definitions of phrases (`glossLang: "en"`).
 */
export function createEnJaDictionary(
  data: EnJaDictionaryData,
): DictionaryProvider {
  return dictionaryOver(data.ipa, (head) => {
    const found =
      lookup(head, data.dict, data.pos) ?? lookup(head, data.phrases, NO_POS);
    if (found) return found;
    const definition = definitionOf(head, data.defs);
    return definition && { ...definition, glossLang: "en" };
  });
}

/** Senses with their part of speech, already in the native language (Spanish → English). */
export function createDefsDictionary({
  defs,
  ipa,
}: {
  defs: DefsPack;
  ipa: IpaPack;
}): DictionaryProvider {
  return dictionaryOver(ipa, (head) => definitionOf(head, defs));
}

/**
 * A dictionary built by a recipe (English → Spanish): the pair pack, whose senses from
 * translation tables carry their English sense as a hint, then the English definitions
 * (`glossLang: "en"`, translated at display time).
 */
export function createPairDictionary({
  dict,
  defs,
  ipa,
}: {
  dict: PairPack;
  defs: DefsPack;
  ipa: IpaPack;
}): DictionaryProvider {
  return dictionaryOver(ipa, (head) => {
    const found = own(dict, head);
    if (found) {
      const [short, senses] = found;
      return {
        short,
        senses: senses.map(([pos, text, hint]) => ({
          pos,
          text,
          ...(hint !== undefined && { hint }),
        })),
      };
    }
    const definition = definitionOf(head, defs);
    return definition && { ...definition, glossLang: "en" };
  });
}

function definitionOf(head: string, defs: DefsPack): Entry | undefined {
  const found = own(defs, head);
  if (!found) return undefined;
  const [short, senses] = found;
  return { short, senses: senses.map(([pos, text]) => ({ pos, text })) };
}
