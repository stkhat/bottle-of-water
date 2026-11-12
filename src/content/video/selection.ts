import type { Span, TermStatus } from "../../core/classify";
import { selectionKey, snapWords } from "../../core/selection";
import type { send } from "../../messaging/client";
import type { SaveTermInput } from "../../messaging/protocol";
import type { Box } from "../lookup/geometry";
import type { Lookup } from "../lookup/lookup";
import { warn } from "../lookup/warn";
import type { Store } from "../store";
import type { SelectedWords, VideoState, WordPlace, WordRef } from "./state";

/**
 * The pattern selected words stand for, and where its words are in the cue: from its
 * first word to its last, gap included. The cue may complete the selection ("made up"
 * → "made up her mind").
 */
interface PatternMatch {
  key: string;
  start: number;
  end: number;
}

/** The selected words, and the phrase they stand for. */
interface Selected {
  cue: number;
  /** The whole words selected, in the cue's text. */
  start: number;
  end: number;
  spans: Span[];
  from: WordPlace;
  anchor: Box | undefined;
  /** The background's answer: undefined when no pattern matches. */
  match: Promise<PatternMatch | undefined>;
  /**
   * The phrase, once the background has answered: the pattern's words or else the
   * selected ones.
   */
  ref?: WordRef;
}

/** A cue's text as the subtitle and the transcript show it: line breaks are spaces. */
const shown = (text: string) => text.replaceAll("\n", " ");

/**
 * The card over words selected in the subtitle or the transcript, which saves them as a
 * phrase (as `article/selection.ts` does on pages). A selection stays inside one cue,
 * and inside the playing line in the subtitle.
 */
export function createSelection(o: {
  send: typeof send;
  store: Store<VideoState>;
  lookup: Lookup;
  lang(): string;
  flat(text: string): string;
  /** What saving a term from the cue sends besides its key, status and kind. */
  termInput(
    cue: number,
    display: string,
  ): Omit<SaveTermInput, "status" | "key" | "kind"> | undefined;
  /** Words began to be selected: the hover card goes. */
  dismissHover(): void;
  /** The phrase `key` was saved from the cue. */
  saved(key: string, cue: number, status: TermStatus): Promise<void>;
}) {
  const { store } = o;
  let phrase: Selected | undefined;
  /** Where the press that is selecting words is. */
  let pressFrom: WordPlace | undefined;

  function patternOf(cue: number, start: number, end: number) {
    const text = shown(store.get().cues[cue]?.text ?? "");
    return o
      .send({ type: "matchSelection", lang: o.lang(), text, start, end })
      .then(
        (match): PatternMatch | undefined =>
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

  /**
   * Looks up the phrase the selected words stand for: the pattern they match, else the
   * words under their own keys; then shows its card above them.
   */
  async function describe(selected: Selected) {
    const match = await selected.match;
    const text = store.get().cues[selected.cue]?.text ?? "";
    const { start, end } = match ?? selected;
    const key = match?.key ?? selectionKey(shown(text), selected.spans);
    const card = await o.lookup.describe({
      key,
      kind: "phrase",
      surface: o.flat(text.slice(start, end)),
      category: "new",
    });
    // Dropped when other words are selected by now.
    if (phrase !== selected) return;
    selected.ref = {
      cue: selected.cue,
      span: -1,
      selected: { start, end, key },
    };
    if (selected.anchor)
      store.set({
        phrase: {
          ref: selected.ref,
          from: selected.from,
          anchor: selected.anchor,
          card,
        },
      });
  }

  /** The selection's card goes (the page's selection stays). */
  function drop() {
    phrase = undefined;
    pressFrom = undefined;
    const { phrase: card, selecting } = store.get();
    if (card || selecting) store.set({ phrase: null, selecting: false });
  }

  /** The selection and its card go. */
  function clear() {
    const had = phrase !== undefined || store.get().selecting;
    drop();
    if (had) getSelection()?.removeAllRanges();
  }

  /**
   * Saves the words under the pattern they stand for, as the pattern's words are
   * written; else the selected words under their own keys. A press before the
   * background has answered waits for the answer.
   */
  async function save(selected: Selected, status: TermStatus) {
    const cue = store.get().cues[selected.cue];
    if (!cue) return;
    const match = await selected.match;
    const { start, end } = match ?? selected;
    const key = match?.key ?? selectionKey(shown(cue.text), selected.spans);
    const input = o.termInput(selected.cue, o.flat(cue.text.slice(start, end)));
    if (!input) return;
    await o.send({ type: "saveTerm", ...input, key, kind: "phrase", status });
    if (phrase === selected) clear();
    await o.saved(key, selected.cue, status);
  }

  return {
    /** A press began selecting words: the previous selection's card goes. */
    start(from: WordPlace) {
      phrase = undefined;
      pressFrom = from;
      o.dismissHover();
      store.set({ phrase: null, selecting: true });
    },
    /** The press ended (see `VideoApp.selectWords`). */
    select(
      words: SelectedWords | undefined,
      boxOf: (start: number, end: number) => Box | undefined,
    ): { start: number; end: number } | undefined {
      const state = store.get();
      const cue = words && state.cues[words.cue];
      const spans = words && state.spans[words.cue];
      const snapped =
        cue &&
        spans &&
        snapWords(shown(cue.text), spans, words.start, words.end);
      const line = state.lines[state.line];
      if (
        !words ||
        !snapped ||
        (words.place === "subtitle" &&
          (line?.card !== words.cue ||
            snapped.start < line.start ||
            snapped.end > line.end))
      ) {
        drop();
        return undefined;
      }
      const { start, end } = snapped;
      if (
        phrase?.cue !== words.cue ||
        phrase.start !== start ||
        phrase.end !== end ||
        phrase.from !== words.place
      ) {
        o.dismissHover();
        const selected: Selected = {
          cue: words.cue,
          start,
          end,
          spans: snapped.spans,
          from: words.place,
          anchor: boxOf(start, end),
          match: patternOf(words.cue, start, end),
        };
        phrase = selected;
        pressFrom = words.place;
        if (!state.selecting) store.set({ selecting: true });
        void describe(selected).catch(warn);
      }
      return { start, end };
    },
    /** The task that saves the selected words with `status`; none without a selection. */
    saveTask(status: TermStatus) {
      const selected = phrase;
      return selected && (() => save(selected, status));
    },
    /** Drops the selection for its phrase's window; the phrase, once looked up. */
    takeForDetails() {
      const ref = phrase?.ref;
      if (ref) clear();
      return ref;
    },
    clear,
    /** The playing line changed: words selected in the subtitle went with it. */
    lineChanged() {
      if (pressFrom === "subtitle") clear();
    },
    /** The transcript scrolled: its selection's card would no longer be by the words. */
    transcriptScrolled() {
      if (pressFrom === "transcript") clear();
    },
  };
}
