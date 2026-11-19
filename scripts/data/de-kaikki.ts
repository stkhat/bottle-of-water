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
// the IPA of the words English Wiktionary has none for. Its German entries are first
// cut to those two parts, once, into kaikki-de-edition-slim.jsonl.
// Usage: node scripts/data/de-kaikki.ts [path]   (default data/raw/kaikki-de.jsonl)
import { join } from "node:path";
import { COMPOUND_RULES } from "../../src/core/lexicon/compounds.ts";
import { GERMAN_RULES } from "../../src/core/phrases/de.ts";
import { RAW_DIR } from "./common.ts";
import {
  DE_FORMS,
  GERMAN_WORD,
  germanForms,
  germanWritten,
  readDeFrequency,
} from "./de-frequency.ts";
import { germanTreebankLemmas } from "./de-treebank.ts";
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
  selectOnlyPhrases: true,
  nounsCapitalised: true,
  editionIpa: germanEditionIpa,
  separableVerbs: true,
  compounds: COMPOUND_RULES.de,
};

async function main() {
  await slimEdition("de", KAIKKI_DE_EDITION_PATH, KAIKKI_DE_EDITION_SLIM_PATH);
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
    },
  );
  console.log(buildSummary("de", packs, writeLearningPacks("de", packs)));
  if (packs.stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
