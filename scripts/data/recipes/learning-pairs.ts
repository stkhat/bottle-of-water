// The pair dictionaries from a learning language other than English into another native
// language (L3, 2026-11-20): <learning>-<native> (de-fr), each built by its recipe
// (`LEARNING_RECIPES` in recipes.ts) from three Wiktionary sources, as the English →
// native recipes are (docs/specs/architecture.md "Native meanings and the quality gate"):
// the native edition's entries for the learning language's words, the learning
// language's own edition's translation tables (rows into the native language), and the
// native edition's own words whose translation tables list the learning word (reversed
// tables: ru "собака" lists Hund, so Hund means собака). Each term comes whole from the
// first source that has it. Reads the editions' slim cuts (learning-slim.ts) and the
// learning language's built pack (its vocabulary, base forms, phrases, parts of speech)
// and its English pair (which capitalised senses it marks) → data/packs/<pair>/.
// Usage: node scripts/data/recipes/learning-pairs.ts <pair>…   (e.g. de-fr; run
// npm run data:de and learning-slim.ts on the editions first)
//        node scripts/data/recipes/learning-pairs.ts --measure [pair…]
//   (every learning language → offered native pair, or those named: the gate's coverage
//   per source and recipe, written to data/raw/quality/l3/; nothing is written to packs)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nativeLanguage, NATIVE_LANGUAGES } from "../../../src/core/natives.ts";
import { GERMAN_RULES } from "../../../src/core/phrases/de.ts";
import { FRENCH_RULES } from "../../../src/core/phrases/fr.ts";
import type {
  DefsPack,
  LemmaPack,
  PosPack,
} from "../../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../../src/core/phrases/pattern.ts";
import {
  PACKS_DIR,
  RAW_DIR,
  eachEntry,
  readDictPacks,
  readPack,
  writeShards,
} from "../common.ts";
import { germanPhraseBuild, GERMAN_BUILD } from "../de-kaikki.ts";
import { frenchPhraseBuild, FRENCH_BUILD } from "../fr-kaikki.ts";
import { GATE, pairCoverage } from "../gate.ts";
import { contentWords } from "../content-words.ts";
import {
  degreeOf,
  shortOfDefinition,
} from "../../../src/core/lexicon/short-lines.ts";
import { learningSlimPath, LEARNING_PAIR_LANGS } from "./learning-slim.ts";
import { undocumentedPages } from "./undocumented.ts";
import {
  readReversedTables,
  REFLEXIVE_POS,
  tableWord,
  type TableWords,
} from "./reversed-tables.ts";
import {
  addSense,
  convertTerms,
  finish,
  lastScriptForm,
  learningText,
  mergeSources,
  nativeLetterOf,
  packedEntry,
  readEdition,
  readTranslationTables,
  termKeyOf,
  type LearningText,
  type PairSense,
  type SourceTerm,
  type TermKey,
} from "./recipe.ts";
import {
  LEARNING_RECIPES,
  learningRecipeTags,
  type LearningRecipe,
  type LearningSourceKind,
} from "./recipes.ts";
import { simplifiedConverter } from "./simplified.ts";

type LearningLang = (typeof LEARNING_PAIR_LANGS)[number];

/** Senses kept per term and source, as the English recipes keep. */
const MAX_SENSES = 4;

/**
 * LEARNING: each learning language's letters, as glosses in other languages write its
 * words (`learningText`), its phrase settings, its reflexive pronoun as tables write a
 * pronominal verb ("sich freuen", "se réjouir") and whether it capitalises its nouns.
 */
const LEARNING: Readonly<
  Record<
    LearningLang,
    {
      text: LearningText;
      phraseBuild: typeof germanPhraseBuild;
      reflexive: readonly string[];
      nounsCapitalised: boolean;
    }
  >
> = {
  de: {
    text: learningText("de", "A-ZÄÖÜ", "a-zäöüß"),
    phraseBuild: germanPhraseBuild,
    reflexive: [GERMAN_RULES.verbLast!.reflexive],
    nounsCapitalised: GERMAN_BUILD.nounsCapitalised === true,
  },
  fr: {
    text: learningText("fr", "A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ", "a-zàâæçéèêëîïôœùûüÿ"),
    phraseBuild: frenchPhraseBuild,
    reflexive: [...(FRENCH_RULES.reflexive?.leading ?? [])],
    nounsCapitalised: FRENCH_BUILD.nounsCapitalised === true,
  },
};

/** kaikki's tags of a reflexive or pronominal sense. */
const REFLEXIVE_TAGS: readonly string[] = ["reflexive", "pronominal"];

/** What a recipe reads of the learning language's built pack. */
export interface LearningWords extends TableWords {
  lang: LearningLang;
  termKey: TermKey;
  vocab: ReadonlySet<string>;
  lemmas: LemmaPack;
  pos: PosPack;
  /** The learning language's articles (its pack's parts of speech), which tables may write before a noun. */
  articles: ReadonlySet<string>;
  /** Its English pair (de-en), whose capital marks the recipe follows. */
  english: DefsPack;
}

/** The learning language's words as its built packs have them (data/packs/<lang>/, <lang>-en/). */
function learningWords(
  lang: LearningLang,
  packsDir = PACKS_DIR,
): LearningWords {
  const dir = join(packsDir, lang);
  const vocab = new Set(readPack<string[]>("vocab.json", dir));
  const lemmas = readDictPacks<string | string[]>(join(dir, "lemmas"));
  const pos = readPack<PosPack>("pos.json", dir);
  const phrases = readPack<PhrasePatterns>("phrases.json", dir);
  const build = LEARNING[lang].phraseBuild(pos, lemmas);
  return {
    lang,
    termKey: termKeyOf({
      vocab,
      lemmas,
      phrases: new Set([...phrases.detect, ...phrases.more]),
      build,
    }),
    vocab,
    lemmas,
    pos,
    articles: new Set(
      Object.entries(pos)
        .filter(([, list]) => list.includes("article"))
        .map(([word]) => word),
    ),
    reflexive: LEARNING[lang].reflexive,
    english: readDictPacks(join(packsDir, `${lang}-en`)),
  };
}

/** A sense whose source calls it a reflexive or pronominal use. */
const reflexiveSense = (tags: readonly unknown[] | undefined) =>
  (tags ?? []).some(
    (tag) => typeof tag === "string" && REFLEXIVE_TAGS.includes(tag),
  );

/**
 * The learning edition's reflexive senses (kaikki's tags): per term, their glosses, so a
 * table row naming one of them (its sense: "reflexiv: sich freuen: Freude erleben") is
 * a reflexive one.
 */
async function reflexiveGlosses(path: string, words: LearningWords) {
  const found = new Map<string, string[]>();
  await eachEntry(
    path,
    (entry) => {
      if (entry.lang_code !== words.lang || entry.pos !== "verb") return;
      const key = words.termKey(entry.word.trim());
      if (!key) return;
      for (const sense of entry.senses ?? []) {
        const gloss = sense.glosses?.at(-1);
        if (typeof gloss !== "string" || !reflexiveSense(sense.tags)) continue;
        let list = found.get(key);
        if (!list) found.set(key, (list = []));
        list.push(gloss.trim());
      }
    },
    (line) => !line.includes('"pos":"verb"'),
  );
  return found;
}

/** A source's terms: lower-case headwords, and capitalised ones (lower-case keys). */
interface SourceRead {
  terms: Map<string, SourceTerm>;
  capital: Map<string, SourceTerm>;
}

/**
 * LEARNING: one source's terms with its capitalised headwords joined to their key, as
 * the learning language's English pair has them (`LearningWords.english`): in a
 * language that capitalises its nouns (German), a capitalised headword is a word
 * ("Hund", "Essen", the polite "Sie"); its senses come after the lower-case
 * headword's, or first where the English pair's first sense is a capitalised one, and
 * are marked (`capital`: the indices of a term's capitalised senses) where the English
 * pair marks the key's, or has no lower-case senses for it. In other languages a
 * capitalised headword is a name, which the learning pack's names lexicon gives, and
 * is left out (as the English pairs of French and Spanish leave them).
 */
export function joinCapitals(
  read: SourceRead,
  words: Pick<LearningWords, "lang" | "english">,
  max = MAX_SENSES + 2,
): { terms: Map<string, SourceTerm>; capitals: Map<string, number[]> } {
  const capitals = new Map<string, number[]>();
  if (!LEARNING[words.lang].nounsCapitalised)
    return { terms: read.terms, capitals };
  const terms = new Map(read.terms);
  for (const [key, capital] of read.capital) {
    const lower = read.terms.get(key);
    const english = Object.hasOwn(words.english, key)
      ? words.english[key]!
      : undefined;
    const marked = english
      ? english.some((sense) => sense[2] === "capital") ||
        english.every((sense) => sense[2] !== undefined)
      : true;
    const capitalFirst =
      !lower || (english !== undefined && english[0]?.[2] === "capital");
    const lowerSenses = lower?.senses ?? [];
    const senses = capitalFirst
      ? [...capital.senses, ...lowerSenses]
      : [...lowerSenses, ...capital.senses];
    const item: SourceTerm = { short: "", senses: [] };
    const indices: number[] = [];
    for (const sense of senses) {
      const before = item.senses.length;
      addSense(item, sense, max);
      if (
        item.senses.length > before &&
        marked &&
        capital.senses.includes(sense)
      )
        indices.push(before);
    }
    item.short = (capitalFirst ? capital : (lower ?? capital)).short;
    terms.set(key, item);
    if (indices.length > 0) capitals.set(key, indices);
  }
  return { terms, capitals };
}

/** The slim cut each source reads, and how. */
async function readSource(
  kind: LearningSourceKind,
  recipe: LearningRecipe,
  words: LearningWords,
  native: string,
  rawDir: string,
): Promise<SourceRead> {
  const letterScripts = nativeLanguage(native)?.scripts;
  const letter = letterScripts && nativeLetterOf(letterScripts);
  const toSimplified = recipe.simplified ? simplifiedConverter() : undefined;
  const nativeSlim = learningSlimPath(native, rawDir);
  if (kind === "edition") {
    const read = await readEdition(nativeSlim, words.termKey, {
      trimPeriod: true,
      native,
      learning: LEARNING[words.lang].text,
      capitalWords: LEARNING[words.lang].nounsCapitalised,
      // Entries on pages of an undocumented bot import are left out.
      leftOut: await undocumentedPages(native, rawDir),
      // A sense its source calls reflexive or pronominal is the verb's reflexive one.
      sensePos: (sense, pos) =>
        pos === "verb" && reflexiveSense(sense.tags) ? REFLEXIVE_POS : pos,
      ...(toSimplified && { nativeForm: toSimplified }),
      ...(letter && { letter }),
    });
    // A capitalised headword that is a name (a proper noun) is the names lexicon's;
    // its short is then its first other sense's (Katz: "variante de Katze", not the
    // surname's "nom de famille"), and one with none is left out.
    for (const item of read.capital.values())
      item.senses = item.senses.filter(([pos]) => pos !== "proper noun");
    finish(read.capital, shortOfDefinition);
    const lowered = (map: Map<string, SourceTerm>) =>
      new Map([...map].map(([key, item]) => [key.toLowerCase(), item]));
    return {
      terms: read.terms,
      capital: lowered(read.capital),
    };
  }
  if (kind === "tables") {
    const learningSlim = learningSlimPath(words.lang, rawDir);
    const [read, reflexive] = await Promise.all([
      readTranslationTables(learningSlim, {
        learning: words.lang,
        langCodes: recipe.tables?.langCodes ?? [native],
        termKey: words.termKey,
        word: (written) => {
          const word = tableWord(written);
          return word && toSimplified ? lastScriptForm(word) : word;
        },
        ...(letter && { letter }),
      }),
      reflexiveGlosses(learningSlim, words),
    ]);
    // A table's sense its edition tags reflexive (the row names its gloss) is the
    // verb's reflexive one.
    for (const [key, item] of read.terms) {
      const glosses = reflexive.get(key);
      if (!glosses) continue;
      item.senses = item.senses.map((sense) =>
        sense[0] === "verb" &&
        typeof sense[2] === "string" &&
        glosses.some((gloss) => sense[2]!.endsWith(gloss))
          ? [REFLEXIVE_POS, sense[1], sense[2]]
          : sense,
      );
    }
    const lowered = new Map(
      [...read.capital].map(([key, item]) => [key.toLowerCase(), item]),
    );
    return { terms: read.terms, capital: lowered };
  }
  return readReversedTables(nativeSlim, words, {
    native,
    leftOut: await undocumentedPages(native, rawDir),
    ...(toSimplified && { nativeForm: toSimplified }),
    ...(letter && { letter }),
  });
}

/** Reads a pair's sources (each once) and merges them in the recipe's order. */
async function buildLearningPair(
  pair: string,
  {
    words,
    recipe = defaultRecipe(pair),
    rawDir = RAW_DIR,
    reads,
  }: {
    words: LearningWords;
    recipe?: LearningRecipe;
    rawDir?: string;
    /** Sources already read (the measurement reads each once for every order). */
    reads?: Partial<Record<LearningSourceKind, SourceRead>>;
  },
) {
  const [, native = ""] = pair.split("-");
  const read: Partial<Record<LearningSourceKind, SourceRead>> = {
    ...reads,
  };
  for (const kind of recipe.order)
    read[kind] ??= await readSource(kind, recipe, words, native, rawDir);
  const toSimplified = recipe.simplified ? simplifiedConverter() : undefined;
  const joined = recipe.order.map((kind) => {
    const found = joinCapitals(read[kind]!, words);
    if (toSimplified) convertTerms(found.terms, toSimplified);
    return { kind, tag: learningRecipeTags(pair)[kind], ...found };
  });
  const merged = mergeSources(
    joined.map(({ tag, terms }) => ({ tag, terms })),
    {
      mainPos: (key) => words.pos[key]?.[0],
      degree: (key, sense) =>
        degreeOf(sense, key, [words.lemmas[key] ?? []].flat(), words.pos) !==
        undefined,
    },
  );
  // The capitalised senses of each term, from the source it came from.
  const dict: Record<
    string,
    [short: string, senses: PairSense[], source: number, capitals?: number[]]
  > = {};
  for (const [key, [short, senses, source]] of Object.entries(merged.dict)) {
    const capitals = joined[source]!.capitals.get(key);
    dict[key] = capitals
      ? [short, senses, source, capitals]
      : [short, senses, source];
  }
  return { ...merged, dict, read };
}

/** A pair's recipe: its own (`LEARNING_RECIPES`), else the three sources in the default order. */
function defaultRecipe(pair: string): LearningRecipe {
  if (Object.hasOwn(LEARNING_RECIPES, pair))
    return LEARNING_RECIPES[pair as keyof typeof LEARNING_RECIPES];
  const [, native = ""] = pair.split("-");
  return {
    order: ["edition", "tables", "reversed"],
    tables: {
      langCodes: native === "zh" ? ["zh", "cmn"] : [native],
    },
    ...(native === "zh" && { simplified: true }),
  };
}

/** The gate's words of a learning language, as `npm run data:stats` counts them. */
function gateWords(lang: LearningLang, packsDir = PACKS_DIR) {
  const dir = join(packsDir, lang);
  return contentWords({
    freq: readPack("freq.json", dir),
    pos: readPack<PosPack>("pos.json", dir),
    lemmas: readDictPacks(join(dir, "lemmas")),
    vocab: new Set(readPack<string[]>("vocab.json", dir)),
    top: GATE.top,
  }).words;
}

/** Every learning language → offered native pair (not into English or itself). */
const allPairs = () =>
  LEARNING_PAIR_LANGS.flatMap((lang) =>
    Object.keys(NATIVE_LANGUAGES)
      .filter((native) => native !== "en" && native !== lang)
      .map((native) => `${lang}-${native}`),
  );

/**
 * The gate's coverage of each pair: each source alone, the edition and tables
 * together (what L0 measured), and all three.
 */
async function measure(pairs: readonly string[]) {
  const out = join(RAW_DIR, "quality", "l3");
  mkdirSync(out, { recursive: true });
  const report: Record<string, unknown> = {};
  for (const lang of LEARNING_PAIR_LANGS) {
    const mine = pairs.filter((pair) => pair.startsWith(`${lang}-`));
    if (mine.length === 0) continue;
    const words = learningWords(lang);
    const gate = gateWords(lang);
    for (const pair of mine) {
      const reads: Partial<Record<LearningSourceKind, SourceRead>> = {};
      const rows: Record<string, unknown> = {};
      const recipe = defaultRecipe(pair);
      const orders: Record<string, LearningSourceKind[]> = {
        edition: ["edition"],
        tables: ["tables"],
        reversed: ["reversed"],
        "edition+tables": ["edition", "tables"],
        "tables+reversed": ["tables", "reversed"],
        all: ["edition", "tables", "reversed"],
      };
      let uncovered: string[] = [];
      for (const [name, order] of Object.entries(orders)) {
        const built = await buildLearningPair(pair, {
          words,
          recipe: { ...recipe, order },
          reads,
        });
        Object.assign(reads, built.read);
        const { tops } = pairCoverage({
          words: gate,
          phrases: [],
          sourceOf: (term) =>
            Object.hasOwn(built.dict, term)
              ? built.sources[built.dict[term]![2]]
              : undefined,
        });
        rows[name] = {
          top5000: +(tops[GATE.top]!.share * 100).toFixed(2),
          top2000: +(tops[2000]!.share * 100).toFixed(2),
          terms: Object.keys(built.dict).length,
        };
        if (name === "all") {
          uncovered = gate.filter((word) => !Object.hasOwn(built.dict, word));
          // Each term's parts of speech and source, for checks beyond the gate's words.
          writeFileSync(
            join(out, `terms-${pair}.json`),
            JSON.stringify(
              Object.fromEntries(
                Object.entries(built.dict).map(([key, [, senses, source]]) => [
                  key,
                  [source, ...new Set(senses.map(([pos]) => pos))],
                ]),
              ),
            ),
          );
        }
      }
      report[pair] = rows;
      console.log(pair, JSON.stringify(rows));
      writeFileSync(
        join(out, `uncovered-${pair}.json`),
        JSON.stringify(uncovered),
      );
    }
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--measure") {
    await measure(args.length > 1 ? args.slice(1) : allPairs());
    return;
  }
  if (args.length === 0) throw new Error("Name the pairs: de-fr…");
  for (const pair of args) {
    const [lang] = pair.split("-") as [LearningLang];
    const words = learningWords(lang);
    const { dict, sources, counts } = await buildLearningPair(pair, { words });
    // Each short stored only where the dictionary would not make it (format 2).
    const index = writeShards(
      pair,
      Object.fromEntries(
        Object.entries(dict).map(([key, [short, senses, source, capitals]]) => [
          key,
          packedEntry(short, senses, source, capitals),
        ]),
      ),
      PACKS_DIR,
      { sources },
    );
    console.log(
      `${pair}: ${Object.keys(dict).length} terms (` +
        Object.entries(counts)
          .map(([tag, n]) => `${n} ${tag}`)
          .join(", ") +
        `) in ${index.shards.length} shards`,
    );
  }
}

if (import.meta.main) await main();
