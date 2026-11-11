import { learningLanguages, nativeLanguages } from "../languages";
import { own } from "../util";
import type { PackName } from "./load";

/** The learning languages with a language pack, which is named after the language. */
export const LANGUAGE_PACKS = [
  "en",
  "es",
] as const satisfies readonly PackName[];

/** The packs each dictionary ("<from>-<to>") is built from. */
export const DICTIONARY_PACKS = {
  "en-ja": ["en", "en-ja", "en-defs"],
  "es-en": ["es", "es-en"],
  "en-es": ["en", "en-es", "en-defs"],
  "en-pt": ["en", "en-pt", "en-defs"],
} as const satisfies Readonly<Record<string, readonly PackName[]>>;

/**
 * The packs a language pair needs: the learning language's pack, then the other packs
 * of its dictionary into the native language. An unknown language or pair needs nothing.
 */
export function packsFor(learning: string, native: string): PackName[] {
  const pack = LANGUAGE_PACKS.find((lang) => lang === learning);
  return [
    ...new Set([
      ...(pack ? [pack] : []),
      ...(own<readonly PackName[]>(DICTIONARY_PACKS, `${learning}-${native}`) ??
        []),
    ]),
  ];
}

export interface LanguagePair {
  learning: string;
  native: string;
}

/** The offered pairs whose packs include `pack`, in the order Settings offers them. */
export function pairsOfPack(pack: string): LanguagePair[] {
  return learningLanguages().flatMap((learning) =>
    nativeLanguages(learning)
      .filter((native) =>
        (packsFor(learning, native) as string[]).includes(pack),
      )
      .map((native) => ({ learning, native })),
  );
}

/** The key machine translations of a pair are cached under ("en>ja"). */
export const translationPair = (lang: string, nativeLang: string) =>
  `${lang}>${nativeLang}`;
