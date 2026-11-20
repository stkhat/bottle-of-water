// The English → <native> pair dictionaries, each built by its recipe → data/packs/
// en-<native>/{index,dict-<n>}.json. index.json names the sources, and each entry carries
// the index of its own (docs/specs/architecture.md "Native meanings and the quality gate").
// Usage: node scripts/data/recipes/native.ts <native>…   (e.g. es; run the English
// scripts first and download the recipe's raw files, see docs/development.md "Language
// data")
import { join } from "node:path";
import {
  nativeLanguage,
  type RecipeNative,
} from "../../../src/core/natives.ts";
import { capitalKey, degreeOf } from "../../../src/core/lexicon/short-lines.ts";
import type {
  LemmaPack,
  NamesPack,
  PosPack,
} from "../../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../../src/core/phrases/pattern.ts";
import {
  PACKS_DIR,
  KAIKKI_PATH,
  RAW_DIR,
  readPack,
  writeShards,
} from "../common.ts";
import { readWordnet, readWordnetMeanings } from "./omw.ts";
import { simplifiedConverter } from "./simplified.ts";
import {
  capitalDictionary,
  convertTerms,
  inCapitalCase,
  inTablesCase,
  isOtherWord,
  lastScriptForm,
  withAuxiliarySenses,
  mergeSources,
  nativeLetterOf,
  readEdition,
  readTranslationTables,
  termKeyOf,
  type PairSense,
  type SourceTerm,
  type TermKey,
} from "./recipe.ts";
import { RECIPES, TABLES_TAG, type Recipe } from "./recipes.ts";
import { undocumentedPages } from "./undocumented.ts";

/** The English wordnet, which links the pack's terms to the other wordnets' synsets. */
const ENGLISH_WORDNET = "omw-en";

const wordnetPath = (rawDir: string, id: string) =>
  join(rawDir, "omw", "omw-1.4", id, `${id}.xml`);

/** Reads the sources of `native`'s recipe (or of `recipe`) and merges them. */
export async function buildPairDictionary(
  native: string,
  {
    termKey,
    rawDir = RAW_DIR,
    englishPath = KAIKKI_PATH,
    recipe = Object.hasOwn(RECIPES, native)
      ? RECIPES[native as RecipeNative]
      : undefined,
    names = {},
    lemmas = {},
    contractions = {},
    pos = {},
  }: {
    termKey: TermKey;
    rawDir?: string;
    englishPath?: string;
    recipe?: Recipe;
    /** The English names lexicon (en/names.json), for capitalised headwords' meanings. */
    names?: NamesPack;
    /** What each English contraction is short for (en/contractions.json). */
    contractions?: Readonly<Record<string, readonly string[]>>;
    /** English base forms and parts of speech (en/lemmas.json, en/pos.json), to read degrees. */
    lemmas?: LemmaPack;
    pos?: PosPack;
  },
) {
  if (!recipe) throw new Error(`No recipe for en-${native}`);
  const { edition, tables, wordnets = [], simplified } = recipe;
  const toSimplified = simplified ? simplifiedConverter() : undefined;
  const scripts = nativeLanguage(native)?.scripts;
  const letter = scripts && nativeLetterOf(scripts);
  const [editionTerms, tableTerms] = await Promise.all([
    edition
      ? readEdition(join(rawDir, edition.file), termKey, {
          trimPeriod: true,
          native,
          // Entries on pages of an undocumented bot import are left out.
          leftOut: await undocumentedPages(native, rawDir),
          ...(toSimplified && { nativeForm: toSimplified }),
          ...(letter && { letter }),
        })
      : undefined,
    readTranslationTables(englishPath, {
      ...tables,
      termKey,
      ...(simplified && { word: lastScriptForm }),
      ...(letter && { letter }),
    }),
  ]);
  const sources: { tag: string; terms: Map<string, SourceTerm> }[] = [];
  // The capitalised headwords, from the same sources in the same order (so a term's
  // source index is the same), kept apart.
  const capitalSources: typeof sources = [];
  if (edition && editionTerms && !edition.afterTables) {
    sources.push({ tag: edition.tag, terms: editionTerms.terms });
    capitalSources.push({ tag: edition.tag, terms: editionTerms.capital });
  }
  sources.push({ tag: TABLES_TAG, terms: tableTerms.terms });
  capitalSources.push({ tag: TABLES_TAG, terms: tableTerms.capital });
  if (edition && editionTerms && edition.afterTables) {
    sources.push({ tag: edition.tag, terms: editionTerms.terms });
    capitalSources.push({ tag: edition.tag, terms: editionTerms.capital });
  }
  if (wordnets.length > 0) {
    const english = readWordnet(wordnetPath(rawDir, ENGLISH_WORDNET));
    for (const id of wordnets)
      sources.push({
        tag: id,
        terms: readWordnetMeanings({
          english,
          native: readWordnet(wordnetPath(rawDir, id)),
          termKey,
        }),
      });
  }
  if (toSimplified) {
    for (const { terms } of [...sources, ...capitalSources])
      convertTerms(terms, toSimplified);
  }
  const merged = mergeSources(sources, {
    // A term's main part of speech: that of its most translated sense, when English
    // Wiktionary lists it first too (en/pos.json). Not for "dug", whose only table is
    // the noun's ("teat"), as forms have none; nor "bound" (the noun "boundary").
    mainPos: (key) => {
      const main = tableTerms.terms.get(key)?.senses[0]?.[0];
      return main !== undefined && pos[key]?.[0] === main ? main : undefined;
    },
    degree: (key, sense) =>
      degreeOf(sense, key, [lemmas[key] ?? []].flat(), pos) !== undefined,
    otherWord: (key, taken, later) =>
      isOtherWord(key, taken, later, tableTerms),
    expansionsOf: (key) =>
      Object.hasOwn(contractions, key) ? contractions[key]! : [],
  });
  const {
    capital,
    counts: capitals,
    classes,
  } = capitalDictionary(mergeSources(capitalSources).dict, {
    nativeKind: (item) => editionTerms?.nativeKind(item),
    // A person's name first: the names lexicon's main kind.
    personFirst: (term) =>
      Object.hasOwn(names, term) && /^[gs]/.test(names[term]!),
    // A capital-only word has its English definition (en-defs) to show instead.
    defined: (term) => termKey.capitalOnly?.(term) === true,
  });
  // A word English writes only capitalised (no lowercase headword in English
  // Wiktionary: January, Monday) is its capitalised headword: an edition's lowercase
  // entry for it (ru "january" → январский) is left out, so the word takes the
  // capitalised one however it is written. So is a word English writes capitalised but
  // for a lesser use (`lesserLowercase`: french, to cut in strips; english, a spin).
  const uncased = Object.keys(merged.dict).filter(
    (key) =>
      !/\s/.test(key) &&
      Object.hasOwn(capital, capitalKey(key, false)) &&
      (!tableTerms.lowercase.has(key) ||
        lesserLowercase(key, tableTerms.coverage, lemmas)),
  );
  const left = new Set(uncased);
  const dict = Object.fromEntries(
    Object.entries(merged.dict).filter(([key]) => !left.has(key)),
  );
  const posed = withPointerPos(dict, pos);
  // The edition's capitalised glosses in its case, once their meanings are read.
  const editionSource = capitalSources.findIndex(
    ({ tag }) => tag === edition?.tag,
  );
  // Edition senses an auxiliary's, by the tables' words for "auxiliary".
  const auxiliarySenses =
    editionSource >= 0
      ? withAuxiliarySenses(
          dict,
          editionSource,
          (tableTerms.terms.get("auxiliary")?.senses ?? []).flatMap(
            ([, text]) => text.split(", "),
          ),
        )
      : 0;
  const capitalCased =
    editionTerms && editionSource >= 0
      ? inCapitalCase(capital, editionSource, editionTerms.capitalCase) +
        inTablesCase(capital, editionSource, tableTerms.capital)
      : 0;
  return {
    ...merged,
    dict,
    capital,
    stats: {
      unparsable:
        (editionTerms?.stats.unparsable ?? 0) + tableTerms.stats.unparsable,
      terms: Object.keys(dict).length,
      pointers: editionTerms?.stats.pointers ?? 0,
      templates: editionTerms?.stats.templates ?? 0,
      /** Of the templates, those learned from senses the edition does not mark as forms. */
      unmarkedTemplates: editionTerms?.stats.unmarkedTemplates ?? 0,
      /** Lowercase terms' edition glosses left out as placeholders, and which. */
      placeheld: editionTerms?.stats.placeheld ?? 0,
      placeholders: editionTerms?.stats.placeholders ?? [],
      /** Edition glosses reshaped: labels in brackets, a closing reference cut, the translation first. */
      reshaped: editionTerms?.stats.reshaped ?? 0,
      /** Pointer senses with no part of speech given the word's main one in English. */
      pointerPos: posed,
      /** Edition verb senses labelled an auxiliary's (`withAuxiliarySenses`). */
      auxiliarySenses,
      /** Terms the tables left to later sources, their main sense said with no word. */
      wordless: tableTerms.stats.wordless,
      labels: editionTerms?.stats.labels ?? [],
      /** The edition's abbreviations, learned (`withAbbreviations`). */
      abbreviations: editionTerms?.stats.abbreviations ?? [],
      /** Edition glosses put in the edition's own case (`inNativeCase`). */
      cased: (editionTerms?.stats.cased ?? 0) + capitalCased,
      /** Whether the edition opens its glosses with capitals, as sentences. */
      sentenceCase: editionTerms?.stats.sentenceCase ?? false,
      /** Edition glosses and table words left out for having no letter of the native script. */
      foreign:
        (editionTerms?.stats.foreign ?? 0) + (tableTerms.stats.foreign ?? 0),
      /** Terms of a closed class taken from a later source that translates what one described. */
      described: merged.described,
      /** Terms taken from a later source for a meaning in their main part of speech. */
      lacking: merged.lacking,
      expanded: merged.expanded,
      /** Terms that only point and kept their pointers beside a later source's other word (dug). */
      pointing: merged.pointing,
      /** Lowercase terms of words English writes only capitalised, left out. */
      uncased,
      capitals,
      /** Glosses left out as classes of names, with how many headwords share each. */
      classes,
    },
  };
}

/** Parts of speech that say none: kaikki's "unknown", or nothing. */
const NO_POS: readonly string[] = ["", "unknown"];

/**
 * LEARNING: a pointer sense whose source gives it no part of speech takes the word's
 * main one in English (en/pos.json): the hover follows a pointer in its sense's part
 * of speech, so de could ("Präteritum des Hilfsverbs can", unknown) shows can's verbs
 * (können), not its noun (Blechdose, a tin can). Gives how many senses it set.
 */
export function withPointerPos(
  dict: Record<string, [string, PairSense[], number]>,
  pos: PosPack,
): number {
  let set = 0;
  for (const [key, entry] of Object.entries(dict)) {
    const main = pos[key]?.[0];
    if (main === undefined) continue;
    entry[1] = entry[1].map((sense): PairSense => {
      if (sense[3] === undefined || !NO_POS.includes(sense[0])) return sense;
      set++;
      return [main, sense[1], sense[2], sense[3]];
    });
  }
  return set;
}

/** A capitalised headword's tables translate into at least this many languages… */
const CAPITAL_COVERAGE = 50;
/** …and this many times the languages its lowercase headword's do. */
const LESSER_RATIO = 15;

/**
 * LEARNING: a lowercase headword English uses far less than the same word capitalised:
 * English Wiktionary's tables translate the capitalised one's main sense into
 * CAPITAL_COVERAGE languages or more, LESSER_RATIO times as many as any sense of the
 * lowercase one (French 180 against french, to cut in strips, 4; English 227 against
 * the billiards spin 8; Japan 217 against the lacquer 8). Not an inflected form, whose
 * tables are its base's ("numbers", not Numbers), nor a word with a use of its own
 * (china 17 against China 224; turkey, may, polish). A capitalised word at a
 * sentence start then reads as the capitalised one, as written mid-sentence.
 */
export function lesserLowercase(
  key: string,
  coverage: ReadonlyMap<string, number>,
  lemmas: LemmaPack,
): boolean {
  const bases = [lemmas[key] ?? []].flat();
  if (bases.some((base) => base !== key)) return false;
  const capital = coverage.get(capitalKey(key, false)) ?? 0;
  return (
    capital >= CAPITAL_COVERAGE &&
    (coverage.get(key) ?? 0) * LESSER_RATIO <= capital
  );
}

/** The term keys English packs file meanings under: vocabulary words and phrase patterns. */
function englishTermKey() {
  const phrases = readPack<PhrasePatterns>("en/phrases.json");
  return termKeyOf({
    vocab: new Set(readPack<string[]>("en/vocab.json")),
    lemmas: readPack<LemmaPack>("en/lemmas.json"),
    phrases: new Set([...phrases.detect, ...phrases.more]),
    capitals: readPack<string[]>("en/capitals.json"),
  });
}

async function main() {
  const natives = process.argv.slice(2);
  if (natives.length === 0) throw new Error("Name the native languages: es…");
  const termKey = englishTermKey();
  const names = readPack<NamesPack>("en/names.json");
  const contractions = readPack<Record<string, readonly string[]>>(
    "en/contractions.json",
  );
  const lemmas = readPack<LemmaPack>("en/lemmas.json");
  const pos = readPack<PosPack>("en/pos.json");
  for (const native of natives) {
    const { dict, capital, sources, counts, stats } = await buildPairDictionary(
      native,
      { termKey, names, lemmas, pos, contractions },
    );
    const index = writeShards(
      `en-${native}`,
      dict,
      PACKS_DIR,
      { sources },
      capital,
    );
    const { classSenses, word, name, none } = stats.capitals;
    console.log(
      `en-${native}: ${stats.terms} terms (` +
        Object.entries(counts)
          .map(([tag, n]) => `${n} ${tag}`)
          .join(", ") +
        `) in ${index.shards.length} shards; ${stats.pointers} pointer senses read in ${stats.templates} templates; ` +
        `${word + name + none} capitalised headwords (${word} word, ${name} name, ${none} no meaning; ${classSenses} class senses left out); ${stats.unparsable} unparsable lines`,
    );
    console.log(
      `  ${stats.cased} edition glosses put in the edition's case (glosses open with capitals: ${stats.sentenceCase}); ${stats.foreign} glosses and table words left out with no letter of the native script; ` +
        `${stats.described.length} described closed-class terms taken from a later source: ${stats.described.slice(0, 20).join(", ")}`,
    );
    console.log(
      `  ${stats.lacking.length} terms taken from a later source for their main part of speech: ${stats.lacking.slice(0, 30).join(", ")}; ` +
        `${stats.pointing.length} pointing terms kept beside another word: ${stats.pointing.slice(0, 30).join(", ")}; ` +
        `${stats.uncased.length} lowercase terms of words English writes capitalised left out: ${stats.uncased.slice(0, 20).join(", ")}; ${stats.capitals.personSenses} person senses left out`,
    );
    console.log(
      `  ${stats.unmarkedTemplates} templates learned from unmarked senses; ${stats.placeheld} placeholder glosses left out (${stats.placeholders.slice(0, 5).join(" | ")}); ` +
        `${stats.reshaped} glosses reshaped; ${stats.pointerPos} pointer senses given a part of speech; labels: ${stats.labels.slice(0, 30).join(" ")}; ` +
        `abbreviations: ${stats.abbreviations.slice(0, 30).join(" ")}`,
    );
    console.log(
      `  ${stats.expanded.length} contractions taken from a later source that translates their expansion: ${stats.expanded.slice(0, 20).join(", ")}; ${stats.wordless} table terms left to later sources (their main sense said with no word); ${stats.auxiliarySenses} edition senses labelled an auxiliary's`,
    );
    console.log(
      "  class glosses:",
      stats.classes
        .slice(0, 12)
        .map(([item, n]) => `${item} ×${n}`)
        .join(", "),
    );
    if (stats.unparsable > 0) process.exitCode = 1;
  }
}

if (import.meta.main) await main();
