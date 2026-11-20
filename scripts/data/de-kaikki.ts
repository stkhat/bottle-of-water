// kaikki.org English Wiktionary's German entries (CC BY-SA), the German frequency list
// (de-frequency.ts) and UD German GSD's lemmas (de-treebank.ts) →
// data/packs/de/{freq,vocab,ipa,pos,phrases,names}.json,
// data/packs/de/lemmas/{index,dict-<n>}.json and data/packs/de-en/{index,dict-<n>}.json
// (then run npm run data:publish). The build is the learning-pack build Spanish and
// French use (learning-kaikki.ts) with German's settings: German capitalises its nouns,
// so a capitalised headword is a word ("Haus", "Häuser"), and the frequency list keeps
// case.
// The German Wiktionary extract (de.wiktionary, kaikki-de-edition.jsonl, 3.1 GB) gives
// its examples, which with kaikki-de's own make the phrase build's example corpus, and
// the IPA of the words English Wiktionary has none for; its English translation tables,
// inflection tables and form-of entries give the words and forms English Wiktionary
// lacks (edition-tables.ts). Its German entries are first cut to those parts, once,
// into kaikki-de-edition-slim.jsonl and kaikki-de-edition-tables.jsonl.
// Usage: node scripts/data/de-kaikki.ts [path]   (default data/raw/kaikki-de.jsonl)
import { join } from "node:path";
import { COMPOUND_RULES } from "../../src/core/lexicon/compounds.ts";
import { GERMAN_RULES } from "../../src/core/phrases/de.ts";
import { RAW_DIR, readPack } from "./common.ts";
import {
  DE_FORMS,
  GERMAN_WORD,
  germanForms,
  germanWritten,
  readDeFrequency,
} from "./de-frequency.ts";
import { germanTreebankLemmas } from "./de-treebank.ts";
import { slimTables } from "./edition-tables.ts";
import {
  buildLearningPacks,
  buildSummary,
  CLOSED_CLASSES,
  GRAMMAR_CLASSES,
  slimEdition,
  writeLearningPacks,
  type LearningBuild,
} from "./learning-kaikki.ts";
import type { PhraseBuildLanguage } from "./phrases.ts";

const KAIKKI_DE_PATH = join(RAW_DIR, "kaikki-de.jsonl");
const KAIKKI_DE_EDITION_PATH = join(RAW_DIR, "kaikki-de-edition.jsonl");
/** The German edition's German entries, with only their examples and pronunciations. */
const KAIKKI_DE_EDITION_SLIM_PATH = join(
  RAW_DIR,
  "kaikki-de-edition-slim.jsonl",
);
/** The German edition's German entries, with only their names, form-of senses and tables. */
const KAIKKI_DE_EDITION_TABLES_PATH = join(
  RAW_DIR,
  "kaikki-de-edition-tables.jsonl",
);
/** Senses of a word read for a phrase's gloss bag, as Spanish's and French's. */
const PHRASE_WORD_SENSES = 3;

/**
 * The phrase build's LEARNING settings for German (`PhraseBuildLanguage`), as French's:
 * its words (`GERMAN_WORD`, lower case), the slots "jemand", "jemanden", "jemandem",
 * "jemandes" and "etwas", the auxiliaries whose patterns are not detected (sein,
 * haben, werden) and its closed classes.
 */
export function germanPhraseBuild(
  pos: Readonly<Record<string, readonly string[]>>,
  lemmas: Readonly<Record<string, string | readonly string[]>>,
): PhraseBuildLanguage {
  const main = (word: string) => {
    if (Object.hasOwn(pos, word)) return pos[word]![0];
    const base = Object.hasOwn(lemmas, word)
      ? [lemmas[word]!].flat()[0]
      : undefined;
    return base !== undefined && Object.hasOwn(pos, base)
      ? pos[base]![0]
      : undefined;
  };
  return {
    lang: "de",
    slots: new Set(GERMAN_RULES.slots.keys()),
    slotSpellings: new Map(),
    auxiliaries: new Set(["sein", "haben", "werden"]),
    word: /^\p{Ll}+(?:'\p{Ll}+)*$/u,
    wordSenses: PHRASE_WORD_SENSES,
    functionWordSenses: 1,
    functionWord: (word) =>
      Object.hasOwn(pos, word) && CLOSED_CLASSES.has(pos[word]![0] ?? ""),
    closedClass: (key) =>
      key.split(" ").every((word) => GRAMMAR_CLASSES.has(main(word) ?? "")),
  };
}

/** de.wiktionary's pronunciation, "[haʊ̯s]", in slashes: "/haʊ̯s/". */
export const germanEditionIpa = (ipa: string) =>
  ipa.replace(/^\[(.*)\]$/su, "/$1/");

/**
 * German as the learning-pack build reads it: nouns capitalised, no elisions. Its
 * phrase patterns are only matched for saved phrases and selections until German's
 * phrase rules (separable verbs, "sich", gaps) are built and judged (L2-3).
 */
export const GERMAN_BUILD: LearningBuild = {
  lang: "de",
  word: GERMAN_WORD,
  phraseBuild: germanPhraseBuild,
  nounsCapitalised: true,
  // Every verb's senses kaikki tags reflexive are its pronominal uses ("sich freuen":
  // to be glad), shown first where the grammar reads a reflexive pronoun in the
  // verb's clause (`core/tagging/de.ts`).
  pronominalVerb: () => true,
  editionIpa: germanEditionIpa,
  separableVerbs: true,
  compounds: COMPOUND_RULES.de,
};

/**
 * Whether a key is an English word, form or name (the `en` pack's vocabulary, lemma
 * table and names lexicon): the German edition's translations leave those out
 * (`nativeWord`).
 */
function englishWord() {
  const words = new Set([
    ...readPack<string[]>("en/vocab.json"),
    ...Object.keys(readPack<Record<string, unknown>>("en/lemmas.json")),
    ...Object.keys(readPack<Record<string, unknown>>("en/names.json")),
  ]);
  return (key: string) => words.has(key);
}

async function main() {
  await slimEdition("de", KAIKKI_DE_EDITION_PATH, KAIKKI_DE_EDITION_SLIM_PATH);
  await slimTables(
    "de",
    KAIKKI_DE_EDITION_PATH,
    KAIKKI_DE_EDITION_TABLES_PATH,
    GERMAN_WORD,
  );
  const written = germanWritten(await readDeFrequency(DE_FORMS));
  const packs = await buildLearningPacks(
    GERMAN_BUILD,
    process.argv[2] ?? KAIKKI_DE_PATH,
    germanForms(written),
    {
      treebank: await germanTreebankLemmas(),
      casePaths: [KAIKKI_DE_EDITION_SLIM_PATH],
      ipaPaths: [KAIKKI_DE_EDITION_SLIM_PATH],
      written,
      // The phrase score reads English Wiktionary's German examples alone, as
      // French's (L1-4): with de.wiktionary's too, its count terms leave most common
      // expressions undetected ("vor allem", "zum Beispiel"); judged blind (L2-3).
      ownEditionExamples: false,
      // The German edition's English translations and tables give the words and
      // forms English Wiktionary lacks (R3; judged 50 : 15 against no meaning in L2-1).
      tablesPath: KAIKKI_DE_EDITION_TABLES_PATH,
      nativeWord: englishWord(),
    },
  );
  console.log(buildSummary("de", packs, writeLearningPacks("de", packs)));
  if (packs.stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
