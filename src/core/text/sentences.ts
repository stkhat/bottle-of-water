import { segmenterFor } from "./tokenize";

/** Text with runs of whitespace turned into single spaces, trimmed. */
export const collapseSpaces = (text: string) =>
  text.replace(/\s+/g, " ").trim();

/** A sentence of a text: `[start, end)` within it, as written. */
export interface SentenceSegment {
  start: number;
  end: number;
}

export function* sentenceSegments(
  text: string,
  lang: string,
): Generator<SentenceSegment> {
  for (const { index, segment } of segmenterFor(lang, "sentence").segment(text))
    yield { start: index, end: index + segment.length };
}

/** The sentences with whitespace collapsed; empty and whitespace-only pieces are dropped. */
export function splitSentences(text: string, lang: string): string[] {
  const sentences: string[] = [];
  for (const { start, end } of sentenceSegments(text, lang)) {
    const sentence = collapseSpaces(text.slice(start, end));
    if (sentence) sentences.push(sentence);
  }
  return sentences;
}
