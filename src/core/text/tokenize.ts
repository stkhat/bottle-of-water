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

/** Apostrophes inside words stay in the token ("don't", "teacher’s"); hyphens and dashes split words. */
export function tokenize(text: string, lang: string): Token[] {
  return Array.from(segmenterFor(lang, "word").segment(text), (s) => ({
    text: s.segment,
    start: s.index,
    end: s.index + s.segment.length,
    isWord: s.isWordLike ?? false,
  }));
}

/** A word as keys and patterns compare it: lowercase, with ’ written as '. */
export const normalizeWord = (text: string) =>
  text.toLowerCase().replaceAll("’", "'");
