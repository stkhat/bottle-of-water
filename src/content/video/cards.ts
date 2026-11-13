import type { Span } from "../../core/classify";
import { warn } from "../lookup/warn";
import type { TermCard } from "../lookup/describe";
import type { Box } from "../lookup/geometry";
import { createHoverIntent } from "../lookup/hover-intent";
import { latest, sameTerm, type Lookup, type Term } from "../lookup/lookup";
import type { Store } from "../store";
import type { VideoLine, VideoState, WordPlace, WordRef } from "./state";

/**
 * The hover card and the dictionary window over the words of the subtitle and the
 * transcript.
 */
export function createCards(o: {
  store: Store<VideoState>;
  lookup: Lookup;
  flat(text: string): string;
  onPanelOpen?(): void;
}) {
  const { store, lookup, flat } = o;

  /**
   * The span `ref` points at, with its term as written (the whole phrase for a part of
   * a phrase with a gap). Selected words' phrase is a span of its own, not saved.
   */
  function spanOf(ref: WordRef) {
    const { cues, spans } = store.get();
    const cue = cues[ref.cue];
    const span: Span | undefined = ref.selected
      ? { ...ref.selected, kind: "phrase", category: "new" }
      : spans[ref.cue]?.[ref.span];
    if (!cue || !span) return undefined;
    const { start, end } = span.part ?? span;
    return { cue, span, surface: flat(cue.text.slice(start, end)) };
  }

  async function describe(
    ref: WordRef,
    shownIn: "hover" | "window" = "hover",
  ): Promise<TermCard | undefined> {
    const found = spanOf(ref);
    if (!found) return undefined;
    const { span, surface } = found;
    const written = lookup.written(span, surface);
    return lookup.describe(
      {
        key: span.key,
        kind: span.kind,
        surface,
        category: span.category,
        ...(written !== undefined && { written }),
        ...(span.pos !== undefined && { pos: span.pos }),
      },
      shownIn,
    );
  }

  /** Every line with the term, in order. */
  function linesWith(term: Term): VideoLine[] {
    const { cues, spans } = store.get();
    const lines: VideoLine[] = [];
    spans.forEach((list, cue) => {
      const raw = cues[cue]!.text;
      // Offsets in the flattened text (a line break may become nothing).
      const at = (i: number) => flat(raw.slice(0, i)).length;
      const marks = (list ?? []).flatMap((span) =>
        sameTerm(span, term) && span.category !== "ignored"
          ? [
              {
                start: at(span.start),
                end: at(span.end),
                category: span.category,
              },
            ]
          : [],
      );
      if (marks.length === 0) return;
      lines.push({ cue, timeMs: cues[cue]!.startMs, text: flat(raw), marks });
    });
    return lines;
  }

  const hoverTicket = latest();
  let pendingAnchor: Box | undefined;
  /** The pointer is on the hover card. */
  let onCard = false;
  const hover = createHoverIntent<string>({
    // The selection's card is the card for the words under the pointer.
    blocked: () => store.get().selecting,
    show(id) {
      // The same word in the subtitle and the transcript are two targets.
      const [from, cue, span] = id.split(":") as [WordPlace, string, string];
      const ref = { cue: Number(cue), span: Number(span) };
      const anchor = pendingAnchor;
      const isLatest = hoverTicket.next();
      void describe(ref)
        .then((card) => {
          if (!isLatest() || !card || !anchor) return;
          store.set({ hover: { ref, from, anchor, card } });
        })
        .catch(warn);
    },
    hide() {
      hoverTicket.drop();
      onCard = false;
      if (store.get().hover) store.set({ hover: null });
    },
  });

  const panelTicket = latest();
  /** How many times the window opened. */
  let opened = 0;

  async function openPanel(ref: WordRef) {
    const isLatest = panelTicket.next();
    const card = await describe(ref, "window");
    if (!isLatest() || !card) return;
    if (!store.get().panel) opened++;
    showPanel(ref, card, opened);
    o.onPanelOpen?.();
  }

  function showPanel(ref: WordRef, card: TermCard, times: number) {
    lookup.showPanel(store, {
      ref,
      card,
      here: linesWith(card),
      dictionaries: lookup.dictionaries(card.head),
      opened: times,
    });
  }

  /** Looks the term up again where the hover card or the window shows it. */
  async function refresh(term: Term) {
    const { hover: shown, panel } = store.get();
    if (shown && sameTerm(shown.card, term)) {
      const card = await describe(shown.ref);
      const now = store.get().hover;
      if (card && now?.ref === shown.ref)
        store.set({ hover: { ...now, card } });
    }
    if (panel && sameTerm(panel.card, term)) {
      const isCurrent = panelTicket.current();
      const card = await describe(panel.ref, "window");
      if (card && isCurrent() && store.get().panel)
        showPanel(panel.ref, card, panel.opened);
    }
  }

  return {
    spanOf,
    linesWith,
    refresh,
    /** Looks up again whatever the hover card and the window show. */
    async refreshOpen() {
      const { hover: shown, panel } = store.get();
      for (const card of [shown?.card, panel?.card])
        if (card) await refresh(card);
    },
    enterWord(ref: WordRef, anchor: Box, from: WordPlace) {
      pendingAnchor = anchor;
      hover.enter(`${from}:${ref.cue}:${ref.span}`);
    },
    leaveWord: () => hover.leave(),
    keepHover() {
      onCard = true;
      hover.keep();
    },
    releaseHover() {
      onCard = false;
      hover.release();
    },
    dismissHover: () => hover.cancel(),
    /** The playing line changed: the word under the pointer went with it. */
    lineChanged() {
      if (!onCard) hover.cancel();
    },
    clickWord(ref: WordRef) {
      hover.cancel();
      void openPanel(ref).catch(warn);
    },
    closePanel() {
      panelTicket.drop();
      store.set({ panel: null });
    },
  };
}
