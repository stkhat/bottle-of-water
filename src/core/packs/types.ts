/** Shapes of the bundled pack files in public/packs/ (see docs/plans/2026-11-09-m2-data-import.md). */

/** en/lemmas.json: inflected form → base form(s). */
export type LemmaPack = Readonly<Record<string, string | readonly string[]>>;
/** en/ipa.json: word → US IPA. */
export type IpaPack = Readonly<Record<string, string>>;
/** en/freq.json: base forms in rank order (index 0 = rank 1). */
export type FreqPack = readonly string[];
/** en/pos.json: word → parts of speech. */
export type PosPack = Readonly<Record<string, readonly string[]>>;
/** en-ja/dict.json: headword → [short gloss, senses]. */
export type DictPack = Readonly<
  Record<string, readonly [short: string, senses: readonly string[]]>
>;
