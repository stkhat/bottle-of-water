import { translationPair } from "../core/packs/pairs";
import type { ExplanationKey, KeptExplanation } from "../messaging/protocol";
import type { LangleDb } from "./db";

/**
 * The on-device AI's answers on this device (`explanations`), by pair, term, place and
 * model, so a window opened again on the same sentence shows its answer at once. The
 * UI asks the model; the background only keeps and gives back what it was sent.
 * Never exported or synced.
 */
export interface ExplanationCache {
  /** The kept answer, marked as used now; undefined when there is none. */
  get(key: ExplanationKey): Promise<KeptExplanation | undefined>;
  /**
   * Keeps the answer (replacing an older one of the same key), then removes the least
   * recently used rows while there are more than the limit.
   */
  put(key: ExplanationKey, kept: KeptExplanation): Promise<void>;
  /** Removes every answer of a pair (its packs were removed: the senses may change). */
  clearPair(pair: string): Promise<void>;
}

export interface ExplanationCacheOptions {
  /** Most rows kept, over all pairs. */
  limit?: number;
  now?: () => number;
}

const EXPLANATION_CACHE_LIMIT = 5_000;

/** The row key: every field of `ExplanationKey`, the source URL normalized by the caller. */
const keyOf = (k: ExplanationKey) =>
  JSON.stringify([
    translationPair(k.learning, k.native),
    k.key,
    k.sourceUrl,
    k.sentence,
    k.provider,
    k.version,
  ]);

export function createExplanationCache(
  db: LangleDb,
  {
    limit = EXPLANATION_CACHE_LIMIT,
    now = Date.now,
  }: ExplanationCacheOptions = {},
): ExplanationCache {
  return {
    async get(key) {
      const k = keyOf(key);
      const row = await db.explanations.get(k);
      if (!row) return undefined;
      // One row per window opened: marked as used every time.
      await db.explanations.update(k, { usedAt: now() });
      return { answer: row.answer, lines: row.lines };
    },

    async put(key, { answer, lines }) {
      await db.transaction("rw", db.explanations, async () => {
        await db.explanations.put({
          key: keyOf(key),
          pair: translationPair(key.learning, key.native),
          answer,
          lines,
          usedAt: now(),
        });
        const over = (await db.explanations.count()) - limit;
        if (over <= 0) return;
        const oldest = await db.explanations
          .orderBy("usedAt")
          .limit(over)
          .primaryKeys();
        await db.explanations.bulkDelete(oldest);
      });
    },

    async clearPair(pair) {
      await db.explanations.where("pair").equals(pair).delete();
    },
  };
}
