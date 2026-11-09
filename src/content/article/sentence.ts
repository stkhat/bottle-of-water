const segmenters = new Map<string, Intl.Segmenter>();

function segmenterFor(lang: string): Intl.Segmenter {
  let segmenter = segmenters.get(lang);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
    segmenters.set(lang, segmenter);
  }
  return segmenter;
}

/** Text with runs of whitespace turned into single spaces, trimmed. */
export const collapseSpaces = (text: string) =>
  text.replace(/\s+/g, " ").trim();

/**
 * The sentence (Intl.Segmenter, sentence granularity) that holds `[start, end)` of
 * `text`, or the sentences it crosses, with whitespace collapsed.
 */
export function sentenceAt(
  text: string,
  start: number,
  end: number,
  lang: string,
): string {
  let from = start;
  let to = end;
  for (const { index, segment } of segmenterFor(lang).segment(text)) {
    const segmentEnd = index + segment.length;
    if (segmentEnd <= start) continue;
    if (index >= Math.max(end, start + 1)) break;
    from = Math.min(from, index);
    to = Math.max(to, segmentEnd);
  }
  return collapseSpaces(text.slice(from, to));
}
