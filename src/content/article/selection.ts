import type { TermStatus } from "../../core/classify";
import { collapseSpaces } from "../../core/text/sentences";
import type { send } from "../../messaging/client";
import type { SourceInput } from "../../messaging/protocol";
import type { TermCard } from "../lookup/describe";
import { wordBoxes } from "../lookup/geometry";
import type { Lookup } from "../lookup/lookup";
import { warn } from "../lookup/warn";
import type { Store } from "../store";
import { describeRef } from "./cards";
import { selectionKey } from "../../core/selection";
import {
  snapSelection,
  type BlockIndex,
  type Snapped,
  type SpanMap,
  type SpanRef,
} from "./locate";
import { rangeOf } from "./page-text";
import { sentenceAt } from "./sentence";
import type { ArticleState } from "./state";

/**
 * The pattern selected words stand for, and where its words are in the block: from
 * its first word to its last, gap included. The sentence may complete the selection
 * ("made up" → "made up her mind").
 */
interface PatternMatch {
  key: string;
  start: number;
  end: number;
}

/** The selected words, and the phrase they stand for. */
interface Selected {
  /** The latest snap of the words (they are read again after snapping). */
  snapped: Snapped;
  /** The background's answer: undefined when no pattern matches. */
  match: Promise<PatternMatch | undefined>;
  /**
   * Once the background has answered: the phrase as a span of the block, the pattern's
   * words or else the selected ones (not one of the page's spans).
   */
  ref?: SpanRef;
  /** The phrase's card, once looked up. */
  card?: TermCard;
}

const snappedRange = (s: Snapped) => rangeOf(s.block, s.start, s.end);

/** The same words: the selection is read again after it is snapped. */
const sameSnap = (a: Snapped | undefined, b: Snapped) =>
  a !== undefined &&
  a.block === b.block &&
  a.start === b.start &&
  a.end === b.end;

/** The card over the selected words, which saves them as a phrase. */
export function createSelection(o: {
  send: typeof send;
  store: Store<ArticleState>;
  lookup: Lookup;
  lang: string;
  source(): SourceInput;
  index: BlockIndex;
  spans: SpanMap;
  /** Other words were selected: the hover card goes. */
  dismissHover(): void;
  /** A phrase was saved; it may be anywhere on the page. */
  saved(): Promise<void>;
}) {
  const { store, lang } = o;
  let phrase: Selected | undefined;

  /** The pattern snapped words stand for; undefined when none matches or on failure. */
  function patternOf({
    block,
    start,
    end,
  }: Snapped): Promise<PatternMatch | undefined> {
    return o
      .send({ type: "matchSelection", lang, text: block.text, start, end })
      .then(
        (match) =>
          match.key !== undefined &&
          match.start !== undefined &&
          match.end !== undefined
            ? { key: match.key, start: match.start, end: match.end }
            : undefined,
        (error: unknown) => {
          warn(error);
          return undefined;
        },
      );
  }

  /** Shows the card of the selected words once it is looked up, above them. */
  function show(selected: Selected) {
    const { card } = selected;
    const [anchor] = wordBoxes(snappedRange(selected.snapped));
    if (card && anchor) store.set({ phrase: { anchor, card } });
  }

  /**
   * Looks up the phrase the selected words stand for: the pattern they match, as a
   * span over the pattern's words; else the words under their own keys.
   */
  async function describe(selected: Selected) {
    const match = await selected.match;
    const { snapped } = selected;
    const { start, end } = match ?? snapped;
    const ref: SpanRef = {
      block: snapped.block,
      span: {
        start,
        end,
        key: match?.key ?? selectionKey(snapped.block.text, snapped.spans),
        kind: "phrase",
        category: "new",
      },
    };
    const card = await describeRef(o.lookup, ref);
    // Dropped when other words are selected by now.
    if (phrase !== selected) return;
    selected.ref = ref;
    selected.card = card;
    show(selected);
  }

  function drop() {
    phrase = undefined;
    if (store.get().phrase) store.set({ phrase: null });
  }

  /**
   * Saves the words under the pattern they stand for, as the pattern's words are
   * written ("made up her mind" for a selection of "made up"); else the selected words
   * under their own keys. A press before the background has answered waits for the
   * answer, so the words are saved alike whenever the card is pressed.
   */
  async function save(
    snapped: Snapped,
    pattern: Promise<PatternMatch | undefined>,
    status: TermStatus,
  ) {
    const { block } = snapped;
    const match = await pattern;
    const { start, end } = match ?? snapped;
    const sentence = sentenceAt(block.text, start, end, lang);
    await o.send({
      type: "saveTerm",
      lang,
      key: match?.key ?? selectionKey(snapped.block.text, snapped.spans),
      display: collapseSpaces(block.text.slice(start, end)),
      kind: "phrase",
      status,
      source: o.source(),
      sentence,
      pos: { textQuote: sentence },
    });
    if (phrase && sameSnap(phrase.snapped, snapped)) {
      drop();
      getSelection()?.removeAllRanges();
    }
    await o.saved();
  }

  return {
    selecting: () => phrase !== undefined,
    /** The page's selection settled; undefined when it is collapsed. */
    select(range: Range | undefined) {
      const snapped = range && snapSelection(range, o.index, o.spans);
      if (!snapped) {
        drop();
        return;
      }
      if (phrase && sameSnap(phrase.snapped, snapped)) {
        // The same words, read again: their phrase has been asked for.
        phrase.snapped = snapped;
      } else {
        drop();
        o.dismissHover();
        const selected: Selected = { snapped, match: patternOf(snapped) };
        phrase = selected;
        void describe(selected).catch(warn);
      }
      const whole = snappedRange(snapped);
      if (
        range.compareBoundaryPoints(Range.START_TO_START, whole) !== 0 ||
        range.compareBoundaryPoints(Range.END_TO_END, whole) !== 0
      ) {
        // Show what will be saved: the whole words.
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(whole);
      }
      show(phrase);
    },
    /** The task that saves the selected words with `status`; none without a selection. */
    saveTask(status: TermStatus) {
      if (!phrase) return undefined;
      const { snapped, match } = phrase;
      return () => save(snapped, match, status);
    },
    /** Drops the selection for its phrase's panel; the phrase, once looked up. */
    takeForDetails() {
      const ref = phrase?.ref;
      if (!ref) return undefined;
      drop();
      getSelection()?.removeAllRanges();
      return ref;
    },
    /** The page scrolled: the card follows the words. */
    follow() {
      if (phrase) show(phrase);
    },
  };
}
