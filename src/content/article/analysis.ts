import type { Lookup } from "../lookup/lookup";
import { inOtherLanguage } from "../page-language";
import type { ArticleBlocks } from "./blocks";
import type { TextBlock } from "./page-text";
import type { DetectLanguage } from "./should-run";
import type { PageSurface } from "./surface";
import { batches } from "./visibility";

/**
 * Classifies blocks and highlights them. While language data is missing (or once a
 * request finds it missing), the blocks wait for it instead. Blocks in another
 * language (`perBlockLanguage`) are left alone.
 */
export function createAnalysis(o: {
  lookup: Pick<Lookup, "waiting" | "analyze">;
  blocks: Pick<
    ArticleBlocks,
    "spans" | "stamp" | "current" | "setSpans" | "wait"
  >;
  surface: Pick<PageSurface, "perBlockLanguage">;
  detectLanguage: DetectLanguage;
  lang: string;
  /** These blocks got the analysis's spans; `saved` are the saved terms it found. */
  analyzed(fresh: TextBlock[], saved: readonly string[]): void;
}) {
  const { lookup, blocks } = o;
  /** Whether each block is in the learning language, once detected (`perBlockLanguage`). */
  const learning = new WeakMap<TextBlock, boolean>();

  /** The blocks to analyze: those not in another language, when the surface checks. */
  async function inLearningLanguage(batch: TextBlock[]) {
    if (!o.surface.perBlockLanguage) return batch;
    const keep = await Promise.all(
      batch.map(async (block) => {
        let ok = learning.get(block);
        if (ok === undefined) {
          ok = await o
            .detectLanguage(block.text)
            .then((detected) => !inOtherLanguage(detected, o.lang))
            .catch(() => true);
          learning.set(block, ok);
        }
        return ok;
      }),
    );
    return batch.filter((_, i) => keep[i]);
  }

  async function analyze(list: TextBlock[]) {
    const batch = await inLearningLanguage(list);
    if (batch.length === 0) return;
    const stamps = lookup.waiting ? [] : batch.map(blocks.stamp);
    const result = await lookup.analyze(batch.map((b) => b.text));
    if (!result) {
      for (const block of batch) blocks.wait(block);
      return;
    }
    const fresh: TextBlock[] = [];
    batch.forEach((block, i) => {
      if (!blocks.current(block, stamps[i])) return;
      blocks.setSpans(block, result.spans[i] ?? []);
      fresh.push(block);
    });
    o.analyzed(fresh, result.saved);
  }

  return {
    analyze,
    /** Analyzes blocks again (all analyzed ones by default), in batches. */
    async reanalyze(list: readonly TextBlock[] = [...blocks.spans.keys()]) {
      for (const batch of batches(list)) await analyze(batch);
    },
  };
}

export type Analysis = ReturnType<typeof createAnalysis>;
