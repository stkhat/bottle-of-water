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
   * The ones found are marked as used now.
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
      const found = await db.transaction("rw", db.mtCache, async () => {
        const rows = (await db.mtCache.bulkGet(keys)).filter(
          (row): row is MtCacheRecord => row !== undefined,
        );
        if (rows.length > 0) {
          const usedAt = now();
          await db.mtCache.bulkPut(rows.map((row) => ({ ...row, usedAt })));
        }
        return rows;
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
