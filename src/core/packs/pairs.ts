import { learningLanguages, nativeLanguages } from "../languages";
import { own } from "../util";
import {
  DEFINITION_PACKS,
  DICTIONARY_PACKS,
  LANGUAGE_PACKS,
  type DefinitionPack,
} from "./formats";
import type { PackName } from "./load";

/** The native language of a dictionary ("en-ja" → "ja"). */
const nativeOf = (dictionary: string) => dictionary.split("-")[1] ?? "";

/**
 * The fallbacks of a dictionary ("<learning>-<native>"): its definitions packs written
 * in another language than the native one (en-defs in English → Japanese). The
 * dictionary works without them while they download: a term only they have waits for
 * them. English Wiktionary's definitions of Spanish are Spanish → English itself.
 */
export function fallbacksOf(dictionary: string): DefinitionPack[] {
  const native = nativeOf(dictionary);
  return (own<readonly PackName[]>(DICTIONARY_PACKS, dictionary) ?? []).filter(
    (pack): pack is DefinitionPack =>
      own<string>(DEFINITION_PACKS, pack) !== undefined &&
      own<string>(DEFINITION_PACKS, pack) !== native,
  );
}

/**
 * The packs a language pair needs, in the order they are downloaded: the learning
 * language's pack, then the other packs of its dictionary into the native language,
 * its fallbacks last (`fallbacksOf`): pages analyze and hovers show once the packs
 * before them are on the device. An unknown language or pair needs nothing.
 */
export function packsFor(learning: string, native: string): PackName[] {
  const pack = LANGUAGE_PACKS.find((lang) => lang === learning);
  const dictionary = `${learning}-${native}`;
  const fallbacks: readonly PackName[] = fallbacksOf(dictionary);
  const packs = [
    ...new Set([
      ...(pack ? [pack] : []),
      ...(own<readonly PackName[]>(DICTIONARY_PACKS, dictionary) ?? []),
    ]),
  ];
  return [
    ...packs.filter((name) => !fallbacks.includes(name)),
    ...packs.filter((name) => fallbacks.includes(name)),
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
