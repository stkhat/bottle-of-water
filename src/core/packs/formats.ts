// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only, but for the native-language registry (whose own imports are type-only).
import {
  NATIVE_LANGUAGES,
  recipeNatives,
  type RecipePairPack,
} from "../natives.ts";
import type { PackName } from "./load";

/** The pair packs the recipes build, from the native-language registry. */
const RECIPE_PAIRS = recipeNatives().map(
  (native) => [`en-${native}` as RecipePairPack, native] as const,
);

/**
 * The data format of each pack that this code reads. A stored pack version in another
 * format is not used (it counts as missing until the lock's version is downloaded).
 * Bump a pack's number with any change to how its files are read (a recipe pair's in
 * `NATIVE_LANGUAGES`); the data must then be built and published again in that format
 * (`npm run data:publish` writes the lock), which formats.test.ts checks.
 */
export const PACK_FORMATS: Readonly<Record<PackName, number>> = {
  en: 4,
  "en-ja": 4,
  "en-defs": 1,
  es: 1,
  "es-en": 1,
  ...(Object.fromEntries(
    RECIPE_PAIRS.map(([pack, native]) => [
      pack,
      NATIVE_LANGUAGES[native].englishPair.format,
    ]),
  ) as Record<RecipePairPack, number>),
};

/** The learning languages with a language pack, which is named after the language. */
export const LANGUAGE_PACKS = [
  "en",
  "es",
] as const satisfies readonly PackName[];

/** The dictionaries no recipe builds: EJDict's, and English Wiktionary's for Spanish. */
const BUILT_OTHERWISE = {
  "en-ja": ["en", "en-ja", "en-defs"],
  "es-en": ["es", "es-en"],
} as const satisfies Readonly<Record<string, readonly PackName[]>>;

type RecipeDictionaries = {
  readonly [P in RecipePairPack]: readonly ["en", P, "en-defs"];
};

/**
 * The packs each dictionary ("<learning>-<native>") is built from, each learning
 * language's default native language first. The data scripts gate these pairs.
 */
export const DICTIONARY_PACKS: typeof BUILT_OTHERWISE & RecipeDictionaries = {
  "en-ja": BUILT_OTHERWISE["en-ja"],
  // A recipe pair: its meanings, then the English definitions.
  ...(Object.fromEntries(
    RECIPE_PAIRS.map(([pack]) => [pack, ["en", pack, "en-defs"]]),
  ) as unknown as RecipeDictionaries),
  "es-en": BUILT_OTHERWISE["es-en"],
};
