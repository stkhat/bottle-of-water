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
   * pass the gate needs none.
   */
  edition?: { tag: string; file: string };
  /** English Wiktionary's translation tables: the codes kaikki gives the language's translations. */
  tables: { langCodes: string[] };
  /**
   * Open Multilingual Wordnet 1.4 wordnets of the language, after the tables, each a
   * source of its own under its OMW id ("omw-it": data/raw/omw/omw-1.4/omw-it/omw-it.xml).
   * Only wordnets whose license the packs allow (architecture.md "Licenses").
   */
  wordnets?: string[];
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
};

/** A recipe's source tags, in order. */
export const recipeTags = (recipe: Recipe) => [
  ...(recipe.edition ? [recipe.edition.tag] : []),
  TABLES_TAG,
  ...(recipe.wordnets ?? []),
];
