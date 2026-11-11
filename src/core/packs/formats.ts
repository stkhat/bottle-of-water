import type { PackName } from "./load";

/**
 * The data format of each pack that this code reads. A stored pack version in another
 * format is not used (it counts as missing until the lock's version is downloaded).
 * Bump a pack's number with any change to how its files are read; the data must then
 * be built and published again in that format (scripts/data/formats.mjs and
 * `npm run data:publish`, which writes the lock), which formats.test.ts checks.
 */
export const PACK_FORMATS: Readonly<Record<PackName, number>> = {
  en: 1,
  "en-ja": 1,
  "en-defs": 1,
  es: 1,
  "es-en": 1,
  "en-es": 1,
  "en-pt": 1,
};
