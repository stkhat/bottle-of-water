// The recipe of each English → native pair dictionary: which sources it merges, in
// order (docs/specs/architecture.md "Native meanings and the quality gate"). native.ts
// builds them; scripts/data/formats.ts names each source's license and authors. Kept
// free of value imports, so both can read it.
import type { RecipeNative } from "../../../src/core/natives.ts";

/** The tag of English Wiktionary's translation tables in a pair pack's sources. */
export const TABLES_TAG = "enwiktionary-translations";

/**
 * How an English → native dictionary is built: its sources in order of preference,
 * each term coming whole from the first that has it. Each source's license and authors
 * are in scripts/data/formats.ts (`RECIPE_SOURCES`, by tag).
 */
export interface Recipe {
  /**
   * The native language's Wiktionary edition (kaikki's extract of it), first: when it
   * defines the English words in the language. A language whose translation tables
   * pass the gate needs none. `afterTables`: the edition only fills the terms the
   * tables lack, for an edition whose glosses describe more than they translate, or
   * carry its own labels and markup, where the tables' words read better (judged
   * blind per language: docs/notes/translation-data-expansion.md).
   */
  edition?: { tag: string; file: string; afterTables?: boolean };
  /**
   * English Wiktionary's translation tables: the codes kaikki gives the language's
   * translations, and for a language whose tables nest varieties under it, the
   * variety's rows only (kaikki's language names: "Chinese Mandarin").
   */
  tables: { langCodes: string[]; langs?: string[] };
  /**
   * Open Multilingual Wordnet 1.4 wordnets of the language, after the tables, each a
   * source of its own under its OMW id ("omw-it": data/raw/omw/omw-1.4/omw-it/omw-it.xml).
   * Only wordnets whose license the packs allow (architecture.md "Licenses").
   */
  wordnets?: string[];
  /**
   * Chinese in simplified characters: a translation-table word keeps its simplified
   * form ("麵包 /面包" → 面包), and every source's text goes through OpenCC's
   * Traditional → Simplified conversion (`simplified.ts`), as the zh edition writes
   * traditional characters.
   */
  simplified?: boolean;
}

/**
 * The recipe of each native language whose English pair pack a recipe builds (those
 * with `englishPair` in src/core/natives.ts).
 */
export const RECIPES: Readonly<Record<RecipeNative, Recipe>> = {
  es: {
    edition: { tag: "eswiktionary", file: "kaikki-es-edition.jsonl" },
    tables: { langCodes: ["es"] },
  },
  pt: {
    edition: { tag: "ptwiktionary", file: "kaikki-pt-edition.jsonl" },
    tables: { langCodes: ["pt"] },
  },
  ru: {
    edition: {
      tag: "ruwiktionary",
      file: "kaikki-ru-edition.jsonl",
      afterTables: true,
    },
    tables: { langCodes: ["ru"] },
  },
  fr: {
    edition: { tag: "frwiktionary", file: "kaikki-fr-edition.jsonl" },
    tables: { langCodes: ["fr"] },
  },
  de: {
    edition: {
      tag: "dewiktionary",
      file: "kaikki-de-edition.jsonl",
      afterTables: true,
    },
    tables: { langCodes: ["de"] },
  },
  // Mandarin rows of the tables (kaikki codes them cmn or zh, and codes Hokkien and
  // Dungan rows zh too), then the zh edition, then the Chinese Open Wordnet; all in
  // simplified characters.
  zh: {
    edition: {
      tag: "zhwiktionary",
      file: "kaikki-zh-edition.jsonl",
      afterTables: true,
    },
    tables: { langCodes: ["cmn", "zh"], langs: ["Chinese Mandarin"] },
    wordnets: ["omw-cmn"],
    simplified: true,
  },
  it: {
    edition: {
      tag: "itwiktionary",
      file: "kaikki-it-edition.jsonl",
      afterTables: true,
    },
    tables: { langCodes: ["it"] },
    wordnets: ["omw-it", "omw-iwn"],
  },
  pl: {
    edition: { tag: "plwiktionary", file: "kaikki-pl-edition.jsonl" },
    tables: { langCodes: ["pl"] },
    wordnets: ["omw-pl"],
  },
};

/** A recipe's source tags, in order. */
export const recipeTags = (recipe: Recipe) => [
  ...(recipe.edition && !recipe.edition.afterTables
    ? [recipe.edition.tag]
    : []),
  TABLES_TAG,
  ...(recipe.edition?.afterTables ? [recipe.edition.tag] : []),
  ...(recipe.wordnets ?? []),
];
