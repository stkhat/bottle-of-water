// kaikki.org English Wiktionary's French entries (CC BY-SA), the French frequency list
// (fr-frequency.ts) and UD French GSD's lemmas (fr-treebank.ts) →
// data/packs/fr/{freq,vocab,ipa,pos,phrases,names}.json,
// data/packs/fr/lemmas/{index,dict-<n>}.json and data/packs/fr-en/{index,dict-<n>}.json
// (then run npm run data:publish). The build is the learning-pack build Spanish uses
// (learning-kaikki.ts) with French's settings.
// The French Wiktionary extract (Wiktionnaire, kaikki-fr-edition.jsonl, 6.9 GB) gives
// its examples, which say how French writes each name, and the IPA of the words English
// Wiktionary has none for. The phrase build's example corpus is kaikki-fr's own. Its French entries are first cut to those two parts, once, into
// kaikki-fr-edition-slim.jsonl.
// Usage: node scripts/data/fr-kaikki.ts [path]   (default data/raw/kaikki-fr.jsonl)
import { join } from "node:path";
import { FRENCH_RULES } from "../../src/core/phrases/fr.ts";
import { RAW_DIR, type KaikkiEntry } from "./common.ts";
import {
  FR_FORMS,
  FRENCH_WORD,
  frenchForms,
  readFrFrequency,
} from "./fr-frequency.ts";
import { frenchReadWhole, frenchTreebankLemmas } from "./fr-treebank.ts";
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

export { slimEntry } from "./learning-kaikki.ts";

const KAIKKI_FR_PATH = join(RAW_DIR, "kaikki-fr.jsonl");
const KAIKKI_FR_EDITION_PATH = join(RAW_DIR, "kaikki-fr-edition.jsonl");
/** The French edition's French entries, with only their examples and pronunciations. */
const KAIKKI_FR_EDITION_SLIM_PATH = join(
  RAW_DIR,
  "kaikki-fr-edition-slim.jsonl",
);
/** Senses of a word read for a phrase's gloss bag, as Spanish's (`spanishPhraseBuild`). */
const PHRASE_WORD_SENSES = 3;

/**
 * A French headword written with an apostrophe is a word of its own ("d'accord",
 * "jusqu'à", "s'agir", "presqu'île") unless every sense of it is a contraction of the
 * words the tokenizer splits it into ("qu'il": contraction of que + il; "c'est"; "n'ai")
 * or a compound of them ("j'ai": compound of je and ai), as kaikki tags or glosses it.
 */
export function frenchOwnWord(entries: readonly KaikkiEntry[]): boolean {
  return entries.some(
    (entry) =>
      entry.pos !== "name" &&
      (entry.senses ?? []).some(
        (sense) =>
          !(sense.tags ?? []).includes("contraction") &&
          !(sense.glosses ?? []).some(
            (gloss) =>
              typeof gloss === "string" && /\bcompound of\b/i.test(gloss),
          ),
      ),
  );
}

/** A French word starting with a vowel, which "se" elides before ("s'attendre à"). */
const VOWEL_START = /^[aeiouyàâäéèêëîïôöùûü]/u;

/**
 * The phrase build's LEARNING settings for French (`PhraseBuildLanguage`), as Spanish's:
 * its words (`FRENCH_WORD`, lower case, hyphenated compounds included), the slots
 * "quelqu'un" and "quelque chose" (Wiktionary also writes qqn, qqch), the auxiliary
 * whose patterns are not detected (être: "être à" would match every "est à"; avoir's
 * are idioms, "avoir envie", "avoir l'air", and avoir as an auxiliary is followed by a
 * participle, which no pattern has), its closed classes, and pronominal
 * verbs written with "se" or "s'" before the infinitive ("se rendre compte", from the
 * plain verb's senses English Wiktionary tags reflexive).
 */
export function frenchPhraseBuild(
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
    lang: "fr",
    slots: new Set([...FRENCH_RULES.slots.keys(), "quelque chose"]),
    slotSpellings: new Map([
      ["qqn", "quelqu'un"],
      ["qqch", "quelque chose"],
    ]),
    auxiliaries: new Set(["être"]),
    word: /^\p{Ll}+(?:['-]\p{Ll}+)*'?$/u,
    pronominal: (key) =>
      /^(?:se |s')/u.test(key)
        ? key
        : VOWEL_START.test(key)
          ? `s'${key}`
          : `se ${key}`,
    exampleToken: /\p{L}+(?:['-]\p{L}+)*/gu,
    wordSenses: PHRASE_WORD_SENSES,
    functionWordSenses: 1,
    functionWord: (word) =>
      Object.hasOwn(pos, word) && CLOSED_CLASSES.has(pos[word]![0] ?? ""),
    closedClass: (key) =>
      key.split(" ").every((word) => GRAMMAR_CLASSES.has(main(word) ?? "")),
  };
}

/** French as the learning-pack build reads it (`LearningBuild`). */
export const FRENCH_BUILD: LearningBuild = {
  lang: "fr",
  word: FRENCH_WORD,
  ownWord: frenchOwnWord,
  phraseBuild: frenchPhraseBuild,
};

async function main() {
  await slimEdition("fr", KAIKKI_FR_EDITION_PATH, KAIKKI_FR_EDITION_SLIM_PATH);
  const forms = frenchForms(await readFrFrequency(FR_FORMS));
  const packs = await buildLearningPacks(
    { ...FRENCH_BUILD, readWhole: await frenchReadWhole() },
    process.argv[2] ?? KAIKKI_FR_PATH,
    forms,
    {
      treebank: await frenchTreebankLemmas(),
      casePaths: [KAIKKI_FR_EDITION_SLIM_PATH],
      ipaPaths: [KAIKKI_FR_EDITION_SLIM_PATH],
      // The phrase score reads English Wiktionary's French examples alone: with
      // Wiktionnaire's too, its count terms leave most common expressions undetected
      // ("par contre", "bien sûr", "se rendre compte"); judged blind (L1-4).
      ownEditionExamples: false,
    },
  );
  console.log(buildSummary("fr", packs, writeLearningPacks("fr", packs)));
  if (packs.stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
