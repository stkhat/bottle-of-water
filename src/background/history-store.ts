import {
  normalizeUrl,
  onHost,
  sourceId,
  type Platform,
  type Position,
} from "../core/url";
import type { HistoryPageRecord, HistorySentenceRecord, LingoDb } from "./db";

export interface HistorySource {
  platform: Platform;
  /** Any form of the page or video URL; the store normalizes it. */
  url: string;
  title: string;
  /** The language of the page or video. */
  lang: string;
}

export interface HistoryItem {
  text: string;
  translation?: string;
  pos: Position;
  /** The term ids (`lang:key`) the sentence is found by. */
  keys: readonly string[];
}

/** A kept sentence with the page or video it was seen on. */
export interface HistorySentence {
  text: string;
  translation?: string;
  pos: Position;
  seenAt: number;
  page: Pick<HistoryPageRecord, "platform" | "url" | "title" | "lang">;
}

export interface HistoryStatus {
  /** The counted size of everything kept. */
  bytes: number;
  cap: number;
  /** Pages and videos kept. */
  pages: number;
}

export interface HistoryStore {
  /**
   * Keeps the sentences of a page or video that are not kept for it yet; items with
   * no keys are skipped. Then removes the oldest pages while over the cap. Returns
   * how many sentences were added.
   */
  record(source: HistorySource, items: readonly HistoryItem[]): Promise<number>;
  /** Kept sentences with the term id, newest first, without the page at `excludeUrl`. */
  find(
    termId: string,
    options?: { excludeUrl?: string; limit?: number },
  ): Promise<HistorySentence[]>;
  status(): Promise<HistoryStatus>;
  /** Removes every kept page and sentence. */
  clear(): Promise<void>;
  /** Removes the pages of a host and its subdomains. Returns how many. */
  forgetHost(host: string): Promise<number>;
}

export interface HistoryStoreOptions {
  now?: () => number;
  /** When the total goes over it, the oldest pages go until it is under 90 % of it. */
  capBytes?: number;
}

export const HISTORY_CAP_BYTES = 50 * 1024 * 1024;

/** After going over the cap, pages are removed until the total is at most this share of it. */
const EVICT_TO = 0.9;
/** Counted per record on top of its strings. */
const RECORD_OVERHEAD = 64;

/** The counted size of strings: UTF-16, two bytes per code unit. */
const utf16 = (...texts: readonly string[]) =>
  texts.reduce((sum, text) => sum + 2 * text.length, 0);

const pageSize = (page: Pick<HistoryPageRecord, "url" | "title">) =>
  utf16(page.url, page.title) + RECORD_OVERHEAD;

const sentenceSize = (
  sentence: Pick<HistorySentenceRecord, "text" | "translation" | "keys">,
) =>
  utf16(sentence.text, sentence.translation ?? "", ...sentence.keys) +
  RECORD_OVERHEAD;

function normalizedOrRaw(url: string) {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
}

export function createHistoryStore(
  db: LingoDb,
  { now = Date.now, capBytes = HISTORY_CAP_BYTES }: HistoryStoreOptions = {},
): HistoryStore {
  const tables = [db.historyPages, db.historySentences, db.meta];

  const totalBytes = async () =>
    (await db.meta.get("historyBytes"))?.value ?? 0;
  const setTotalBytes = (value: number) =>
    db.meta.put({ key: "historyBytes", value: Math.max(0, value) });

  /** Deletes pages and their sentences; returns the bytes they counted. */
  async function deletePages(pages: readonly HistoryPageRecord[]) {
    if (pages.length === 0) return 0;
    const ids = pages.map((p) => p.id);
    await db.historySentences.where("pageId").anyOf(ids).delete();
    await db.historyPages.bulkDelete(ids);
    return pages.reduce((sum, p) => sum + p.bytes, 0);
  }

  /** While over the cap, removes the oldest pages (never `keepId`) down to 90 % of it. */
  async function evict(keepId: string, total: number) {
    if (total <= capBytes) return total;
    const victims: HistoryPageRecord[] = [];
    let left = total;
    for (const page of await db.historyPages.orderBy("lastSeen").toArray()) {
      if (left <= capBytes * EVICT_TO) break;
      if (page.id === keepId) continue;
      victims.push(page);
      left -= page.bytes;
    }
    return total - (await deletePages(victims));
  }

  return {
    record(source, items) {
      const keyed = items.filter((item) => item.keys.length > 0);
      if (keyed.length === 0) return Promise.resolve(0);
      return db.transaction("rw", tables, async () => {
        const at = now();
        const url = normalizeUrl(source.url);
        const id = sourceId(source.platform, url);
        const existing = await db.historyPages.get(id);
        const title = source.title || existing?.title || "";
        let added = existing ? 0 : pageSize({ url, title });

        const seen = new Set<string>();
        let count = 0;
        for (const item of keyed) {
          if (seen.has(item.text)) continue;
          seen.add(item.text);
          const kept = await db.historySentences
            .where("[pageId+text]")
            .equals([id, item.text])
            .count();
          if (kept > 0) continue;
          const sentence: HistorySentenceRecord = {
            pageId: id,
            text: item.text,
            pos: item.pos,
            keys: [...new Set(item.keys)],
            seenAt: at,
          };
          if (item.translation !== undefined)
            sentence.translation = item.translation;
          await db.historySentences.add(sentence);
          added += sentenceSize(sentence);
          count++;
        }

        await db.historyPages.put({
          id,
          platform: source.platform,
          url,
          host: new URL(url).hostname.toLowerCase(),
          title,
          lang: source.lang,
          firstSeen: existing?.firstSeen ?? at,
          lastSeen: at,
          bytes: (existing?.bytes ?? 0) + added,
        });
        await setTotalBytes(await evict(id, (await totalBytes()) + added));
        return count;
      });
    },

    async find(termId, { excludeUrl, limit = 50 } = {}) {
      const excluded =
        excludeUrl === undefined ? undefined : normalizedOrRaw(excludeUrl);
      const sentences = await db.historySentences
        .where("keys")
        .equals(termId)
        .toArray();
      const pages = await db.historyPages.bulkGet([
        ...new Set(sentences.map((s) => s.pageId)),
      ]);
      const byId = new Map(
        pages
          .filter((p) => p !== undefined && p.url !== excluded)
          .map((p) => [p!.id, p!]),
      );
      return sentences
        .filter((s) => byId.has(s.pageId))
        .sort((a, b) => b.seenAt - a.seenAt || (b.id ?? 0) - (a.id ?? 0))
        .slice(0, limit)
        .map((s) => {
          const page = byId.get(s.pageId)!;
          const found: HistorySentence = {
            text: s.text,
            pos: s.pos,
            seenAt: s.seenAt,
            page: {
              platform: page.platform,
              url: page.url,
              title: page.title,
              lang: page.lang,
            },
          };
          if (s.translation !== undefined) found.translation = s.translation;
          return found;
        });
    },

    async status() {
      const [bytes, pages] = await db.transaction(
        "r",
        [db.historyPages, db.meta],
        () => Promise.all([totalBytes(), db.historyPages.count()]),
      );
      return { bytes, cap: capBytes, pages };
    },

    clear() {
      return db.transaction("rw", tables, async () => {
        await db.historySentences.clear();
        await db.historyPages.clear();
        await setTotalBytes(0);
      });
    },

    forgetHost(host) {
      return db.transaction("rw", tables, async () => {
        const pages = await db.historyPages
          .filter((page) => onHost(page.host, host))
          .toArray();
        const removed = await deletePages(pages);
        if (removed > 0) await setTotalBytes((await totalBytes()) - removed);
        return pages.length;
      });
    },
  };
}
