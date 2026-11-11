import type { CSSProperties, JSX } from "preact";
import type { Span } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { termMark } from "../lookup/styles";

type Style = CSSProperties;

/**
 * A term's highlight: mock Main `hlStyle` (`ui`, themed) or the brighter `ovStyle` over a
 * dark video (`onVideo`). Nothing for categories that are switched off.
 */
export function termStyle(
  category: Span["category"],
  on: Settings["highlight"],
  colors: "ui" | "onVideo",
): Style | undefined {
  if (category === "ignored" || !on[category]) return undefined;
  return termMark(category, colors);
}

/** The spans that can be shown, in text order, without overlaps or ignored words. */
export function visibleSpans(spans: readonly Span[]): [Span, number][] {
  const out: [Span, number][] = [];
  let end = 0;
  spans
    .map((span, index) => [span, index] as [Span, number])
    .sort(([a], [b]) => a.start - b.start)
    .forEach(([span, index]) => {
      if (span.category === "ignored" || span.start < end) return;
      out.push([span, index]);
      end = span.end;
    });
  return out;
}

/**
 * The text of a cue with its terms rendered by `term` and the text between them as
 * is. Line breaks inside the cue become spaces.
 */
export function renderTerms(
  text: string,
  spans: readonly Span[] | null,
  term: (span: Span, index: number, text: string) => JSX.Element,
): (string | JSX.Element)[] {
  const flat = (s: string) => s.replaceAll("\n", " ");
  if (!spans) return [flat(text)];
  const out: (string | JSX.Element)[] = [];
  let at = 0;
  for (const [span, index] of visibleSpans(spans)) {
    if (span.start > at) out.push(flat(text.slice(at, span.start)));
    out.push(term(span, index, flat(text.slice(span.start, span.end))));
    at = span.end;
  }
  if (at < text.length) out.push(flat(text.slice(at)));
  return out;
}
