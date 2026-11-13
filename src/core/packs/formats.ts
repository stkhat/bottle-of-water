// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { PackName } from "./load";

/**
 * The data format of each pack that this code reads. A stored pack version in another
 * format is not used (it counts as missing until the lock's version is downloaded).
 * Bump a pack's number with any change to how its files are read; the data must then
 * be built and published again in that format (`npm run data:publish` writes the
 * lock), which formats.test.ts checks.
 */
export const PACK_FORMATS: Readonly<Record<PackName, number>> = {
  en: 4,
  "en-ja": 4,
  "en-defs": 1,
  es: 1,
  "es-en": 1,
  "en-es": 1,
  "en-pt": 1,
};

/** The learning languages with a language pack, which is named after the language. */
export const LANGUAGE_PACKS = [
  "en",
  "es",
] as const satisfies readonly PackName[];

/**
 * The packs each dictionary ("<learning>-<native>") is built from, each learning
 * language's default native language first. The data scripts gate these pairs.
 */
export const DICTIONARY_PACKS = {
  "en-ja": ["en", "en-ja", "en-defs"],
  "en-es": ["en", "en-es", "en-defs"],
  "en-pt": ["en", "en-pt", "en-defs"],
  "es-en": ["es", "es-en"],
} as const satisfies Readonly<Record<string, readonly PackName[]>>;
