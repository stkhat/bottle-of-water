import type { Span } from "./classify";

/** A selection snapped to whole words of one text. */
export interface SnappedWords {
  start: number;
  end: number;
  /** The word (and saved phrase) spans inside it. */
  spans: Span[];
}

/**
 * A detected (unsaved) phrase as its words, so a selection snaps to whole words
 * rather than to a phrase the user did not choose. Its words are separated only by
 * spaces, and its key has one base form per word. Saved phrases stay whole, and so do
 * the parts of a saved phrase with a gap.
 */
function wordsOf(span: Span, text: string): Span[] {
  if (span.kind !== "phrase" || span.category !== "new") return [span];
  const keys = span.key.split(" ");
  const words = [...text.slice(span.start, span.end).matchAll(/\S+/g)];
  if (words.length !== keys.length) return [span];
  return words.map((word, i) => ({
    start: span.start + word.index,
    end: span.start + word.index + word[0].length,
    key: keys[i]!,
    kind: "word",
    category: span.category,
  }));
}

const MIN_PHRASE_WORDS = 2;
const MAX_PHRASE_WORDS = 8;

const wordsIn = (text: string) => text.split(/\s+/).length;

/**
 * How many words a span covers: its key's words (a phrase's key has one word per word),
 * or for a part of a phrase with a gap, its text's.
 */
const wordCount = (span: Span, text: string) =>
  wordsIn(span.part ? text.slice(span.start, span.end) : span.key);

/**
 * The text from `from` to `to` as a selection of 2–8 words, widened to whole words and
 * whole saved phrases, every part of a phrase with a gap included (a detected phrase
 * counts as its words). `spans` are the text's spans in text order. Undefined when it is
 * collapsed, has fewer or more words, or its words are separated by anything but spaces
 * (a saved phrase only matches words joined by spaces).
 */
export function snapWords(
  text: string,
  spans: readonly Span[],
  from: number,
  to: number,
): SnappedWords | undefined {
  if (from >= to) return undefined;
  // A part of a phrase with a gap widens the selection to the whole phrase.
  let start = from;
  let end = to;
  for (const { part, start: first, end: last } of spans)
    if (part && last > from && first < to) {
      start = Math.min(start, part.start);
      end = Math.max(end, part.end);
    }
  const inside = spans
    .flatMap((s) => wordsOf(s, text))
    .filter((s) => s.end > start && s.start < end);
  const words = inside.reduce((n, s) => n + wordCount(s, text), 0);
  if (words < MIN_PHRASE_WORDS || words > MAX_PHRASE_WORDS) return undefined;
  for (let i = 1; i < inside.length; i++) {
    const between = text.slice(inside[i - 1]!.end, inside[i]!.start);
    if (!/^[^\S\n]+$/.test(between)) return undefined;
  }
  return { start: inside[0]!.start, end: inside.at(-1)!.end, spans: inside };
}

/**
 * The selected words' keys joined by single spaces (`spans` from `snapWords` on
 * `text`). Each part of a phrase with a gap gives the words of the phrase's key it
 * stands for ("figure it out" for the parts of `figure out` and the word "it").
 */
export function selectionKey(text: string, spans: readonly Span[]): string {
  const keys: string[] = [];
  /** Words of the key that the phrase's earlier parts gave. */
  let given = 0;
  for (const span of spans) {
    if (!span.part) {
      keys.push(span.key);
      continue;
    }
    if (span.part.index === 0) given = 0;
    const count = wordCount(span, text);
    keys.push(...span.key.split(" ").slice(given, given + count));
    given += count;
  }
  return keys.join(" ");
}
