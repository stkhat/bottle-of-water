import { collapseSpaces } from "../../core/text/sentences";
import type { TermCard } from "../lookup/describe";
import { wordBoxes } from "../lookup/geometry";
import { latest, sameTerm, type Lookup, type Term } from "../lookup/lookup";
import type { Store } from "../store";
import type { SpanMap, SpanRef } from "./locate";
import { rangeOf, type TextBlock } from "./page-text";
import { sentenceAt } from "./sentence";
import type { ArticleState } from "./state";

/** The term as written: the whole phrase for a part of a phrase with a gap. */
export const writtenOf = ({ block, span }: SpanRef) => {
  const { start, end } = span.part ?? span;
  return collapseSpaces(block.text.slice(start, end));
};

export function describeRef(
  lookup: Lookup,
  ref: SpanRef,
  shownIn: "hover" | "window" = "hover",
) {
  const surface = writtenOf(ref);
  const written = lookup.written(ref.span, surface);
  return lookup.describe(
    {
      key: ref.span.key,
      kind: ref.span.kind,
      surface,
      category: ref.span.category,
      ...(written !== undefined && { written }),
      ...(ref.span.pos !== undefined && { pos: ref.span.pos }),
    },
    shownIn,
  );
}

const boxesOf = ({ block, span }: SpanRef) =>
  wordBoxes(rangeOf(block, span.start, span.end));

/** The hover card and the dictionary panel over the page's words. */
export function createCards(o: {
  store: Store<ArticleState>;
  lookup: Lookup;
  lang: string;
  spans: SpanMap;
  blocks(): readonly TextBlock[];
  /** The selection card is up: it is the card for the words under the pointer. */
  selecting(): boolean;
  onPanelOpen?(): void;
}) {
  const { store, lookup, lang } = o;
  const describe = (ref: SpanRef, shownIn?: "hover" | "window") =>
    describeRef(lookup, ref, shownIn);

  let hoverRef: SpanRef | undefined;
  const hoverTicket = latest();
  let panelRef: SpanRef | undefined;
  const panelTicket = latest();
  /** The span of each "On this page" sentence, for scrolling to it. */
  let panelRanges: Range[] = [];

  function sentencesOnPage(term: Term) {
    const here: string[] = [];
    const ranges: Range[] = [];
    for (const block of o.blocks()) {
      for (const span of o.spans.get(block) ?? []) {
        if (!sameTerm(span, term)) continue;
        const sentence = sentenceAt(block.text, span.start, span.end, lang);
        if (here.includes(sentence)) continue;
        here.push(sentence);
        ranges.push(rangeOf(block, span.start, span.end));
      }
    }
    return { here, ranges };
  }

  function showPanel(ref: SpanRef, card: TermCard) {
    const { here, ranges } = sentencesOnPage(card);
    panelRanges = ranges;
    lookup.showPanel(store, {
      card,
      here,
      dictionaries: lookup.dictionaries(card.head),
      outline: boxesOf(ref),
    });
  }

  /** Looks the term up again where the hover card or the panel shows it. */
  async function refresh(term: Term) {
    const { hover, panel } = store.get();
    if (hover && hoverRef && sameTerm(hoverRef.span, term)) {
      const ref = hoverRef;
      const card = await describe(ref);
      if (hoverRef === ref)
        store.set({ hover: { ...store.get().hover!, card } });
    }
    if (panel && panelRef && sameTerm(panelRef.span, term)) {
      const ref = panelRef;
      const isCurrent = panelTicket.current();
      const card = await describe(ref, "window");
      if (isCurrent()) showPanel(ref, card);
    }
  }

  return {
    hoverRef: () => hoverRef,
    panelRef: () => panelRef,
    refresh,
    /** Looks up again whatever the hover card and the panel show. */
    async refreshOpen() {
      const refs = [hoverRef, panelRef].filter((r) => r !== undefined);
      for (const { span } of refs) await refresh(span);
    },
    async showHover(ref: SpanRef) {
      if (o.selecting()) return;
      const isLatest = hoverTicket.next();
      const card = await describe(ref);
      if (!isLatest()) return;
      const [anchor] = boxesOf(ref);
      if (!anchor) return;
      hoverRef = ref;
      store.set({ hover: { anchor, card } });
    },
    hideHover() {
      hoverTicket.drop();
      hoverRef = undefined;
      if (store.get().hover) store.set({ hover: null });
    },
    async openPanel(ref: SpanRef) {
      const isLatest = panelTicket.next();
      const card = await describe(ref, "window");
      if (!isLatest()) return;
      panelRef = ref;
      showPanel(ref, card);
      o.onPanelOpen?.();
    },
    closePanel() {
      panelTicket.drop();
      panelRef = undefined;
      panelRanges = [];
      store.set({ panel: null });
    },
    /** The page scrolled: the outline follows the word. */
    follow() {
      const { panel } = store.get();
      if (panel && panelRef)
        store.set({ panel: { ...panel, outline: boxesOf(panelRef) } });
    },
    goToSentence(i: number) {
      panelRanges[i]?.startContainer.parentElement?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    },
  };
}
