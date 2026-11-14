import { wordBoxes } from "../lookup/geometry";
import type { Store } from "../store";
import type { createSummaries } from "../words/summaries";
import type { Occurrence } from "../words/words";
import type { ArticleBlocks } from "./blocks";
import { rangeOf, type TextBlock } from "./page-text";
import { scrollToMiddle } from "./scroll";
import type { ArticleState } from "./state";
import type { VisibleBlocks } from "./visibility";

/** How long a place the Words list went to stays outlined (ms). */
const FLASH_MS = 1500;

/** "Words on this page" on an article: what it lists, and the places it goes to. */
export function createWordsPanel(o: {
  store: Store<ArticleState>;
  summaries: Pick<ReturnType<typeof createSummaries>, "classified">;
  blocks: Pick<ArticleBlocks, "spans" | "shown" | "isLive">;
  /** Saved terms the analyses found on the page. */
  savedKeys: ReadonlySet<string>;
  inScope(block: TextBlock): boolean;
  /** The page's blocks, in page order. */
  pageBlocks(): readonly TextBlock[];
  visible(): Pick<VisibleBlocks, "now">;
}) {
  const { store, blocks } = o;
  /**
   * Blocks the Words list had analyzed before they came near the view: their sentences
   * and saved terms are recorded only once they do (the reader may never get there).
   */
  const unread = new WeakSet<TextBlock>();
  let queued = false;
  /** The place the Words list went to, outlined until the timer ends. */
  let flash: { range: Range; timer: ReturnType<typeof setTimeout> } | undefined;

  /** The blocks the Words list shows: analyzed, in scope, in page order. */
  function changed() {
    if (queued || !store.get().words) return;
    queued = true;
    // Once per batch of changes, not per block.
    queueMicrotask(() => {
      queued = false;
      const words = store.get().words;
      if (!words) return;
      const list = o
        .pageBlocks()
        .filter((block) => blocks.shown.has(block))
        .map((block) => ({ block, spans: blocks.spans.get(block)! }));
      store.set({ words: { ...words, blocks: list } });
    });
  }

  /** The Words list's summaries of these blocks' terms (asked once each). */
  function classified(list: readonly TextBlock[]) {
    o.summaries.classified(
      list.flatMap((block) => [...(blocks.spans.get(block) ?? [])]),
      o.savedKeys,
    );
  }

  /** While the Words list is open, every block in scope is analyzed, near the view or not. */
  function analyzeEarly() {
    if (!store.get().words) return;
    const early = o
      .visible()
      .now(
        o
          .pageBlocks()
          .filter((block) => o.inScope(block) && !blocks.spans.has(block)),
      );
    for (const block of early) unread.add(block);
  }

  function endFlash() {
    if (!flash) return;
    clearTimeout(flash.timer);
    flash = undefined;
    store.set({ flash: null });
  }

  const setWords = (patch: Partial<NonNullable<ArticleState["words"]>>) => {
    const words = store.get().words;
    if (words) store.set({ words: { ...words, ...patch } });
  };

  return {
    changed,
    classified,
    analyzeEarly,
    isUnread: (block: TextBlock) => unread.has(block),
    /** Blocks analyzed early came near the view: they count as read. */
    reached(list: readonly TextBlock[]) {
      for (const block of list) unread.delete(block);
    },
    show() {
      if (!store.get().words)
        store.set({
          words: { blocks: [], filter: "all", sort: "order", jump: null },
        });
      changed();
      classified([...blocks.shown]);
      analyzeEarly();
    },
    close() {
      endFlash();
      store.set({ words: null });
    },
    setWords,
    jump(
      id: string,
      place: number,
      { unit: block, start, end }: Occurrence<TextBlock>,
    ) {
      if (!blocks.isLive(block)) return;
      setWords({ jump: { id, place } });
      const range = rangeOf(block, start, end);
      scrollToMiddle(range);
      endFlash();
      flash = { range, timer: setTimeout(endFlash, FLASH_MS) };
      store.set({ flash: wordBoxes(range) });
    },
    /** The page scrolled: the outline follows its place. */
    follow() {
      if (flash) store.set({ flash: wordBoxes(flash.range) });
    },
    stop: endFlash,
  };
}

export type ArticleWords = ReturnType<typeof createWordsPanel>;
