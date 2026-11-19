// UD German GSD (CC BY-SA 4.0) → data/packs/de/tagger.json: the German part-of-speech
// tagger, an averaged perceptron (src/core/tagging/perceptron.ts) over universal tags
// with the verb form of verbs and auxiliaries (VERB.Fin, AUX.Part, …) and the separable
// verb particle (PART.Vz: "an" in "fängt … an"), trained on each sentence's text as
// Langle tokenizes it ("im", "zum" as one token, as the text writes them). Training is
// deterministic: the same treebank gives the same file. German HDT is not used
// (de-treebank.ts).
// Usage: node scripts/data/de-tagger.ts   (downloads missing raw files into data/raw/ud-german/)
import { readFileSync } from "node:fs";
import { tokenize } from "../../src/core/text/tokenize.ts";
import { writePack } from "./common.ts";
import { downloadGsd, GSD, gsdPath } from "./de-treebank.ts";
import { readAligned, trusted } from "./fr-tagger.ts";
import { accuracy, train } from "./tagger.ts";

/**
 * Weights smaller than this are dropped, as for Spanish and French: about 50–100 KB
 * gzipped.
 */
const MIN_WEIGHT = 3;
/** The margin the tagger trusts a tag from (src/core/tagging/de.ts). */
const THRESHOLD = 5;

/**
 * The common words GSD tags as proper nouns inside a name ("Bank" in "Deutsche Bank",
 * "Vereinigte" in "Vereinigte Staaten"), by their STTS tag: as the words they are. A
 * tagger cannot tell them from the same words outside names (382 of the test set's
 * nouns were read as proper nouns before), and their meanings are the words'.
 */
const NAME_WORDS: Readonly<Record<string, string>> = {
  NN: "NOUN",
  ADJA: "ADJ",
  ADJD: "ADJ",
  CARD: "NUM",
};

/**
 * The universal tag, with the verb form for verbs and auxiliaries (VERB.Fin, VERB.Inf,
 * VERB.Part; the zu-infinitive "anzufangen" is an infinitive; haben, sein, werden and
 * the modals always AUX), and PART.Vz for a
 * separable verb's particle, which the treebank tags as an adposition or an adverb
 * (STTS PTKVZ: "vor" in "stelle ich mir … vor").
 */
export function germanTag(upos: string, feats: string, xpos: string): string {
  if (xpos === "PTKVZ") return "PART.Vz";
  if (upos === "PROPN" && Object.hasOwn(NAME_WORDS, xpos))
    return NAME_WORDS[xpos]!;
  if (upos !== "VERB" && upos !== "AUX") return upos;
  const form = /(?:^|\|)VerbForm=(\w+)/.exec(feats)?.[1] ?? "Fin";
  // STTS tags every form of haben, sein, werden and the modals VA or VM; GSD's UPOS
  // calls a tenth of them VERB, at random to a tagger.
  return `${/^V[AM]/.test(xpos) ? "AUX" : upos}.${form}`;
}

/** Langle's German tokens of a text, as the pack tokenizes it (no elisions). */
const germanTokens = (sentence: string) =>
  tokenize(sentence, "de").filter((token) => token.text.trim() !== "");

async function main() {
  await downloadGsd();
  const read = (part: "train" | "dev" | "test") => {
    const { sentences, skipped } = readAligned(
      readFileSync(gsdPath(`${GSD.prefix}-${part}.conllu`), "utf8"),
      germanTokens,
      germanTag,
    );
    if (skipped > 0) console.log(`GSD ${part}: ${skipped} sentences left out`);
    return sentences;
  };
  const minWeight = Number(process.env.MIN_WEIGHT ?? MIN_WEIGHT);
  const model = train(read("train"), { minWeight, log: console.log });
  if (process.env.DRY_RUN !== "1") writePack("de/tagger.json", model);
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
    `de/tagger.json: ${Object.keys(model.weights).length} features, ` +
      `${Object.keys(model.words).length} known words, ${model.tags.length} tags`,
  );
}

if (import.meta.main) await main();
