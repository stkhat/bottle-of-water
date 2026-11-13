/**
 * An averaged-perceptron part-of-speech tagger (after Honnibal 2013, "A good POS tagger
 * in about 200 lines"). Language-independent: a language pack's model holds the tag set
 * and the weights (`scripts/data/tagger.ts` trains them). It tags a sentence left to
 * right, each word from its letters, its neighbours and the two tags before it.
 *
 * The data scripts import this file under plain Node: it has no imports.
 */

/** A trained model, as a language pack ships it (`en/tagger.json`). */
export interface PerceptronModel {
  /** The tag set. */
  readonly tags: readonly string[];
  /** Words with one tag in training (seen often, almost always with it): tagged without scoring. */
  readonly words: Readonly<Record<string, string>>;
  /** Feature → pairs of a tag's index in `tags` and its weight times `scale`, flat. */
  readonly weights: Readonly<Record<string, readonly number[]>>;
  /** The weights are integers: the trained weights times this. */
  readonly scale: number;
}

/** A word's tag and how far its score is ahead of the next best (Infinity: a known word). */
export interface ScoredTag {
  tag: string;
  margin: number;
}

const START = ["-START-", "-START2-"];
const END = ["-END-", "-END2-"];

/** A word as the features see it: numbers alike, the rest in lower case. */
const normalized = (word: string) =>
  /^\d[\d,.:/-]*$/.test(word) ? "!DIGITS" : word.toLowerCase();

/** Letter classes: "Lingo" → "Xxx", "2026" → "dd". */
const shapeOf = (word: string) =>
  word
    .replace(/[A-Z]/g, "X")
    .replace(/[a-z]/g, "x")
    .replace(/\d/g, "d")
    .replace(/(.)\1+/g, "$1$1");

/**
 * The features of the word at `i` in `context` (the normalized sentence, padded with
 * two start and two end markers, so `i` is the word's index plus 2), given the two
 * tags before it.
 */
export function featuresOf(
  i: number,
  word: string,
  context: readonly string[],
  previous: string,
  previous2: string,
): string[] {
  const w = context[i]!;
  const before = context[i - 1]!;
  const after = context[i + 1]!;
  return [
    "bias",
    `w ${w}`,
    `s3 ${w.slice(-3)}`,
    `s2 ${w.slice(-2)}`,
    `p1 ${w[0]}`,
    `pre3 ${w.slice(0, 3)}`,
    `sh ${shapeOf(word)}`,
    `t-1 ${previous}`,
    `t-2 ${previous2}`,
    `t-1t-2 ${previous} ${previous2}`,
    `t-1w ${previous} ${w}`,
    `w-1 ${before}`,
    `w-1s3 ${before.slice(-3)}`,
    `w-2 ${context[i - 2]}`,
    `w+1 ${after}`,
    `w+1s3 ${after.slice(-3)}`,
    `w+2 ${context[i + 2]}`,
    `w w+1 ${w} ${after}`,
    `w-1 w ${before} ${w}`,
  ];
}

/** The sentence with its start and end markers, as `featuresOf` reads it. */
export const contextOf = (words: readonly string[]) => [
  ...START,
  ...words.map(normalized),
  ...END,
];

export const START_TAGS = START;

/** Tags a sentence's tokens, one tag each. */
export function tagSentence(
  model: PerceptronModel,
  words: readonly string[],
): ScoredTag[] {
  const context = contextOf(words);
  const scores = new Float64Array(model.tags.length);
  let previous = START[0]!;
  let previous2 = START[1]!;
  return words.map((word, k) => {
    const known = Object.hasOwn(model.words, context[k + 2]!)
      ? model.words[context[k + 2]!]
      : undefined;
    let result: ScoredTag;
    if (known !== undefined) result = { tag: known, margin: Infinity };
    else {
      scores.fill(0);
      for (const feature of featuresOf(
        k + 2,
        word,
        context,
        previous,
        previous2,
      )) {
        const pairs = Object.hasOwn(model.weights, feature)
          ? model.weights[feature]!
          : undefined;
        if (!pairs) continue;
        for (let j = 0; j < pairs.length; j += 2)
          scores[pairs[j]!]! += pairs[j + 1]!;
      }
      let best = 0;
      let second = -Infinity;
      for (let t = 1; t < scores.length; t++) {
        if (scores[t]! > scores[best]!) {
          second = scores[best]!;
          best = t;
        } else if (scores[t]! > second) second = scores[t]!;
      }
      result = {
        tag: model.tags[best]!,
        margin: (scores[best]! - second) / model.scale,
      };
    }
    previous2 = previous;
    previous = result.tag;
    return result;
  });
}
