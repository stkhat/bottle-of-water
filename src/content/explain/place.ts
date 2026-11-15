/**
 * The sentence a term was met in and the whole lines around it, as the on-device AI
 * reads them (architecture "Meaning in context" → "Context"): a video's transcript
 * cards around the term's card; an article's sentences of the same block, then of the
 * blocks before and after it; a comment's sentences, then its thread's. Learning
 * language only: no translations.
 */
import type { Span } from "../../core/classify";
import { MAX_LINES } from "../../core/explain/context";
import type { Mark } from "../../core/explain/prompt";
import { isSoundLabel } from "../../core/subtitles/cues";
import type { Cue } from "../../core/subtitles/types";
import {
  collapseSpaces,
  sentenceSegments,
  splitSentences,
} from "../../core/text/sentences";
import type { SpanRef } from "../article/locate";
import type { TextBlock } from "../article/page-text";
import { sentenceBounds } from "../article/sentence";
import type { WordRef } from "../video/state";

export interface ExplainPlace {
  /** As saving the term from there records it. */
  sentence: string;
  /** Where the term is in `sentence`: each part of a phrase with a gap. */
  marks: Mark[];
  /** Lines before the sentence, the nearest last. */
  before: string[];
  /** Lines after the sentence, the nearest first. */
  after: string[];
}

/**
 * The spans of the phrase `span` is a part of (a phrase with a gap), else `span`
 * alone: every part with its key over the same whole phrase.
 */
function partsOf(span: Span, spans: readonly Span[]): Span[] {
  const { part } = span;
  if (!part) return [span];
  return spans.filter(
    (s) =>
      s.key === span.key &&
      s.part?.start === part.start &&
      s.part.end === part.end,
  );
}

/** Lines of a side, nearest first: at most what the prompt can take. */
const near = (lines: Iterable<string>) => {
  const out: string[] = [];
  for (const line of lines) {
    if (out.length === MAX_LINES) break;
    out.push(line);
  }
  return out;
};

/** A card that says something: not empty, not a sound label ("[Music]"). */
const isSpoken = (text: string) => text.trim() !== "" && !isSoundLabel(text);

/**
 * In a video: the term's card (its flat text, as saving records it) and the cards
 * around it. `flat` joins a card's lines as the language does.
 */
export function videoPlace(
  cards: readonly Cue[],
  spans: readonly (readonly Span[] | null)[],
  ref: WordRef,
  flat: (text: string) => string,
): ExplainPlace | undefined {
  const card = cards[ref.cue];
  if (!card) return undefined;
  const span = ref.selected ?? spans[ref.cue]?.[ref.span];
  if (!span) return undefined;
  const parts = ref.selected ? [span] : partsOf(span as Span, spans[ref.cue]!);
  // Offsets in the flat text (a line break may become nothing).
  const at = (i: number) => flat(card.text.slice(0, i)).length;
  /** The cards from `from` (inclusive) to `to` (exclusive) that say something. */
  function* spoken(from: number, to: number, step: 1 | -1) {
    for (let i = from; i !== to; i += step) {
      const text = flat(cards[i]!.text);
      if (isSpoken(text)) yield text;
    }
  }
  return {
    sentence: flat(card.text),
    marks: parts.map((p) => ({ start: at(p.start), end: at(p.end) })),
    before: near(spoken(ref.cue - 1, -1, -1)).reverse(),
    after: near(spoken(ref.cue + 1, cards.length, 1)),
  };
}

/**
 * On a page: the term's sentence (as saving records it), the block's other sentences,
 * then the sentences of the blocks before and after it. `blocks` are the page's, in
 * document order; `within`, when given, keeps the neighbours to that part of the page
 * (a comment's thread).
 */
export function articlePlace(
  ref: SpanRef,
  blockSpans: readonly Span[],
  blocks: readonly TextBlock[],
  lang: string,
  within?: Element,
): ExplainPlace {
  const { block, span } = ref;
  const text = block.text;
  const bounds = sentenceBounds(text, span.start, span.end, lang);
  // Offsets in the collapsed sentence.
  const at = (i: number) =>
    text.slice(bounds.start, i).replace(/\s+/g, " ").trimStart().length;
  const own = [...sentenceSegments(text, lang)]
    .map((s) => ({ ...s, text: collapseSpaces(text.slice(s.start, s.end)) }))
    .filter((s) => s.text !== "");
  const neighbours = blocks.filter(
    (b) => b !== block && (!within || within.contains(b.element)),
  );
  const index = blocks.indexOf(block);
  const blocksBefore = neighbours.filter((b) => blocks.indexOf(b) < index);
  const blocksAfter = neighbours.filter((b) => blocks.indexOf(b) > index);
  function* before() {
    for (const s of [...own].reverse()) if (s.end <= bounds.start) yield s.text;
    for (const b of [...blocksBefore].reverse())
      yield* splitSentences(b.text, lang).reverse();
  }
  function* after() {
    for (const s of own) if (s.start >= bounds.end) yield s.text;
    for (const b of blocksAfter) yield* splitSentences(b.text, lang);
  }
  return {
    sentence: collapseSpaces(text.slice(bounds.start, bounds.end)),
    // A part of the phrase in another sentence is not marked.
    marks: partsOf(span, blockSpans)
      .filter((p) => p.start >= bounds.start && p.end <= bounds.end)
      .map((p) => ({ start: at(p.start), end: at(p.end) })),
    before: near(before()).reverse(),
    after: near(after()),
  };
}
