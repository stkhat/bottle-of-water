// UD French GSD (CC BY-SA 4.0) → data/packs/fr/tagger.json: the French part-of-speech
// tagger, an averaged perceptron (src/core/tagging/perceptron.ts) over universal tags
// with the verb form of verbs and auxiliaries (VERB.Fin, AUX.Part, …), trained on each
// sentence's text as Langle tokenizes it (elisions split, words of their own kept
// whole). It reads the built pack's vocabulary and lemmas for those words, so it runs
// after fr-kaikki.ts. Training is deterministic: the same treebank and pack give the
// same file. French Sequoia and ParTUT are not used (fr-treebank.ts).
// Usage: node scripts/data/fr-tagger.ts   (downloads missing raw files into data/raw/ud-french/)
import { readFileSync } from "node:fs";
import {
  tagSentence,
  type PerceptronModel,
} from "../../src/core/tagging/perceptron.ts";
import { normalizeWord, tokenize } from "../../src/core/text/tokenize.ts";
import { readPack, writePack } from "./common.ts";
import { downloadGsd, GSD, gsdPath } from "./fr-treebank.ts";
import { accuracy, train, type TaggedSentence } from "./tagger.ts";

/**
 * Weights smaller than this are dropped, as for Spanish (es-tagger.ts): about 100 KB
 * gzipped.
 */
const MIN_WEIGHT = 3;
/** The margin the tagger trusts a tag from (src/core/tagging/fr.ts). */
const THRESHOLD = 5;

/**
 * The universal tag, with the verb form for verbs and auxiliaries: VERB.Fin, VERB.Inf,
 * VERB.Part (the past participle), VERB.Ger (the present participle, also in the
 * gerund "en mangeant", which the treebank writes as a participle in the present).
 */
export function frenchTag(upos: string, feats: string): string {
  if (upos !== "VERB" && upos !== "AUX") return upos;
  const form = /(?:^|\|)VerbForm=(\w+)/.exec(feats)?.[1] ?? "Fin";
  const present = /(?:^|\|)Tense=Pres(?:\||$)/.test(feats);
  if (form === "Part" && present) return `${upos}.Ger`;
  return `${upos}.${form === "Conv" ? "Ger" : form}`;
}

/** A treebank word's tag for the tagger, from its UPOS, features and language tag (XPOS). */
export type TagOf = (upos: string, feats: string, xpos: string) => string;

/**
 * A token of the treebank's text: as written, where it is, its tag, and whether it is
 * inside a fixed expression after its first word (deprel `fixed`).
 */
interface Surface {
  form: string;
  start: number;
  end: number;
  tag: string;
  fixed: boolean;
}

const textOf = (lines: readonly string[]) =>
  lines.find((line) => line.startsWith("# text = "))?.slice("# text = ".length);

/**
 * One CoNLL-U sentence's tokens as written in its text (`# text`), with their offsets:
 * a multiword token ("du" = de + le, "auquel") is one, with its first word's tag.
 * Undefined when a token is not found in the text.
 */
function surfaceOf(lines: readonly string[], text: string, tagOf: TagOf) {
  const tokens: Omit<Surface, "start" | "end">[] = [];
  let multiword: string | undefined;
  let skipTo = 0;
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const [id = "", form, , upos, xpos = "_", feats = "_", , deprel = ""] =
      line.split("\t");
    if (!form || !upos || id.includes(".")) continue;
    const range = /^(\d+)-(\d+)$/.exec(id);
    if (range) {
      multiword = form;
      skipTo = Number(range[2]);
      continue;
    }
    const tag = tagOf(upos, feats, xpos);
    const fixed = deprel === "fixed";
    if (multiword !== undefined) {
      tokens.push({ form: multiword, tag, fixed });
      multiword = undefined;
    } else if (Number(id) > skipTo) tokens.push({ form, tag, fixed });
  }
  const placed: Surface[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const start = text.indexOf(token.form, cursor);
    if (start < 0) return undefined;
    cursor = start + token.form.length;
    placed.push({ ...token, start, end: cursor });
  }
  return placed;
}

/**
 * The sentences of a CoNLL-U file as Langle's tokenizer splits their text (`split`:
 * each token's text and offset, spaces left out), each token with the tag of the
 * treebank token it starts in: "l'" of "l'homme" its determiner's, "du" its
 * preposition's, "peut" and "être" of "peut-être" the adverb's. A sentence whose
 * tokens are not found in its text is left out (`skipped`).
 */
export function readAligned(
  text: string,
  split: (sentence: string) => readonly { text: string; start: number }[],
  tagOf: TagOf = frenchTag,
): { sentences: TaggedSentence[]; skipped: number } {
  const sentences: TaggedSentence[] = [];
  let skipped = 0;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((line) => line !== "");
    if (lines.length === 0) continue;
    const sentence = textOf(lines);
    const surface =
      sentence === undefined ? undefined : surfaceOf(lines, sentence, tagOf);
    if (sentence === undefined || !surface) {
      skipped++;
      continue;
    }
    const words: string[] = [];
    const tags: string[] = [];
    const fixed: boolean[] = [];
    let k = 0;
    let found = true;
    for (const token of split(sentence)) {
      while (k < surface.length && surface[k]!.end <= token.start) k++;
      const at = surface[k];
      if (!at || at.start > token.start) {
        found = false;
        break;
      }
      words.push(token.text.replaceAll("’", "'"));
      tags.push(at.tag);
      fixed.push(at.fixed);
    }
    if (!found || words.length === 0) {
      skipped++;
      continue;
    }
    sentences.push({ words, tags, fixed });
  }
  return { sentences, skipped };
}

/**
 * Langle's French tokens of a text, as the pack tokenizes it (`LanguagePack.tokenize`):
 * a word written with an elision is whole when the pack knows it as written.
 */
function frenchTokens() {
  const vocab = new Set(readPack<string[]>("fr/vocab.json"));
  const index = readPack<{ shards: { file: string }[] }>(
    "fr/lemmas/index.json",
  );
  const shards = index.shards.map(({ file }) =>
    readPack<Record<string, unknown>>(`fr/lemmas/${file}`),
  );
  const known = (word: string) => {
    const key = normalizeWord(word);
    return vocab.has(key) || shards.some((shard) => Object.hasOwn(shard, key));
  };
  return (sentence: string) =>
    tokenize(sentence, "fr", known).filter((token) => token.text.trim() !== "");
}

/** Share of the tokens tagged at or above `threshold`, and how many of those are right. */
export function trusted(
  model: PerceptronModel,
  sentences: readonly TaggedSentence[],
  threshold: number,
) {
  let total = 0;
  let kept = 0;
  let right = 0;
  for (const { words, tags } of sentences)
    tagSentence(model, words).forEach(({ tag, margin }, i) => {
      total++;
      if (margin < threshold) return;
      kept++;
      if (tag === tags[i]) right++;
    });
  return { share: kept / total, accuracy: right / kept };
}

async function main() {
  await downloadGsd();
  const split = frenchTokens();
  const read = (part: "train" | "dev" | "test") => {
    const { sentences, skipped } = readAligned(
      readFileSync(gsdPath(`${GSD.prefix}-${part}.conllu`), "utf8"),
      split,
    );
    if (skipped > 0) console.log(`GSD ${part}: ${skipped} sentences left out`);
    return sentences;
  };
  const minWeight = Number(process.env.MIN_WEIGHT ?? MIN_WEIGHT);
  const model = train(read("train"), { minWeight, log: console.log });
  writePack("fr/tagger.json", model);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  for (const part of ["dev", "test"] as const) {
    const sentences = read(part);
    const thresholds = [
      THRESHOLD,
      ...(process.env.THRESHOLDS ?? "").split(",").filter(Boolean).map(Number),
    ];
    const kept = thresholds
      .map((threshold) => {
        const { share, accuracy } = trusted(model, sentences, threshold);
        return `at ${threshold} ${pct(share)} of tokens, ${pct(accuracy)} right`;
      })
      .join("; ");
    console.log(
      `GSD ${part}: accuracy ${pct(accuracy(model, sentences))}; trusted ${kept}`,
    );
  }
  console.log(
    `fr/tagger.json: ${Object.keys(model.weights).length} features, ` +
      `${Object.keys(model.words).length} known words, ${model.tags.length} tags`,
  );
}

if (import.meta.main) await main();
