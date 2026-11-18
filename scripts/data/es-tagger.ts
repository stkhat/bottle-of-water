// UD Spanish AnCora (CC BY 4.0) and GSD (CC BY-SA 4.0) → data/packs/es/tagger.json: the
// Spanish part-of-speech tagger, an averaged perceptron (src/core/tagging/perceptron.ts)
// over universal tags with the verb form of verbs and auxiliaries (VERB.Fin, AUX.Part,
// …). Training is deterministic: the same treebanks give the same file. es-kaikki.ts
// also reads the treebanks' lemmas here, to order a form's bases.
// Usage: node scripts/data/es-tagger.ts   (downloads missing raw files into data/raw/ud-spanish/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  tagSentence,
  type PerceptronModel,
} from "../../src/core/tagging/perceptron.ts";
import { fetchText, RAW_DIR, writePack } from "./common.ts";
import { accuracy, train, type TaggedSentence } from "./tagger.ts";

const UD_DIR = join(RAW_DIR, "ud-spanish");
/**
 * The treebanks at the commits the model was trained on: their default branches on
 * 2026-11-18, whose last release is UD 2.18.
 */
export const TREEBANKS = {
  AnCora: {
    commit: "3ea1f747220979d91787a6d04b85734a42bf22a4",
    prefix: "es_ancora-ud",
  },
  GSD: {
    commit: "1b694f5c6bbeed3b130c6eeae75d70836a360832",
    prefix: "es_gsd-ud",
  },
} as const;
type Treebank = keyof typeof TREEBANKS;
const SPLITS = ["train", "dev", "test"] as const;
type Split = (typeof SPLITS)[number];

/**
 * Weights smaller than this are dropped: 98 KB gzipped instead of 304 KB (weights from
 * 2), 0.5 points less accurate (user, 2026-11-18).
 */
const MIN_WEIGHT = 3;
/** The margin the tagger trusts a tag from (src/core/tagging/es.ts). */
const THRESHOLD = 5;

/** The universal tag, with the verb form for verbs and auxiliaries (VERB.Fin, AUX.Inf). */
export function spanishTag(upos: string, feats: string): string {
  if (upos !== "VERB" && upos !== "AUX") return upos;
  const form = /(?:^|\|)VerbForm=(\w+)/.exec(feats)?.[1] ?? "Fin";
  return `${upos}.${form === "Conv" ? "Ger" : form}`;
}

/**
 * The sentences of a CoNLL-U file as the tokens written in the text and their tags. A
 * multiword token ("del" = de + el, "dímelo" = di + me + lo) is one token with its
 * first word's tag, as Langle's tokenizer gives it one token.
 */
export function readSurface(text: string): TaggedSentence[] {
  const sentences: TaggedSentence[] = [];
  let current: TaggedSentence = { words: [], tags: [] };
  /** The multiword token whose first word is next, and its last word's id. */
  let multiword: string | undefined;
  let skipTo = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line === "") {
      if (current.words.length > 0) sentences.push(current);
      current = { words: [], tags: [] };
      skipTo = 0;
      continue;
    }
    if (line.startsWith("#")) continue;
    const [id = "", form, , upos, , feats = "_"] = line.split("\t");
    if (!form || !upos || id.includes(".")) continue;
    const range = /^(\d+)-(\d+)$/.exec(id);
    if (range) {
      multiword = form;
      skipTo = Number(range[2]);
      continue;
    }
    const tag = spanishTag(upos, feats);
    if (multiword !== undefined) {
      current.words.push(multiword);
      current.tags.push(tag);
      multiword = undefined;
    } else if (Number(id) > skipTo) {
      current.words.push(form);
      current.tags.push(tag);
    }
  }
  if (current.words.length > 0) sentences.push(current);
  return sentences;
}

/**
 * How often treebank words have each lemma and tag: per form and lemma (`form lemma`),
 * per lemma, and per form and universal tag (`form NOUN`).
 */
export interface LemmaCounts {
  byForm: ReadonlyMap<string, number>;
  byLemma: ReadonlyMap<string, number>;
  byTag: ReadonlyMap<string, number>;
}

/**
 * The lemma and tag counts of CoNLL-U texts: their words (not multiword tokens), form
 * and lemma in lower case.
 */
export function lemmaCounts(texts: readonly string[]): LemmaCounts {
  const byForm = new Map<string, number>();
  const byLemma = new Map<string, number>();
  const byTag = new Map<string, number>();
  const add = (map: Map<string, number>, key: string) =>
    map.set(key, (map.get(key) ?? 0) + 1);
  for (const text of texts)
    for (const line of text.split(/\r?\n/)) {
      const [id = "", form, lemma, upos] = line.split("\t");
      if (!form || !lemma || lemma === "_" || !/^\d+$/.test(id)) continue;
      const lower = form.toLowerCase();
      const base = lemma.toLowerCase();
      add(byForm, `${lower} ${base}`);
      add(byLemma, base);
      if (upos && upos !== "_") add(byTag, `${lower} ${upos}`);
    }
  return { byForm, byLemma, byTag };
}

const fileName = (treebank: Treebank, file: string) => `${treebank}-${file}`;

async function download() {
  mkdirSync(UD_DIR, { recursive: true });
  for (const [treebank, { commit, prefix }] of Object.entries(TREEBANKS)) {
    const files = [
      "LICENSE.txt",
      "README.md",
      ...SPLITS.map((split) => `${prefix}-${split}.conllu`),
    ];
    for (const file of files) {
      const path = join(UD_DIR, fileName(treebank as Treebank, file));
      if (existsSync(path)) continue;
      console.log(`Downloading UD_Spanish-${treebank} ${file}`);
      const url = `https://raw.githubusercontent.com/UniversalDependencies/UD_Spanish-${treebank}/${commit}/${file}`;
      writeFileSync(path, await fetchText(url));
    }
  }
}

const readText = (treebank: Treebank, split: Split) =>
  readFileSync(
    join(
      UD_DIR,
      fileName(treebank, `${TREEBANKS[treebank].prefix}-${split}.conllu`),
    ),
    "utf8",
  );

const TREEBANK_NAMES = Object.keys(TREEBANKS) as Treebank[];

/** The training sentences' lemma counts (es-kaikki.ts orders a form's bases by them). */
export async function treebankLemmas() {
  await download();
  return lemmaCounts(TREEBANK_NAMES.map((t) => readText(t, "train")));
}

/** Share of the tokens tagged at or above `threshold`, and how many of those are right. */
function trusted(model: PerceptronModel, sentences: readonly TaggedSentence[]) {
  let total = 0;
  let kept = 0;
  let right = 0;
  for (const { words, tags } of sentences)
    tagSentence(model, words).forEach(({ tag, margin }, i) => {
      total++;
      if (margin < THRESHOLD) return;
      kept++;
      if (tag === tags[i]) right++;
    });
  return { share: kept / total, accuracy: right / kept };
}

async function main() {
  await download();
  const read = (treebank: Treebank, split: Split) =>
    readSurface(readText(treebank, split));
  const model = train(
    TREEBANK_NAMES.flatMap((t) => read(t, "train")),
    { minWeight: MIN_WEIGHT, log: console.log },
  );
  writePack("es/tagger.json", model);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  for (const treebank of TREEBANK_NAMES)
    for (const split of ["dev", "test"] as const) {
      const sentences = read(treebank, split);
      const kept = trusted(model, sentences);
      console.log(
        `${treebank} ${split}: accuracy ${pct(accuracy(model, sentences))}; ` +
          `trusted ${pct(kept.share)} of tokens at ${pct(kept.accuracy)}`,
      );
    }
  console.log(
    `es/tagger.json: ${Object.keys(model.weights).length} features, ` +
      `${Object.keys(model.words).length} known words, ${model.tags.length} tags`,
  );
}

if (import.meta.main) await main();
