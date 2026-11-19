export interface Token {
  text: string;
  start: number;
  /** Offset just past the last code unit. */
  end: number;
  /** Words and numbers (Intl.Segmenter's isWordLike); false for spaces and punctuation. */
  isWord: boolean;
}

const segmenters = new Map<string, Intl.Segmenter>();

export function segmenterFor(
  lang: string,
  granularity: "word" | "sentence",
): Intl.Segmenter {
  const key = `${granularity}:${lang}`;
  let segmenter = segmenters.get(key);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(lang, { granularity });
    segmenters.set(key, segmenter);
  }
  return segmenter;
}

/**
 * Words a language elides before a vowel, written with an apostrophe and joined to the
 * next word ("l'homme", "qu’il", "jusqu'à"), by language: the elided word as it starts
 * a token, apostrophe included. The segmenter keeps such a token whole.
 */
const ELISIONS: Readonly<Record<string, RegExp>> = {
  fr: /^(?:l|d|j|m|t|s|c|n|qu|jusqu|lorsqu|puisqu|quoiqu)['’](?=\p{L})/iu,
};

/**
 * A word as the language writes its elisions apart: "l'homme" → "l'", "homme";
 * "qu'aujourd'hui" → "qu'", "aujourd'hui"; a word without one, or in a language
 * without elisions, as it is.
 */
export function splitElisions(word: string, lang: string): string[] {
  const elision = Object.hasOwn(ELISIONS, lang) ? ELISIONS[lang] : undefined;
  const parts: string[] = [];
  let rest = word;
  for (let found = elision?.exec(rest); found; found = elision!.exec(rest)) {
    parts.push(found[0]);
    rest = rest.slice(found[0].length);
  }
  return [...parts, rest];
}

/** Whether a language writes elided words joined to the next one (`ELISIONS`). */
export const elides = (lang: string) => Object.hasOwn(ELISIONS, lang);

/**
 * A word's tokens as the tokenizer gives them: its elided words split off one by one
 * ("qu'aujourd'hui" → "qu'", "aujourd'hui"), until what is left is a word `whole`
 * knows ("d'accord") or has none.
 */
export function elisionParts(
  word: string,
  lang: string,
  whole?: (word: string) => boolean,
): string[] {
  const parts: string[] = [];
  let rest = word;
  while (!whole?.(rest)) {
    const [elided, ...after] = splitElisions(rest, lang);
    if (after.length === 0) break;
    parts.push(elided!);
    rest = rest.slice(elided!.length);
  }
  return [...parts, rest];
}

/** A hyphen between the parts of a compound ("peut-être", "well-known"). */
const HYPHEN = /^[-\u2010]$/u;

/**
 * The segmenter's segments with each hyphenated compound that `whole` knows joined
 * into one word segment ("peut", "-", "être" → "peut-être"; "c'est-à-dire"): the
 * longest run of words joined by single hyphens that is one. Hyphens otherwise split
 * words ("est-ce", "a-t-il": the language reads their parts).
 */
function joinCompounds(
  segments: readonly Token[],
  whole: (word: string) => boolean,
): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < segments.length; i++) {
    const first = segments[i]!;
    let joined = -1;
    if (first.isWord)
      for (
        let k = i + 2;
        k < segments.length &&
        HYPHEN.test(segments[k - 1]!.text) &&
        segments[k]!.isWord &&
        segments[k - 1]!.start === segments[k - 2]!.end;
        k += 2
      ) {
        const text = segments
          .slice(i, k + 1)
          .map((s) => s.text)
          .join("");
        if (whole(text)) joined = k;
      }
    if (joined < 0) {
      out.push(first);
      continue;
    }
    const last = segments[joined]!;
    out.push({
      text: segments
        .slice(i, joined + 1)
        .map((s) => s.text)
        .join(""),
      start: first.start,
      end: last.end,
      isWord: true,
    });
    i = joined;
  }
  return out;
}

/**
 * Apostrophes inside words stay in the token ("don't", "teacher’s"); hyphens and dashes
 * split words, unless `whole` knows the hyphenated compound as one word ("peut-être",
 * "well-known": `joinCompounds`). A language's elisions are split off the word they
 * are joined to ("l'", "homme"), unless `whole` says the word as written is one of its
 * own ("d'accord", "jusqu'à": the vocabulary's), and so is each rest of it.
 */
export function tokenize(
  text: string,
  lang: string,
  whole?: (word: string) => boolean,
): Token[] {
  const segments = Array.from(segmenterFor(lang, "word").segment(text)).map(
    (s): Token => ({
      text: s.segment,
      start: s.index,
      end: s.index + s.segment.length,
      isWord: s.isWordLike ?? false,
    }),
  );
  const tokens = whole ? joinCompounds(segments, whole) : segments;
  if (!elides(lang)) return tokens;
  return tokens.flatMap((token) => {
    if (!token.isWord || !/['’]/.test(token.text)) return [token];
    let start = token.start;
    return elisionParts(token.text, lang, whole).map((part) => {
      const piece = {
        text: part,
        start,
        end: start + part.length,
        isWord: true,
      };
      start += part.length;
      return piece;
    });
  });
}

/** A word as keys and patterns compare it: lowercase, with ’ written as '. */
export const normalizeWord = (text: string) =>
  text.toLowerCase().replaceAll("’", "'");
