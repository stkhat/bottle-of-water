// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { PhraseRules } from "./pattern";

const POSSESSIVES = ["my", "your", "his", "her", "its", "our", "their"];

/**
 * English slots, as Wiktionary writes them (the data build writes somebody / sb as
 * `someone`, sth as `something` and somebody's as `someone's`). Phrasal verbs may have
 * up to three words between their parts ("turn the kitchen lights off").
 */
export const ENGLISH_RULES: PhraseRules = {
  slots: new Map([
    ["one's", new Set(POSSESSIVES)],
    ["someone's", new Set(POSSESSIVES)],
    ["someone", new Set(["me", "you", "him", "her", "us", "them"])],
    ["something", new Set(["it", "this", "that", "them"])],
    [
      "oneself",
      new Set([
        "myself",
        "yourself",
        "himself",
        "herself",
        "itself",
        "ourselves",
        "yourselves",
        "themselves",
      ]),
    ],
  ]),
  possessiveSlot: "someone's",
  // Contractions of "is" / "has" / "us" that end like a possessive ("nobody's" can be
  // either, so it stays a possessive).
  notPossessive: new Set(
    [
      "it",
      "he",
      "she",
      "that",
      "there",
      "here",
      "what",
      "who",
      "where",
      "when",
      "why",
      "how",
      "let",
      "this",
      "everything",
      "nothing",
      "something",
    ].map((word) => `${word}'s`),
  ),
  maxGap: 3,
  gapStop: new Set([
    ...["and", "or", "but", "so", "because", "if", "then", "than", "as"],
    ...["that", "which", "who", "whom", "whose", "when", "where", "while"],
    ...["since", "until", "though", "although", "unless", "whether"],
    ...["i", "we", "he", "she", "they"],
    ...["i'm", "i'll", "i've", "i'd", "we're", "we'll", "we've", "we'd"],
    ...["he's", "he'll", "he'd", "she's", "she'll", "she'd"],
    ...["they're", "they'll", "they've", "they'd", "it's", "it'll"],
  ]),
};
