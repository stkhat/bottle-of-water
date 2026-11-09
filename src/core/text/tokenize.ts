export interface Token {
  text: string;
  /** Offset of the first UTF-16 code unit in the text. */
  start: number;
  /** Offset just past the last code unit. */
  end: number;
  /** Words and numbers (Intl.Segmenter's isWordLike); false for spaces and punctuation. */
  isWord: boolean;
}

const segmenters = new Map<string, Intl.Segmenter>();

function segmenterFor(lang: string): Intl.Segmenter {
  let segmenter = segmenters.get(lang);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(lang, { granularity: "word" });
    segmenters.set(lang, segmenter);
  }
  return segmenter;
}

/**
 * Splits text into word and non-word tokens with `Intl.Segmenter`. Apostrophes inside
 * words stay in the token ("don't", "teacher’s"); hyphens and dashes split words.
 */
export function tokenize(text: string, lang: string): Token[] {
  return Array.from(segmenterFor(lang).segment(text), (s) => ({
    text: s.segment,
    start: s.index,
    end: s.index + s.segment.length,
    isWord: s.isWordLike ?? false,
  }));
}
