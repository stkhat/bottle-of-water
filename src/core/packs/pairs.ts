import { learningLanguages, nativeLanguages } from "../languages";
import type { PackName } from "./load";

/**
 * The packs each learning language's pack is built from. The background's recipes
 * (`src/background/language-resources.ts`) load exactly these.
 */
export const LANGUAGE_PACK_PACKS = {
  en: ["en"],
  es: ["es"],
} as const satisfies Readonly<Record<string, readonly PackName[]>>;

/** The packs each dictionary ("<from>-<to>") is built from, as its recipe loads them. */
export const DICTIONARY_PACKS = {
  "en-ja": ["en", "en-ja", "en-defs"],
  "es-en": ["es", "es-en"],
  "en-es": ["en", "en-es", "en-defs"],
  "en-pt": ["en", "en-pt", "en-defs"],
} as const satisfies Readonly<Record<string, readonly PackName[]>>;

const entry = <T extends object>(table: T, key: string) =>
  Object.hasOwn(table, key) ? table[key as keyof T] : undefined;

/** The packs of a learning language's pack; undefined for a language without one. */
export const languagePackPacks = (
  lang: string,
): readonly PackName[] | undefined => entry(LANGUAGE_PACK_PACKS, lang);

/** The packs of a dictionary; undefined for a pair without one. */
export const dictionaryPacks = (
  from: string,
  to: string,
): readonly PackName[] | undefined => entry(DICTIONARY_PACKS, `${from}-${to}`);

/**
 * The packs a language pair needs: the learning language's pack, then the other packs
 * of its dictionary into the native language. What has no recipe is left out (an
 * unknown language or pair needs nothing).
 */
export function packsFor(learning: string, native: string): PackName[] {
  return [
    ...new Set([
      ...(languagePackPacks(learning) ?? []),
      ...(dictionaryPacks(learning, native) ?? []),
    ]),
  ];
}

/** A language pair the settings offer. */
export interface LanguagePair {
  learning: string;
  native: string;
}

/**
 * The pair whose data a pack is, as Settings names it ("Spanish → English"): the first
 * pair the settings offer, in their order, whose packs include it. Undefined for a pack
 * no offered pair uses.
 */
export function pairOfPack(pack: string): LanguagePair | undefined {
  for (const learning of learningLanguages())
    for (const native of nativeLanguages(learning))
      if ((packsFor(learning, native) as string[]).includes(pack))
        return { learning, native };
  return undefined;
}
