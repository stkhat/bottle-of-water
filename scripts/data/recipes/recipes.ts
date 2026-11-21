// The recipe of each English → native pair dictionary: which sources it merges, in
// order (docs/specs/architecture.md "Native meanings and the quality gate"). native.ts
// builds them; scripts/data/formats.ts names each source's license and authors. Kept
// free of value imports, so both can read it.
import type { RecipeNative } from "../../../src/core/natives.ts";
import type { LearningPairName } from "../../../src/core/packs/formats.ts";

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
  edition?: {
    tag: string;
    file: string;
    afterTables?: boolean;
  };
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
  /**
   * Reversed tables (round 4's S2, `reversed-tables.ts`): the edition's own words whose
   * translation tables list the English term (the Thai edition's "สุนัข" lists dog),
   * after the wordnets. Read from the edition's file; its tag is
   * "<native>wiktionary-translations".
   */
  reversedTables?: { tag: string };
  /**
   * Reverse glosses (round 4's S1, `reverse-glosses.ts`): English Wiktionary's entries
   * of the language's words whose gloss names the English term exactly, the last
   * source (user, 2026-11-21: they lost blind to the tables, so they only fill what no
   * other source has). kaikki's extract of the language (kaikki-<native>.jsonl); tag
   * "enwiktionary-<native>".
   */
  reverseGlosses?: { tag: string; file: string };
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
  th: {
    edition: {
      tag: "thwiktionary",
      file: "kaikki-th-edition.jsonl",
      afterTables: true,
    },
    tables: { langCodes: ["th"] },
    wordnets: ["omw-th"],
    reversedTables: { tag: "thwiktionary-translations" },
    reverseGlosses: { tag: "enwiktionary-th", file: "kaikki-th.jsonl" },
  },
};

/** A recipe's source tags, in order. */
export function recipeTags(recipe: Recipe): string[] {
  const { edition } = recipe;
  const first = edition && !edition.afterTables;
  return [
    ...(first ? [edition.tag] : []),
    TABLES_TAG,
    ...(edition?.afterTables ? [edition.tag] : []),
    ...(recipe.wordnets ?? []),
    ...(recipe.reversedTables ? [recipe.reversedTables.tag] : []),
    ...(recipe.reverseGlosses ? [recipe.reverseGlosses.tag] : []),
  ];
}

/**
 * Each Wiktionary edition's bot imports whose text Langle cannot use, by edition code:
 * the pages a bot created without saying where their text came from (no edit summary),
 * or with a summary naming a source whose license is unknown (`comment`). Every build
 * that reads the edition leaves their entries out (provenance; `undocumentedPages`):
 * the English pair's edition source and reversed tables (en-fr, en-th), a learning
 * pair's edition and reversed tables (de-fr), and the learning pack's own-edition
 * examples and pronunciations (fr).
 * Wiktionnaire: PiedBot's 2005–2006 batches, 76,335 pages (L3: of its German entries,
 * about half of the French glosses are not in de.wiktionary's rows of the time; its
 * English batches of January and May 2006 gave a quarter of en-fr's Wiktionnaire
 * terms). The Thai edition: ZilentBot's 2018 import of NECTEC's LEXiTRON ("นำเข้าคำจาก
 * Lexitron", 1,542 pages, the {{lexitronimport}} notice), whose license terms could
 * not be found (D5). Read from Wikimedia's MediaWiki history dump of the edition
 * (data/raw/mediawiki-history/, a file per year or one for all time: `files`).
 */
export const UNDOCUMENTED_IMPORTS: Readonly<
  Partial<
    Record<string, { files: readonly string[]; user: string; comment?: string }>
  >
> = {
  fr: {
    files: [
      "2026-10.frwiktionary.2005.tsv.bz2",
      "2026-10.frwiktionary.2006.tsv.bz2",
    ],
    user: "PiedBot",
  },
  th: {
    files: ["2026-10.thwiktionary.all-time.tsv.bz2"],
    user: "ZilentBot",
    comment: "นำเข้าคำจาก Lexitron",
  },
};

/** The sources a learning-language pair recipe reads (L3). */
export type LearningSourceKind = "edition" | "tables" | "reversed";

/**
 * How a pair from a learning language other than English into another native language
 * is built (scripts/data/recipes/learning-pairs.ts): its sources in order of
 * preference, each term coming whole from the first that has it (judged blind per
 * pair: docs/notes/translation-data-expansion.md "L3"):
 * - `edition`: the native language's Wiktionary edition's entries for the learning
 *   language's words (Wiktionnaire's German entries: Hund → chien);
 * - `tables`: the learning language's own edition's translation tables, rows into the
 *   native language (de.wiktionary's Hund → chien), with the learning language's sense
 *   as the hint;
 * - `reversed`: the native edition's own words whose translation tables list the
 *   learning-language word (Wiktionnaire's chien lists Hund).
 */
export interface LearningRecipe {
  order: readonly LearningSourceKind[];
  /** The tables' language codes for the native language (kaikki codes Mandarin cmn too). */
  tables?: { langCodes: string[] };
  /** Chinese in simplified characters (`Recipe.simplified`). */
  simplified?: boolean;
}

/** The learning-language pairs a recipe builds and Settings may offer. */
export const LEARNING_RECIPES: Readonly<
  Record<LearningPairName, LearningRecipe>
> = {
  // de.wiktionary's French rows first, then Wiktionnaire's French words whose tables
  // list the German word, then Wiktionnaire's German entries (judged blind, L3:
  // tables over the edition 42 : 33, over reversed tables 36 : 20; reversed tables
  // over the edition 44 : 32, words and corpus tokens together).
  "de-fr": {
    order: ["tables", "reversed", "edition"],
  },
};

/** The source tag of each kind of a learning pair's sources ("frwiktionary-de"). */
export function learningRecipeTags(
  pair: string,
): Record<LearningSourceKind, string> {
  const [learning = "", native = ""] = pair.split("-");
  return {
    edition: `${native}wiktionary-${learning}`,
    tables: `${learning}wiktionary-translations`,
    reversed: `${native}wiktionary-translations`,
  };
}
