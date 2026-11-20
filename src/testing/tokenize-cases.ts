/** A sentence with curly quotes, apostrophes, hyphens, dashes and numbers, and its word tokens. */
export const TRICKY_SENTENCE =
  "“Don’t,” the teacher’s well-known dog said—it’s 3.5 km or 1,000 times, isn't it?";

export const TRICKY_WORDS = [
  { text: "Don’t", start: 1, end: 6 },
  { text: "the", start: 9, end: 12 },
  { text: "teacher’s", start: 13, end: 22 },
  { text: "well", start: 23, end: 27 },
  { text: "known", start: 28, end: 33 },
  { text: "dog", start: 34, end: 37 },
  { text: "said", start: 38, end: 42 },
  { text: "it’s", start: 43, end: 47 },
  { text: "3.5", start: 48, end: 51 },
  { text: "km", start: 52, end: 54 },
  { text: "or", start: 55, end: 57 },
  { text: "1,000", start: 58, end: 63 },
  { text: "times", start: 64, end: 69 },
  { text: "isn't", start: 71, end: 76 },
  { text: "it", start: 77, end: 79 },
];

/**
 * Abbreviations with full stops inside, a domain and a colon between letters, which
 * Node's segmenter keeps whole and Chrome's splits ("U", ".", "S"), and the words the
 * vocabulary (`DOTTED_KNOWN`) reads them as, the same in every engine.
 */
export const DOTTED_SENTENCE =
  "The seventh U.S. company met at 5 p.m. on example.com, e.g. Re:Zero, 3.5 km.";

/** The words `whole` knows in `DOTTED_SENTENCE`, as written (lower case). */
export const DOTTED_KNOWN = ["u.s", "p.m"];

export const DOTTED_WORDS = [
  "The@0-3",
  "seventh@4-11",
  "U.S@12-15",
  "company@17-24",
  "met@25-28",
  "at@29-31",
  "5@32-33",
  "p.m@34-37",
  "on@39-41",
  "example@42-49",
  "com@50-53",
  "e@55-56",
  "g@57-58",
  "Re@60-62",
  "Zero@63-67",
  "3.5@69-72",
  "km@73-75",
];
