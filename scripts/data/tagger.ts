// UD English-EWT (CC BY-SA 4.0) → public/packs/en/tagger.json: the English
// part-of-speech tagger, an averaged perceptron over Penn Treebank tags
// (src/core/tagging/perceptron.ts). Training is deterministic: the same treebank gives
// the same file.
// Usage: node scripts/data/tagger.ts   (downloads missing raw files into data/raw/ud-english-ewt/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  contextOf,
  featuresOf,
  START_TAGS,
  tagSentence,
  type PerceptronModel,
} from "../../src/core/tagging/perceptron.ts";
import { fetchText, RAW_DIR, writePack } from "./common.ts";

/** UD English-EWT release r2.19. */
const COMMIT = "6b021622f3ab7902730f313fa5955a8b8cdd52b8";
const BASE_URL = `https://raw.githubusercontent.com/UniversalDependencies/UD_English-EWT/${COMMIT}/`;
const EWT_DIR = join(RAW_DIR, "ud-english-ewt");
const SPLITS = ["train", "dev", "test"] as const;
type Split = (typeof SPLITS)[number];

/** Passes over the training sentences. */
const ITERATIONS = 6;
/** A word seen this often, with one tag this share of the time, is tagged without scoring. */
const KNOWN_MIN_COUNT = 20;
const KNOWN_MIN_SHARE = 0.97;
/** Weights smaller than this are dropped: 125 KB gzipped instead of 1.8 MB, 0.7 points less accurate. */
const MIN_WEIGHT = 2;
/** Weights are kept to one decimal, as integers. */
const SCALE = 10;

export interface TaggedSentence {
  words: string[];
  tags: string[];
}

/**
 * The sentences of a CoNLL-U file as their tokens (not multiword tokens: "don't" is
 * "do" and "n't", as the tagger splits them too) and their Penn Treebank tags (XPOS).
 */
export function readConllu(text: string): TaggedSentence[] {
  const sentences: TaggedSentence[] = [];
  let current: TaggedSentence = { words: [], tags: [] };
  for (const line of text.split(/\r?\n/)) {
    if (line === "") {
      if (current.words.length > 0) sentences.push(current);
      current = { words: [], tags: [] };
      continue;
    }
    if (line.startsWith("#")) continue;
    const [id, form, , , xpos] = line.split("\t");
    if (!id || /[.-]/.test(id) || !form || !xpos || xpos === "_") continue;
    current.words.push(form);
    current.tags.push(xpos);
  }
  if (current.words.length > 0) sentences.push(current);
  return sentences;
}

/** Trains a model on `sentences`; prints the training accuracy of each pass with `log`. */
export function train(
  sentences: readonly TaggedSentence[],
  {
    iterations = ITERATIONS,
    minWeight = MIN_WEIGHT,
    log = (() => {}) as (line: string) => void,
  } = {},
): PerceptronModel {
  // Tags and the words known without scoring.
  const tagSet = new Set<string>();
  const counts = new Map<string, Map<string, number>>();
  for (const { words, tags } of sentences)
    words.forEach((word, i) => {
      const tag = tags[i]!;
      tagSet.add(tag);
      const key = contextOf([word])[2]!;
      const byTag = counts.get(key) ?? new Map<string, number>();
      byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
      counts.set(key, byTag);
    });
  const tags = [...tagSet].sort();
  const known: Record<string, string> = {};
  for (const [word, byTag] of counts) {
    const total = [...byTag.values()].reduce((a, b) => a + b, 0);
    const [tag, n] = [...byTag].sort((a, b) => b[1] - a[1])[0]!;
    if (total >= KNOWN_MIN_COUNT && n / total >= KNOWN_MIN_SHARE)
      known[word] = tag;
  }

  // Weights (feature → tag → weight), with the sums and time stamps that average them
  // (keyed by tag and feature).
  const weights = new Map<string, Map<number, number>>();
  const totals = new Map<string, number>();
  const stamps = new Map<string, number>();
  let instances = 0;
  const update = (feature: string, tag: number, value: number) => {
    let row = weights.get(feature);
    if (!row) weights.set(feature, (row = new Map()));
    const weight = row.get(tag) ?? 0;
    const key = `${tag}\u0001${feature}`;
    totals.set(
      key,
      (totals.get(key) ?? 0) + (instances - (stamps.get(key) ?? 0)) * weight,
    );
    stamps.set(key, instances);
    row.set(tag, weight + value);
  };
  const best = (features: readonly string[]) => {
    const scores = new Float64Array(tags.length);
    for (const feature of features) {
      const row = weights.get(feature);
      if (row) for (const [t, weight] of row) scores[t]! += weight;
    }
    let top = 0;
    for (let t = 1; t < scores.length; t++)
      if (scores[t]! > scores[top]!) top = t;
    return top;
  };

  let order = [...sentences];
  for (let pass = 0; pass < iterations; pass++) {
    let correct = 0;
    let seen = 0;
    for (const { words, tags: truth } of order) {
      const context = contextOf(words);
      let previous = START_TAGS[0]!;
      let previous2 = START_TAGS[1]!;
      words.forEach((word, k) => {
        let guess = Object.hasOwn(known, context[k + 2]!)
          ? known[context[k + 2]!]!
          : undefined;
        if (guess === undefined) {
          const features = featuresOf(
            k + 2,
            word,
            context,
            previous,
            previous2,
          );
          const index = best(features);
          guess = tags[index]!;
          instances++;
          const right = tags.indexOf(truth[k]!);
          if (index !== right)
            for (const feature of features) {
              update(feature, right, 1);
              update(feature, index, -1);
            }
        }
        if (guess === truth[k]) correct++;
        seen++;
        previous2 = previous;
        previous = guess;
      });
    }
    log(`pass ${pass + 1}: training accuracy ${(correct / seen).toFixed(4)}`);
    // The same shuffle every time.
    order = order
      .map(
        (sentence, i) => [((i * 2654435761) ^ pass) >>> 0, sentence] as const,
      )
      .sort((a, b) => a[0] - b[0])
      .map(([, sentence]) => sentence);
  }

  // Averaged weights, the small ones dropped, as integers.
  const kept: Record<string, number[]> = {};
  for (const [feature, row] of weights) {
    const pairs: number[] = [];
    for (const [t, weight] of [...row].sort((a, b) => a[0] - b[0])) {
      const key = `${t}\u0001${feature}`;
      const total =
        (totals.get(key) ?? 0) + (instances - (stamps.get(key) ?? 0)) * weight;
      const average = total / instances;
      if (Math.abs(average) >= minWeight)
        pairs.push(t, Math.round(average * SCALE));
    }
    if (pairs.length > 0) kept[feature] = pairs;
  }
  return { tags, words: known, weights: kept, scale: SCALE };
}

/** Share of tokens `model` tags as the treebank does. */
export function accuracy(
  model: PerceptronModel,
  sentences: readonly TaggedSentence[],
) {
  let correct = 0;
  let total = 0;
  for (const { words, tags } of sentences)
    tagSentence(model, words).forEach(({ tag }, i) => {
      if (tag === tags[i]) correct++;
      total++;
    });
  return correct / total;
}

async function download() {
  mkdirSync(EWT_DIR, { recursive: true });
  for (const split of [...SPLITS, "LICENSE"] as const) {
    const file =
      split === "LICENSE" ? "LICENSE.txt" : `en_ewt-ud-${split}.conllu`;
    const path = join(EWT_DIR, file);
    if (existsSync(path)) continue;
    console.log(`Downloading ${file}`);
    writeFileSync(path, await fetchText(`${BASE_URL}${file}`));
  }
}

const readSplit = (split: Split) =>
  readConllu(readFileSync(join(EWT_DIR, `en_ewt-ud-${split}.conllu`), "utf8"));

async function main() {
  await download();
  const model = train(readSplit("train"), { log: console.log });
  writePack("en/tagger.json", model);
  console.log(
    `en/tagger.json: ${Object.keys(model.weights).length} features, ` +
      `${Object.keys(model.words).length} known words; ` +
      `accuracy dev ${(accuracy(model, readSplit("dev")) * 100).toFixed(1)}%, ` +
      `test ${(accuracy(model, readSplit("test")) * 100).toFixed(1)}%`,
  );
}

if (import.meta.main) await main();
