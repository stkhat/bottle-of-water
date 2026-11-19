// UD French GSD (CC BY-SA 4.0): the treebank's lemmas, which order a French form's
// bases (fr-kaikki.ts), as Spanish's treebanks do (es-tagger.ts), and the French
// tagger's training sentences (fr-tagger.ts). French Sequoia
// (LGPL-LR) and ParTUT (CC BY-NC-SA) are not used: their licences are not allowed.
// Usage: node scripts/data/fr-treebank.ts   (downloads missing raw files into data/raw/ud-french/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchText, RAW_DIR } from "./common.ts";
import { lemmaCounts } from "./es-tagger.ts";

const UD_DIR = join(RAW_DIR, "ud-french");
/** The treebank at the commit its lemmas were read from: its default branch on 2026-11-19. */
export const GSD = {
  commit: "7110d4660ba088b630eb5928a6a1d35523898e05",
  prefix: "fr_gsd-ud",
} as const;
const SPLITS = ["train", "dev", "test"] as const;

/** A raw file of the treebank, as downloaded into data/raw/ud-french/. */
export const gsdPath = (file: string) => join(UD_DIR, `GSD-${file}`);
const pathOf = gsdPath;

/** Downloads the treebank's missing raw files. */
export async function downloadGsd() {
  mkdirSync(UD_DIR, { recursive: true });
  const files = [
    "LICENSE.txt",
    "README.md",
    ...SPLITS.map((split) => `${GSD.prefix}-${split}.conllu`),
  ];
  for (const file of files) {
    if (existsSync(pathOf(file))) continue;
    console.log(`Downloading UD_French-GSD ${file}`);
    const url = `https://raw.githubusercontent.com/UniversalDependencies/UD_French-GSD/${GSD.commit}/${file}`;
    writeFileSync(pathOf(file), await fetchText(url));
  }
}

/**
 * How often the treebank writes each elided word with the word after it ("d'" +
 * "accord" → "d'accord"), and how often of those it joins the two as one expression:
 * a fixed expression (`fixed`) or a pronominal verb's pronoun (`expl:pv`, "s'agit").
 */
export function elisionPairs(text: string) {
  const pairs = new Map<string, { joined: number; total: number }>();
  for (const sentence of text.split(/\r?\n\r?\n/)) {
    const words = new Map<number, string[]>();
    for (const line of sentence.split(/\r?\n/)) {
      const columns = line.split("\t");
      if (/^\d+$/.test(columns[0] ?? ""))
        words.set(Number(columns[0]), columns);
    }
    for (const [id, word] of words) {
      const next = words.get(id + 1);
      const elided = (word[1] ?? "").toLowerCase().replaceAll("’", "'");
      if (!next || !elided.endsWith("'")) continue;
      const key = elided + (next[1] ?? "").toLowerCase();
      const joins = (a: string[], b: number) =>
        (a[7] === "fixed" || a[7] === "expl:pv") && Number(a[6]) === b;
      const found = pairs.get(key) ?? { joined: 0, total: 0 };
      found.total++;
      if (joins(next, id) || joins(word, id + 1)) found.joined++;
      pairs.set(key, found);
    }
  }
  return pairs;
}

/**
 * How often the treebank writes each hyphenated word, and how often as one token: it
 * keeps compounds whole ("peut-être", "c'est-à-dire", "nord-est") and splits a verb
 * from the pronoun after it ("est" + "-ce", "a" + "-t-il").
 */
export function hyphenPairs(text: string) {
  const pairs = new Map<string, { joined: number; total: number }>();
  const add = (key: string, joined: boolean) => {
    const found = pairs.get(key) ?? { joined: 0, total: 0 };
    found.total++;
    if (joined) found.joined++;
    pairs.set(key, found);
  };
  for (const sentence of text.split(/\r?\n\r?\n/)) {
    const forms: string[] = [];
    for (const line of sentence.split(/\r?\n/)) {
      const columns = line.split("\t");
      if (/^\d+$/.test(columns[0] ?? ""))
        forms.push((columns[1] ?? "").toLowerCase().replaceAll("’", "'"));
    }
    forms.forEach((form, i) => {
      if (/\p{L}-\p{L}/u.test(form) && !form.startsWith("-")) add(form, true);
      const next = forms[i + 1];
      if (next?.startsWith("-") && /\p{L}$/u.test(form))
        add(form + next, false);
    });
  }
  return pairs;
}

/** Below this many occurrences the treebank says nothing of a word read whole. */
const MIN_PAIRS = 3;

/**
 * Whether French text reads a word written with an elision or a hyphen as one
 * (`readWhole`): the treebank joins its parts in at least half of its occurrences, or
 * has it too rarely to tell ("jusqu'ici", "vas-y").
 */
export async function frenchReadWhole() {
  await downloadGsd();
  const text = readFileSync(pathOf(`${GSD.prefix}-train.conllu`), "utf8");
  const elided = elisionPairs(text);
  const hyphenated = hyphenPairs(text);
  return (word: string) => {
    const found = (word.includes("-") ? hyphenated : elided).get(word);
    return !found || found.total < MIN_PAIRS || found.joined * 2 >= found.total;
  };
}

/**
 * How often the treebank's verbs take a reflexive pronoun (Reflex=Yes, attached to the
 * verb), and how often of those as part of the verb itself (`expl:pv`, "s'appeler",
 * "se passer"), not as its object ("se voir", "se dire": obj, iobj) or a passive's
 * (`expl:pass`), by the verb's lemma.
 */
export function pronominalCounts(text: string) {
  const counts = new Map<string, { pronominal: number; total: number }>();
  for (const sentence of text.split(/\r?\n\r?\n/)) {
    const words = new Map<string, string[]>();
    for (const line of sentence.split(/\r?\n/)) {
      const columns = line.split("\t");
      if (/^\d+$/.test(columns[0] ?? "")) words.set(columns[0]!, columns);
    }
    for (const word of words.values()) {
      if (word[3] !== "PRON" || !(word[5] ?? "").includes("Reflex=Yes"))
        continue;
      const head = words.get(word[6] ?? "");
      if (!head || (head[3] !== "VERB" && head[3] !== "AUX")) continue;
      const verb = head[2] ?? "";
      const found = counts.get(verb) ?? { pronominal: 0, total: 0 };
      found.total++;
      if (word[7] === "expl:pv") found.pronominal++;
      counts.set(verb, found);
    }
  }
  return counts;
}

/**
 * The verbs whose reflexive pronoun is part of the verb (`LearningBuild.pronominalVerb`):
 * the treebank attaches it as such (`pronominalCounts`) in at least half of the times
 * it has one ("s'appeler", "se passer", "se trouver", "se tromper"; not "se dire", "se
 * voir", "se faire").
 */
export async function frenchPronominalVerbs() {
  await downloadGsd();
  const counts = pronominalCounts(
    readFileSync(pathOf(`${GSD.prefix}-train.conllu`), "utf8"),
  );
  return (verb: string) => {
    const found = counts.get(verb);
    return found !== undefined && found.pronominal * 2 >= found.total;
  };
}

/** The training sentences' lemma counts (`lemmaCounts`). */
export async function frenchTreebankLemmas() {
  await downloadGsd();
  return lemmaCounts([
    readFileSync(pathOf(`${GSD.prefix}-train.conllu`), "utf8"),
  ]);
}

async function main() {
  const { byForm, byLemma } = await frenchTreebankLemmas();
  console.log(
    `UD French GSD (train): ${byLemma.size} lemmas, ${byForm.size} form-lemma pairs`,
  );
}

if (import.meta.main) await main();
