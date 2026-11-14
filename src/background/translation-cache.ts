import type { TranslationItem } from "../messaging/protocol";
import type { LingoDb, MtCacheRecord } from "./db";

/**
 * Machine translations of English definitions on this device (`mtCache`), by language
 * pair and cleaned English text: the same text always translates the same way. The UI
 * translates; the background only keeps and gives back what it was sent.
 */
export interface TranslationCache {
  /**
   * The cached translations of `texts`, keyed by text; texts without one are left out.
   * The ones last used more than a day ago are marked as used now; the others keep
   * their time, so reading writes a row at most once a day (and a read that finds
   * only recent rows writes nothing). Eviction by `usedAt` is then exact to a day.
   */
  get(pair: string, texts: readonly string[]): Promise<Record<string, string>>;
  /**
   * Keeps the translations (replacing older ones of the same text), then removes the
   * least recently used rows while there are more than the limit.
   */
  put(pair: string, items: readonly TranslationItem[]): Promise<void>;
  /** Removes every translation of a pair (its packs were removed). */
  clearPair(pair: string): Promise<void>;
}

export interface TranslationCacheOptions {
  /** Most rows kept, over all pairs. */
  limit?: number;
  now?: () => number;
}

const TRANSLATION_CACHE_LIMIT = 20_000;

const keyOf = (pair: string, text: string) => `${pair}:${text}`;

/** A row read again within this long of its last use keeps its `usedAt` (one day). */
const USED_AT_STEP_MS = 24 * 60 * 60 * 1000;

export function createTranslationCache(
  db: LingoDb,
  {
    limit = TRANSLATION_CACHE_LIMIT,
    now = Date.now,
  }: TranslationCacheOptions = {},
): TranslationCache {
  return {
    async get(pair, texts) {
      const keys = [...new Set(texts)].map((text) => keyOf(pair, text));
      if (keys.length === 0) return {};
      const found = (await db.mtCache.bulkGet(keys)).filter(
        (row): row is MtCacheRecord => row !== undefined,
      );
      const usedAt = now();
      const stale = found.filter(
        (row) => usedAt - row.usedAt > USED_AT_STEP_MS,
      );
      // Only `usedAt` changes, and only forward: a row put since the read keeps its own.
      if (stale.length > 0)
        await db.mtCache
          .where("key")
          .anyOf(stale.map((row) => row.key))
          .modify((row) => {
            if (row.usedAt < usedAt) row.usedAt = usedAt;
          });
      // fromEntries: any text is an own property, "__proto__" included.
      return Object.fromEntries(found.map((row) => [row.text, row.translated]));
    },

    async put(pair, items) {
      if (items.length === 0) return;
      const usedAt = now();
      await db.transaction("rw", db.mtCache, async () => {
        await db.mtCache.bulkPut(
          items.map(({ text, translated }) => ({
            key: keyOf(pair, text),
            pair,
            text,
            translated,
            usedAt,
          })),
        );
        const over = (await db.mtCache.count()) - limit;
        if (over <= 0) return;
        const oldest = await db.mtCache
          .orderBy("usedAt")
          .limit(over)
          .primaryKeys();
        await db.mtCache.bulkDelete(oldest);
      });
    },

    async clearPair(pair) {
      await db.mtCache.where("pair").equals(pair).delete();
    },
  };
}
