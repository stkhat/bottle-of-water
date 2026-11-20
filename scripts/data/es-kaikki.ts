// kaikki.org Spanish Wiktionary extract (CC BY-SA), the Spanish frequency list and the
// UD Spanish treebanks' lemmas → data/packs/es/{freq,vocab,ipa,pos,phrases,names}.json,
// data/packs/es/lemmas/{index,dict-<n>}.json and data/packs/es-en/{index,dict-<n>}.json
// (then run npm run data:publish)
// The Spanish Wiktionary extract (kaikki-es-edition.jsonl) gives only its examples, which
// say how Spanish writes each name (`MOSTLY_CAPITALISED`) and, with kaikki-es's own,
// make the phrase build's example corpus (`importPhrases`, rule B2).
// Usage: node scripts/data/es-kaikki.ts [path]   (default data/raw/kaikki-es.jsonl; run es-frequency.ts first)
import { join } from "node:path";
import { SPANISH_RULES } from "../../src/core/phrases/es.ts";
import { RAW_DIR } from "./common.ts";
import { ES_FORMS, frequencyForms, readEsFrequency } from "./es-frequency.ts";
import { treebankFixed, treebankLemmas } from "./es-tagger.ts";
import {
  buildLearningPacks,
  buildSummary,
  CLOSED_CLASSES,
  GRAMMAR_CLASSES,
  writeLearningPacks,
  type LearningBuild,
  type LearningPacks,
} from "./learning-kaikki.ts";
import type { PhraseBuildLanguage } from "./phrases.ts";

export {
  altMeaning,
  byTreebank,
  byTreebankTags,
  partsOfSpeech,
  pointerMeaning,
  quotedMeaning,
  translationFirst,
  withoutHeadLabels,
} from "./learning-kaikki.ts";

const KAIKKI_ES_PATH = join(RAW_DIR, "kaikki-es.jsonl");
/** The Spanish Wiktionary extract: its examples only (`MOSTLY_CAPITALISED`, rule B2). */
const KAIKKI_ES_EDITION_PATH = join(RAW_DIR, "kaikki-es-edition.jsonl");
/**
 * Senses of a word read for a phrase's gloss bag: its first ones. kaikki-es glosses a
 * function word with every phrase it makes ("de": of, from, about…; "sobre todo" and
 * "ya que" would look explained by their words).
 */
const PHRASE_WORD_SENSES = 3;

/**
 * The phrase build's LEARNING settings for Spanish (`PhraseBuildLanguage`): its words
 * (accented lowercase letters), Wiktionary's slots ("tomar el pelo a alguien"), the
 * auxiliaries whose patterns are not detected (detection matches by base: "estar en"
 * would match every "está en"), and its closed classes from the words' main parts of
 * speech (`pos`; a form outside the vocabulary takes its first base's).
 */
export function spanishPhraseBuild(
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
    lang: "es",
    slots: new Set(SPANISH_RULES.slots.keys()),
    slotSpellings: new Map(),
    auxiliaries: new Set(["ser", "estar", "haber"]),
    word: /^\p{Ll}+$/u,
    wordSenses: PHRASE_WORD_SENSES,
    functionWordSenses: 1,
    functionWord: (word) =>
      Object.hasOwn(pos, word) && CLOSED_CLASSES.has(pos[word]![0] ?? ""),
    closedClass: (key) =>
      key.split(" ").every((word) => GRAMMAR_CLASSES.has(main(word) ?? "")),
  };
}

/** Spanish words: letters, accented ones included. */
const SPANISH_WORD = /^\p{L}+$/u;

/** Spanish as the learning-pack build reads it (`LearningBuild`). */
export const SPANISH_BUILD: LearningBuild = {
  lang: "es",
  word: SPANISH_WORD,
  phraseBuild: spanishPhraseBuild,
};

export type EsPacks = LearningPacks;

/** Builds the Spanish pack (`buildLearningPacks` with Spanish's settings). */
export const buildEsPacks = (
  path: string,
  forms: string[],
  options?: Parameters<typeof buildLearningPacks>[3],
) => buildLearningPacks(SPANISH_BUILD, path, forms, options);

/** Writes es/ and es-en/ under `dir` (`writeLearningPacks`). */
export const writeEsPacks = (packs: EsPacks, dir?: string) =>
  writeLearningPacks("es", packs, dir);

async function main() {
  const forms = frequencyForms(await readEsFrequency(ES_FORMS));
  const packs = await buildEsPacks(process.argv[2] ?? KAIKKI_ES_PATH, forms, {
    treebank: await treebankLemmas(),
    fixed: await treebankFixed(),
    casePaths: [KAIKKI_ES_EDITION_PATH],
  });
  console.log(buildSummary("es", packs, writeEsPacks(packs)));
  if (packs.stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
