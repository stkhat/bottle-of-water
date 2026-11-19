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

/**
 * Apostrophes inside words stay in the token ("don't", "teacher’s"); hyphens and dashes
 * split words. A language's elisions are split off the word they are joined to ("l'",
 * "homme"), unless `whole` says the word as written is one of its own ("d'accord",
 * "jusqu'à": the vocabulary's), and so is each rest of it.
 */
export function tokenize(
  text: string,
  lang: string,
  whole?: (word: string) => boolean,
): Token[] {
  const elides = Object.hasOwn(ELISIONS, lang);
  return Array.from(segmenterFor(lang, "word").segment(text)).flatMap((s) => {
    const token = {
      text: s.segment,
      start: s.index,
      end: s.index + s.segment.length,
      isWord: s.isWordLike ?? false,
    };
    if (!elides || !token.isWord || !/['’]/.test(token.text)) return [token];
    const tokens: Token[] = [];
    let start = token.start;
    let rest = token.text;
    while (!whole?.(rest)) {
      const [elided, ...after] = splitElisions(rest, lang);
      if (after.length === 0) break;
      tokens.push({
        text: elided!,
        start,
        end: start + elided!.length,
        isWord: true,
      });
      start += elided!.length;
      rest = rest.slice(elided!.length);
    }
    tokens.push({ text: rest, start, end: token.end, isWord: true });
    return tokens;
  });
}

/** A word as keys and patterns compare it: lowercase, with ’ written as '. */
export const normalizeWord = (text: string) =>
  text.toLowerCase().replaceAll("’", "'");
