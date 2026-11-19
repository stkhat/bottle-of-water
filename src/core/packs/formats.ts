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
  // 5: contractions.json (2026-11-19). 6: capitals.json (2026-11-19).
  en: 6,
  // 5: capital-only words in capital.json, with no lower-case entry (2026-11-19).
  "en-ja": 5,
  "en-defs": 1,
  // 2: pos.json and tagger.json (2026-11-18). 3: lemmas in shards, lemmas/ (2026-11-19).
  // 4: names.json (2026-11-19).
  es: 4,
  "es-en": 1,
  // 2: tagger.json (2026-11-19). 3: detected phrases, read with elisions split, pronominal
  // verbs and hyphenated compounds (2026-11-20).
  fr: 3,
  "fr-en": 1,
  de: 1,
  "de-en": 1,
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
  "fr",
  "de",
] as const satisfies readonly PackName[];

/**
 * The definitions packs (English Wiktionary's definitions, loaded as `{ defs }`), by the
 * language their definitions are written in. In a dictionary into another native
 * language such a pack is a fallback (`fallbacksOf`): it gives the meanings of the
 * terms the dictionary's own pack lacks, translated at display time.
 */
export const DEFINITION_PACKS = {
  "en-defs": "en",
  "es-en": "en",
  "fr-en": "en",
  "de-en": "en",
} as const satisfies Partial<Record<PackName, string>>;

export type DefinitionPack = keyof typeof DEFINITION_PACKS;

/**
 * The dictionaries no recipe builds: EJDict's, and English Wiktionary's for Spanish,
 * French and German.
 */
const BUILT_OTHERWISE = {
  "en-ja": ["en", "en-ja", "en-defs"],
  "es-en": ["es", "es-en"],
  "fr-en": ["fr", "fr-en"],
  "de-en": ["de", "de-en"],
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
  "fr-en": BUILT_OTHERWISE["fr-en"],
  "de-en": BUILT_OTHERWISE["de-en"],
};
