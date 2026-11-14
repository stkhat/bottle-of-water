import { sameSpans, type Category, type Span } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { recategorized } from "../lookup/spans";
import { createHighlighter } from "./highlighter";
import { createBlockIndex, type SpanMap } from "./locate";
import type { TextBlock } from "./page-text";

/**
 * The page's blocks as the article session knows them: those on the page (live), their
 * spans and highlights, which of them are highlighted (in scope), the version of each
 * block's latest analysis, and the blocks waiting for language data.
 */
export function createBlocks(o: {
  highlight: Settings["highlight"];
  /** The block gets highlights (see `startArticle`). */
  inScope(block: TextBlock): boolean;
  /** A block's spans or highlights changed (the Words list follows). */
  changed(): void;
}) {
  const highlighter = createHighlighter(o.highlight);
  const spans: SpanMap = new Map();
  const live = new Set<TextBlock>();
  const index = createBlockIndex();
  /** The latest analysis or local change of each block; older results are dropped. */
  const versions = new Map<TextBlock, number>();
  let version = 0;
  /** Analyzed blocks whose spans are highlighted (in scope). */
  const shown = new Set<TextBlock>();
  /** Blocks whose analysis waits for language data that is not on the device. */
  const waiting = new Set<TextBlock>();

  const stamp = (block: TextBlock) => {
    versions.set(block, ++version);
    return version;
  };

  function setSpans(block: TextBlock, blockSpans: readonly Span[]) {
    const on = o.inScope(block);
    // Classified again with nothing changed (after a save elsewhere on the page): its
    // highlights stay, so the page does not repaint every block.
    if (on === shown.has(block) && sameSpans(spans.get(block), blockSpans))
      return;
    spans.set(block, blockSpans);
    highlighter.set(block, on ? blockSpans : []);
    if (on) shown.add(block);
    else shown.delete(block);
    o.changed();
  }

  return {
    spans,
    index,
    shown: shown as ReadonlySet<TextBlock>,
    isLive: (block: TextBlock) => live.has(block),
    /** A new version of the block: results stamped before it are dropped. */
    stamp,
    /** Still on the page, and `stamped` its latest version. */
    current: (block: TextBlock, stamped: number | undefined) =>
      live.has(block) && versions.get(block) === stamped,
    setSpans,
    wait(block: TextBlock) {
      waiting.add(block);
    },
    /** The blocks still on the page that waited for language data; none wait after. */
    takeWaiting() {
      const blocks = [...waiting].filter((block) => live.has(block));
      waiting.clear();
      return blocks;
    },
    /** Highlights blocks that came into scope and drops those that left it; returns those that came. */
    rescope() {
      const entered: TextBlock[] = [];
      for (const [block, list] of spans) {
        const on = o.inScope(block);
        if (on === shown.has(block)) continue;
        highlighter.set(block, on ? list : []);
        if (on) {
          shown.add(block);
          entered.push(block);
        } else shown.delete(block);
      }
      return entered;
    },
    /** Gives spans a new category where `change` returns one, and highlights them. */
    recategorize(change: (span: Span) => Category | undefined) {
      for (const [block, list] of spans) {
        const next = recategorized(list, change);
        if (!next) continue;
        stamp(block);
        setSpans(block, next);
      }
    },
    add(blocks: readonly TextBlock[]) {
      for (const block of blocks) live.add(block);
      index.add(blocks);
    },
    remove(blocks: readonly TextBlock[]) {
      for (const block of blocks) {
        live.delete(block);
        waiting.delete(block);
        spans.delete(block);
        versions.delete(block);
        highlighter.remove(block);
        shown.delete(block);
      }
      index.remove(blocks);
    },
    setHighlight(on: Settings["highlight"]) {
      highlighter.setEnabled(on);
    },
    /** Removes every highlight and forgets every block. */
    destroy() {
      highlighter.destroy();
      spans.clear();
      shown.clear();
      live.clear();
      waiting.clear();
    },
  };
}

export type ArticleBlocks = ReturnType<typeof createBlocks>;
