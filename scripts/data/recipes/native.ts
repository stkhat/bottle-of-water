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
  eachEntry,
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
  writtenAsWord,
  convertTerms,
  inCapitalCase,
  inTablesCase,
  isOtherWord,
  lastScriptForm,
  withAuxiliarySenses,
  lesserLowercase,
  mergeSources,
  nativeLetterOf,
  packedEntry,
  readEdition,
  readTranslationTables,
  termKeyOf,
  withoutStressMarks,
  type PairSense,
  type SourceTerm,
  type TermKey,
} from "./recipe.ts";
import { RECIPES, recipeTags, TABLES_TAG, type Recipe } from "./recipes.ts";
import {
  fitsEnglishPos,
  readReverseGlosses,
  withoutOffensiveWords,
} from "./reverse-glosses.ts";
import { readReversedTables, type TableWords } from "./reversed-tables.ts";
import {
  acronymNative,
  entityNative,
  joinedAcronyms,
  joinedEntities,
  WIKIDATA_TAG,
  type Acronyms,
  type Entities,
} from "../wikidata.ts";
import { undocumentedPages } from "./undocumented.ts";
import { readFrequencyWords } from "../frequency-words.ts";

/**
 * A native word's rank in the language's FrequencyWords 2018 list (the forms as
 * subtitles write them), for ordering a term's reverse glosses; words the list lacks
 * come after every ranked one. A word the list writes in another spelling has that
 * spelling's rank (`NativeLanguage.spelling`: Hindi subtitles mostly drop the nukta,
 * खबर for ख़बर) when it is the same word (`spellingsOf`, by the language's entries at
 * `path`): the entries link the two, or the list's spelling has no entry of its own
 * (मुकदमा for मुक़दमा). Not ज़ाती, "inherent", by जाती, "goes", an entry of its own. A
 * native phrase has its rarest word's rank (पता करना: करना's or पता's).
 */
async function frequencyRank(native: string, path: string) {
  const spelling = nativeLanguage(native)?.spelling;
  const ranks = new Map<string, number>();
  /** Folded spelling → the list's forms so spelled, by rank. */
  const variants = new Map<string, string[]>();
  for (const [i, form] of (
    await readFrequencyWords(native, Number.POSITIVE_INFINITY)
  ).entries()) {
    if (ranks.has(form)) continue;
    ranks.set(form, i + 1);
    if (!spelling) continue;
    const folded = spelling(form);
    let forms = variants.get(folded);
    if (!forms) variants.set(folded, (forms = []));
    forms.push(form);
  }
  const entries = spelling
    ? await spellingsOf(path, native, spelling)
    : undefined;
  const rankOf = (word: string) => {
    const own = ranks.get(word);
    if (own !== undefined || !spelling) return own ?? Number.MAX_SAFE_INTEGER;
    const variant = variants
      .get(spelling(word))
      ?.find(
        (form) =>
          entries!.same.has(pairKey(word, form)) || !entries!.heads.has(form),
      );
    return variant === undefined
      ? Number.MAX_SAFE_INTEGER
      : ranks.get(variant)!;
  };
  return (word: string) =>
    Math.max(
      ...word
        .split(/[\s-]+/u)
        .filter(Boolean)
        .map(rankOf),
    );
}

const pairKey = (a: string, b: string) => (a < b ? `${a}\t${b}` : `${b}\t${a}`);

/**
 * NATIVE: the language's headwords, and the pairs of spellings its entries say are one
 * word among those `spelling` folds together: one's entry names the other in a sense
 * (खबर: "nuqtaless form of ख़बर"; an alternative form's alt-of) or among its forms
 * (ज़रूर: जरूर, alternative). The pairs as `pairKey`s.
 */
export async function spellingsOf(
  path: string,
  native: string,
  spelling: (word: string) => string,
): Promise<{ heads: ReadonlySet<string>; same: ReadonlySet<string> }> {
  const heads = new Set<string>();
  const same = new Set<string>();
  await eachEntry(path, (entry) => {
    if (entry.lang_code !== native) return;
    const head = entry.word.trim();
    heads.add(head);
    const folded = spelling(head);
    const named = [
      ...(entry.forms ?? []).map((form) => form.form),
      ...(entry.senses ?? []).flatMap((sense) => [
        ...[sense.alt_of, sense.form_of].flatMap((list: unknown) =>
          Array.isArray(list)
            ? list.map((item: { word?: unknown }) => item?.word)
            : [],
        ),
        ...(sense.glosses ?? []).flatMap((gloss) =>
          typeof gloss === "string" ? gloss.split(/[\s,;:()“”"]+/u) : [],
        ),
      ]),
    ];
    for (const word of named)
      if (
        typeof word === "string" &&
        word !== head &&
        spelling(word) === folded
      )
        same.add(pairKey(head, word));
  });
  return { heads, same };
}

/**
 * How an edition's tables write English words: a noun after an article ("the dog"), a
 * verb after "to" ("to run"); English writes no reflexive pronoun before a verb.
 */
const ENGLISH_ROWS = (termKey: TermKey): TableWords => ({
  lang: "en",
  termKey,
  articles: new Set(["a", "an", "the", "to"]),
  reflexive: [],
});

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
    entities = {},
    acronyms = {},
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
    /** The words that joined from Wikidata, with their entities (`joinedEntities`). */
    entities?: Entities;
    /** The acronyms known only by what they stand for (`joinedAcronyms`). */
    acronyms?: Acronyms;
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
  // Every source's terms by tag, then in the recipe's order (`recipeTags`).
  const read = new Map<
    string,
    { terms: Map<string, SourceTerm>; capital?: Map<string, SourceTerm> }
  >([[TABLES_TAG, tableTerms]]);
  if (edition && editionTerms) read.set(edition.tag, editionTerms);
  if (wordnets.length > 0) {
    const english = readWordnet(wordnetPath(rawDir, ENGLISH_WORDNET));
    for (const id of wordnets)
      read.set(id, {
        terms: readWordnetMeanings({
          english,
          native: readWordnet(wordnetPath(rawDir, id)),
          termKey,
        }),
      });
  }
  // A native word of another part of speech than the English word's is no meaning of
  // it, in the sources read backwards (round 4's main senses).
  const fits = fitsEnglishPos(pos);
  let offensiveLeft = 0;
  if (recipe.reversedTables) {
    if (!edition)
      throw new Error(`en-${native}: reversed tables need an edition`);
    read.set(
      recipe.reversedTables.tag,
      await readReversedTables(
        join(rawDir, edition.file),
        ENGLISH_ROWS(termKey),
        {
          native,
          leftOut: await undocumentedPages(native, rawDir),
          fits,
          ...(toSimplified && { nativeForm: toSimplified }),
          ...(letter && { letter }),
        },
      ),
    );
  }
  if (recipe.reverseGlosses) {
    const reverse = await readReverseGlosses(
      join(rawDir, recipe.reverseGlosses.file),
      {
        native,
        termKey,
        fits,
        // A capitalised headword beside a lowercase one is another word (May, may).
        capitalised: (written) =>
          tableTerms.capitalised.has(written) &&
          tableTerms.lowercase.has(written.toLowerCase()),
        verbOnly: (word) => {
          const classes = pos[word] ?? [];
          return classes.includes("verb") && !classes.includes("adjective");
        },
        ...(letter && { letter }),
        ...(recipe.reverseGlosses.frequency && {
          rank: await frequencyRank(
            native,
            join(rawDir, recipe.reverseGlosses.file),
          ),
        }),
      },
    );
    read.set(recipe.reverseGlosses.tag, reverse);
    // The native language's own entries say which table words are offensive.
    offensiveLeft = withoutOffensiveWords(tableTerms.terms, reverse.offensive);
  }
  const sources: { tag: string; terms: Map<string, SourceTerm> }[] = [];
  // The capitalised headwords, from the same sources in the same order (so a term's
  // source index is the same), kept apart.
  const capitalSources: typeof sources = [];
  for (const tag of recipeTags(recipe)) {
    const { terms, capital = new Map() } = read.get(tag)!;
    sources.push({ tag, terms });
    capitalSources.push({ tag, terms: capital });
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
    rowsSayWord: (key) => writtenAsWord(tableTerms.rowCase.get(key)),
    // A person's name first: the names lexicon's main kind.
    personFirst: (term) =>
      Object.hasOwn(names, term) && /^[gs]/.test(names[term]!),
    // A capital-only word has its English definition (en-defs) to show instead.
    defined: (term) => termKey.capitalOnly?.(term) === true,
    // A common word of its own: not another word's form (mars, of mar: Mars).
    lowercase: (term) =>
      Object.hasOwn(merged.dict, term) &&
      (!Object.hasOwn(lemmas, term) || [lemmas[term]!].flat().includes(term)),
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
  // The words that joined from Wikidata mean their items (Nvidia: empresa
  // multinacional estadounidense de tecnología), not an entry so written (BTS), each
  // sense hinted by what it is in English, as a table's; a source of their own, last.
  // With none in the language, their English definition (en-defs) shows instead.
  const entitySource = merged.sources.length;
  let fromEntities = 0;
  for (const [written, entity] of Object.entries(entities)) {
    const lower = written.toLowerCase();
    if (termKey.capitalOnly?.(lower) !== true) continue;
    const acronym = /\p{Lu}.*\p{Lu}/u.test(written) && !/\p{Ll}/u.test(written);
    const key = capitalKey(lower, acronym);
    Reflect.deleteProperty(capital, key);
    const read = entityNative(written, entity, native);
    const senses = read.map(([text, hint]): PairSense => [
      "proper noun",
      toSimplified ? toSimplified(text) : text,
      hint,
    ]);
    if (senses.length === 0) continue;
    // A label is the thing's name there; a description alone says what it is.
    const meaning = read[0]![2] === "label" ? "name" : "word";
    capital[key] = [senses[0]![1], senses, entitySource, meaning];
    fromEntities++;
  }
  // An acronym known only by what it stands for (NYPD): each thing's label and
  // description there, hinted by its English name, which the card chooses by; with none
  // in the language, its English definition (en-defs) shows instead.
  let fromAcronyms = 0;
  for (const [written, items] of Object.entries(acronyms)) {
    if (Object.hasOwn(capital, written)) continue;
    // Without the stress marks a few Russian labels carry, as the recipes write it.
    const senses = acronymNative(written, items, native).map(
      ([text, hint]): PairSense => [
        "proper noun",
        toSimplified
          ? toSimplified(withoutStressMarks(text))
          : withoutStressMarks(text),
        hint,
      ],
    );
    if (senses.length === 0) continue;
    capital[written] = [senses[0]![1], senses, entitySource, "word"];
    fromAcronyms++;
  }
  const capitalCased =
    editionTerms && editionSource >= 0
      ? inCapitalCase(capital, editionSource, editionTerms.capitalCase) +
        inTablesCase(capital, editionSource, tableTerms.capital)
      : 0;
  return {
    ...merged,
    sources:
      fromEntities + fromAcronyms > 0
        ? [...merged.sources, WIKIDATA_TAG]
        : merged.sources,
    dict,
    capital,
    stats: {
      /** Capital-only words given Wikidata's meanings. */
      fromEntities,
      /** Acronyms known only by what they stand for, with meanings in the language. */
      fromAcronyms,
      unparsable:
        (editionTerms?.stats.unparsable ?? 0) + tableTerms.stats.unparsable,
      terms: Object.keys(dict).length,
      /** Table words left out as offensive in a marked sense (`withoutOffensiveWords`). */
      offensiveLeft,
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
  const entities = joinedEntities();
  const acronyms = joinedAcronyms();
  for (const native of natives) {
    const { dict, capital, sources, counts, stats } = await buildPairDictionary(
      native,
      { termKey, names, lemmas, pos, contractions, entities, acronyms },
    );
    // Each short stored only where the dictionary would not make it (format 4).
    const index = writeShards(
      `en-${native}`,
      Object.fromEntries(
        Object.entries(dict).map(([key, [short, senses, source]]) => [
          key,
          packedEntry(short, senses, source),
        ]),
      ),
      PACKS_DIR,
      { sources },
      Object.fromEntries(
        Object.entries(capital).map(
          ([key, [short, senses, source, meaning]]) => [
            key,
            packedEntry(short, senses, source, meaning),
          ],
        ),
      ),
    );
    const { classSenses, word, name, none } = stats.capitals;
    console.log(
      `en-${native}: ${stats.terms} terms (` +
        Object.entries(counts)
          .map(([tag, n]) => `${n} ${tag}`)
          .join(", ") +
        `) in ${index.shards.length} shards; ${stats.pointers} pointer senses read in ${stats.templates} templates; ` +
        `${word + name + none} capitalised headwords (${word} word, ${name} name, ${none} no meaning; ${classSenses} class senses left out), ${stats.fromEntities} more from Wikidata, ${stats.fromAcronyms} acronyms known by what they stand for; ${stats.unparsable} unparsable lines`,
    );
    console.log(
      `  ${stats.cased} edition glosses put in the edition's case (glosses open with capitals: ${stats.sentenceCase}); ${stats.foreign} glosses and table words left out with no letter of the native script; ` +
        `${stats.described.length} described closed-class terms taken from a later source: ${stats.described.slice(0, 20).join(", ")}`,
    );
    console.log(
      `  ${stats.lacking.length} terms taken from a later source for their main part of speech: ${stats.lacking.slice(0, 30).join(", ")}; ` +
        `${stats.pointing.length} pointing terms kept beside another word: ${stats.pointing.slice(0, 30).join(", ")}; ` +
        `${stats.uncased.length} lowercase terms of words English writes capitalised left out: ${stats.uncased.slice(0, 20).join(", ")}; ${stats.capitals.personSenses} person senses left out; ${stats.offensiveLeft} offensive table words left out`,
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
