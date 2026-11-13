/**
 * English's tagger: the averaged perceptron trained on UD English-EWT (Penn Treebank
 * tags), and English grammar for how a tagged word is used: auxiliaries (have, be, do,
 * get) and participles used as adjectives or prepositions.
 */
import { tagSentence, type PerceptronModel } from "./perceptron";
import type { Tagger, TaggedWord, TokenTag, WordUse } from "./tagger";

/**
 * A tag's score margin from which it is trusted. On EWT's test set, 5 keeps about 90%
 * of the content words (nouns, verbs, adjectives, adverbs) at about 96% accuracy.
 */
const THRESHOLD = 5;

/** Penn Treebank tag → the dictionaries' part of speech, and whether it is an inflected form. */
const PTB: Readonly<
  Record<string, readonly [label: string, inflected: boolean]>
> = {
  NN: ["noun", false],
  NNS: ["noun", false],
  NNP: ["noun", false],
  NNPS: ["noun", false],
  VB: ["verb", false],
  VBP: ["verb", false],
  VBZ: ["verb", true],
  VBD: ["verb", true],
  VBN: ["verb", true],
  VBG: ["verb", true],
  MD: ["verb", false],
  JJ: ["adjective", false],
  JJR: ["adjective", true],
  JJS: ["adjective", true],
  RB: ["adverb", false],
  RBR: ["adverb", true],
  RBS: ["adverb", true],
  WRB: ["adverb", false],
  // Particles (give up): the dictionaries label up, out and off as adverbs.
  RP: ["adverb", false],
  IN: ["preposition", false],
  TO: ["particle", false],
  DT: ["determiner", false],
  PDT: ["determiner", false],
  // Mostly relative pronouns: "the idea, which is …", "the car that …".
  WDT: ["pronoun", false],
  PRP$: ["determiner", false],
  WP$: ["determiner", false],
  PRP: ["pronoun", false],
  WP: ["pronoun", false],
  EX: ["pronoun", false],
  CC: ["conjunction", false],
  CD: ["numeral", false],
  UH: ["interjection", false],
};

/** Tags of forms with an ending: inflected forms and plurals. */
const MORPH = /^(VBD|VBN|VBG|VBZ|NNS|NNPS|JJR|JJS|RBR|RBS)$/;

/** Contractions the treebank writes as two tokens: "do" "n't", "I" "'m". */
const CONTRACTION = /^(.+?)(n't|'s|'re|'ll|'ve|'d|'m)$/i;

/** The treebank's tokens of a token as written: contractions split, ’ written as '. */
function treebankTokens(token: string): string[] {
  const text = token.replaceAll("’", "'");
  const split = CONTRACTION.exec(text);
  const words =
    split && /\p{L}/u.test(split[1]!) ? [split[1]!, split[2]!] : [text];
  // The treebank writes the pronoun I in capitals (lower-cased captions do not).
  return words.map((word) => (word === "i" ? "I" : word));
}

function tokenTag(tag: string, confidence: number): TokenTag {
  const [label, inflected] = Object.hasOwn(PTB, tag)
    ? PTB[tag]!
    : ["other", false];
  return {
    tag,
    label,
    inflected,
    morph: MORPH.test(tag),
    proper: tag === "NNP" || tag === "NNPS",
    confidence,
  };
}

/** Whether the word is a form of `verb` (has, had, is, was, did, got). */
const formOf = (word: TaggedWord, verb: string) =>
  word.form === verb || word.bases.includes(verb);

/**
 * What an auxiliary takes after it: have a past participle (has spent) or "to" right
 * after it (had to), be a participle or an -ing form (is going, was taken), do a bare
 * verb (did go), get a past participle (got hurt).
 */
function takes(word: TaggedWord): RegExp | undefined {
  if (formOf(word, "have")) return /^(VBN|TO)$/;
  if (formOf(word, "be")) return /^(VBG|VBN)$/;
  if (formOf(word, "do")) return /^(VB|VBP)$/;
  if (formOf(word, "get")) return /^VBN$/;
  return undefined;
}

/** Words that may stand between an auxiliary and its verb: not, adverbs, a subject. */
const BETWEEN: ReadonlySet<string> = new Set([
  "adverb",
  "pronoun",
  "determiner",
  "noun",
]);

/**
 * Whether the word at `i` is an auxiliary: its verb follows within four words, with
 * only adverbs or an inverted subject between ("does Harvey know", "has never been").
 * Tags count here whether trusted or not: a closed class, and a wrong guess only keeps
 * the auxiliary's grammar pointer.
 */
function auxiliary(words: readonly TaggedWord[], i: number): boolean {
  const verb = takes(words[i]!);
  if (!verb) return false;
  for (let j = i + 1; j < Math.min(words.length, i + 5); j++) {
    const { tag, pauseBefore } = words[j]!;
    if (pauseBefore) return false;
    // "to" only right after have ("had to", not "have a lot to do").
    if (verb.test(tag.tag) && (tag.tag !== "TO" || j === i + 1)) return true;
    if (!BETWEEN.has(tag.label)) return false;
  }
  return false;
}

const trustedTagOf = (word: TaggedWord | undefined) =>
  word?.trusted ? word.tag : undefined;

/** Before a noun, after a determiner, an adjective, a preposition, a noun or a number. */
const PRENOMINAL_BEFORE: ReadonlySet<string> = new Set([
  "determiner",
  "adjective",
  "preposition",
  "noun",
  "numeral",
]);

function verbal(words: readonly TaggedWord[], i: number): WordUse["verbal"] {
  const word = words[i]!;
  const tag = trustedTagOf(word);
  if (tag?.label !== "verb") return false;
  const previous = words[i - 1];
  const next = words[i + 1];
  const nextTag = trustedTagOf(next);
  const previousTag = trustedTagOf(previous);
  // A participle between a determiner (or adjective, noun …) and a noun modifies it:
  // "demanding work", "a limited express", "horned frogs".
  const prenominal =
    nextTag?.label === "noun" &&
    !next!.pauseBefore &&
    (!previous ||
      word.pauseBefore ||
      (previousTag !== undefined && PRENOMINAL_BEFORE.has(previousTag.label)));
  if (/^(VBD|VBN|VBG)$/.test(tag.tag) && prenominal) return false;
  if (tag.tag === "VBD" || tag.tag === "VBZ") return "finite";
  const before = words.slice(Math.max(0, i - 3), i);
  /** be, also in a contraction: "we're", "it's", "I'm". */
  const be = (w: TaggedWord) => formOf(w, "be") || /'(s|re|m)$/.test(w.form);
  if (tag.tag === "VBN" && before.some((w) => formOf(w, "have"))) return "aux";
  if (tag.tag === "VBG" && before.some(be)) return "aux";
  // be + a past participle without an agent may be a state: "growth was subdued",
  // "is rooted in", "we're doomed".
  if (tag.tag === "VBN" && before.slice(-2).some(be) && next?.form !== "by")
    return false;
  return "other";
}

function use(words: readonly TaggedWord[], i: number): WordUse {
  const word = words[i]!;
  const tag = trustedTagOf(word);
  const previousTag = trustedTagOf(words[i - 1]);
  const how = verbal(words, i);
  // An -ing form after a determiner or an adjective is a noun: "financial reporting".
  const gerund =
    tag?.tag === "VBG" &&
    how !== "aux" &&
    !word.pauseBefore &&
    (previousTag?.label === "determiner" || previousTag?.label === "adjective");
  return {
    auxiliary: auxiliary(words, i),
    verbal: how,
    prepositionSlot:
      /^(VBG|VBN)$/.test(tag?.tag ?? "") &&
      how !== "aux" &&
      (i === 0 || word.pauseBefore || previousTag?.label === "noun"),
    ...(gerund && { label: "noun" }),
  };
}

export function englishTagger(model: PerceptronModel): Tagger {
  return {
    threshold: THRESHOLD,
    tag(tokens) {
      const split = tokens.map(treebankTokens);
      const tags = tagSentence(model, split.flat());
      let at = 0;
      return split.map((words) => {
        const { tag, margin } = tags[at]!;
        at += words.length;
        return tokenTag(tag, margin);
      });
    },
    uses: (words) => words.map((_, i) => use(words, i)),
  };
}
