import {
  collapseSpaces,
  sentenceSegments,
  type SentenceSegment,
} from "../../core/text/sentences";

/**
 * Where the sentence (`sentenceSegments`) that holds `[start, end)` of `text` is, or
 * the sentences it crosses: `[start, end)` within `text`, as written.
 */
export function sentenceBounds(
  text: string,
  start: number,
  end: number,
  lang: string,
): SentenceSegment {
  let from = start;
  let to = end;
  for (const segment of sentenceSegments(text, lang)) {
    if (segment.end <= start) continue;
    if (segment.start >= Math.max(end, start + 1)) break;
    from = Math.min(from, segment.start);
    to = Math.max(to, segment.end);
  }
  return { start: from, end: to };
}

/**
 * The sentence (`sentenceSegments`) that holds `[start, end)` of `text`, or the
 * sentences it crosses, with whitespace collapsed.
 */
export function sentenceAt(
  text: string,
  start: number,
  end: number,
  lang: string,
): string {
  const bounds = sentenceBounds(text, start, end, lang);
  return collapseSpaces(text.slice(bounds.start, bounds.end));
}
