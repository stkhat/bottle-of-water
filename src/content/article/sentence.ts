import { collapseSpaces, sentenceSegments } from "../../core/text/sentences";

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
  let from = start;
  let to = end;
  for (const segment of sentenceSegments(text, lang)) {
    if (segment.end <= start) continue;
    if (segment.start >= Math.max(end, start + 1)) break;
    from = Math.min(from, segment.start);
    to = Math.max(to, segment.end);
  }
  return collapseSpaces(text.slice(from, to));
}
