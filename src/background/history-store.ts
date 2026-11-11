import type { Classifier, ClassifyOptions } from "../core/classify";
import type { LanguagePack } from "../core/lexicon/language-pack";
import { termId } from "../core/term-id";
import {
  hostnameOf,
  onHost,
  sourceId,
  normalizeUrl,
  tryNormalizeUrl,
  type Platform,
} from "../core/url";
import { watchSettings } from "../messaging/storage";
import type {
  HistorySentenceInput,
  HistoryStatus,
  SourceInput,
} from "../messaging/protocol";
import type { HistoryPageRecord, HistorySentenceRecord, LingoDb } from "./db";
import type { ImportedOccurrence } from "./term-store";

export interface HistoryItem extends HistorySentenceInput {
  /** The term ids the sentence is found by (`historyKeys`). */
  keys: readonly string[];
}

export interface HistoryStore {
  /**
   * Keeps the sentences of a page or video that are not kept for it yet; items with
   * no keys are skipped. Then removes the oldest pages while over the cap. Returns
   * how many sentences were added.
   */
  record(source: SourceInput, items: readonly HistoryItem[]): Promise<number>;
  /**
   * Kept sentences with the term id, newest first (in the order they were kept), at
   * most `limit` (50), without the page at `excludeUrl`.
   */
  find(
    termId: string,
    options?: { excludeUrl?: string; limit?: number },
  ): Promise<ImportedOccurrence[]>;
  status(): Promise<HistoryStatus>;
  clear(): Promise<void>;
  /** Removes the pages of a host and its subdomains. Returns how many. */
  forgetHost(host: string): Promise<number>;
}

export interface HistoryStoreOptions {
  now?: () => number;
  /** When the total goes over it, the oldest pages go until it is under 90 % of it. */
  capBytes?: number;
}

const HISTORY_CAP_BYTES = 50 * 1024 * 1024;

/** Base forms ranked within this many are too common to find sentences by. */
const COMMON_RANK = 300;

const PLATFORMS: readonly Platform[] = ["web", "youtube", "netflix"];

const EVICT_TO = 0.9;
/** Counted per record on top of its strings. */
const RECORD_OVERHEAD = 64;

/** UTF-16, two bytes per code unit. */
const utf16 = (...texts: readonly string[]) =>
  texts.reduce((sum, text) => sum + 2 * text.length, 0);

const pageSize = (page: Pick<HistoryPageRecord, "url" | "title">) =>
  utf16(page.url, page.title) + RECORD_OVERHEAD;

const sentenceSize = (
  sentence: Pick<HistorySentenceRecord, "text" | "translation" | "keys">,
) =>
  utf16(sentence.text, sentence.translation ?? "", ...sentence.keys) +
  RECORD_OVERHEAD;

/**
 * The term ids a kept sentence is found by: every base form of each word except the
 * most common ones, then the phrases (dictionary and saved) the classifier finds in it.
 * Each id once, in that order.
 */
export function historyKeys(
  text: string,
  pack: LanguagePack,
  classifier: Classifier,
  options: ClassifyOptions,
): string[] {
  const keys = new Set<string>();
  const tokens = pack.tokenize(text);
  for (const token of tokens) {
    if (!token.isWord) continue;
    for (const base of pack.lemmas(token.text))
      if (pack.rank(base) > COMMON_RANK) keys.add(termId(pack.lang, base));
  }
  for (const span of classifier.classify(tokens, options))
    if (span.kind === "phrase") keys.add(termId(pack.lang, span.key));
  return [...keys];
}

const host = (entry: string) => entry.trim().toLowerCase();

/** The hosts in `after` that were not in `before` (case and spaces ignored), each once. */
export function addedHosts(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const old = new Set(before.map(host));
  return [...new Set(after.map(host))].filter(
    (entry) => entry !== "" && !old.has(entry),
  );
}

/**
 * Removes the kept pages of each host added to "Never run on" (here or on another
 * device), with its subdomains. Only changes count: nothing is removed on start.
 */
export function forgetNeverRunOnHosts(
  history: Pick<HistoryStore, "forgetHost">,
): () => void {
  return watchSettings((settings, previous) => {
    for (const entry of addedHosts(previous.neverRunOn, settings.neverRunOn))
      history.forgetHost(entry).catch((error: unknown) => console.error(error));
  });
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
            ...(item.translation !== undefined && {
              translation: item.translation,
            }),
            pos: item.pos,
            keys: [...new Set(item.keys)],
            seenAt: at,
          };
          await db.historySentences.add(sentence);
          added += sentenceSize(sentence);
          count++;
        }

        await db.historyPages.put({
          id,
          platform: source.platform,
          url,
          host: hostnameOf(url)!.toLowerCase(),
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
      // A URL is one page per platform; leave out every one of them.
      const excluded =
        excludeUrl === undefined
          ? new Set<string>()
          : new Set(
              PLATFORMS.map((p) =>
                sourceId(p, tryNormalizeUrl(excludeUrl) ?? excludeUrl),
              ),
            );
      // Ids grow as sentences are added: the index in reverse key order is newest first.
      const sentences = await db.historySentences
        .where("keys")
        .equals(termId)
        .reverse()
        .filter((s) => !excluded.has(s.pageId))
        .limit(limit)
        .toArray();
      const pages = await db.historyPages.bulkGet([
        ...new Set(sentences.map((s) => s.pageId)),
      ]);
      const byId = new Map(
        pages.filter((page) => page !== undefined).map((p) => [p.id, p]),
      );
      return sentences.flatMap(({ pageId, text, translation, pos, seenAt }) => {
        const page = byId.get(pageId);
        if (!page) return [];
        const { platform, url, title, lang } = page;
        return [
          {
            sentence: text,
            ...(translation !== undefined && { translation }),
            pos,
            seenAt,
            source: { platform, url, title, lang },
          },
        ];
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
        // Reads the host index only, then just the matching pages.
        const hosts = (await db.historyPages
          .orderBy("host")
          .uniqueKeys()) as string[];
        const matching = hosts.filter((h) => onHost(h, host));
        const pages =
          matching.length === 0
            ? []
            : await db.historyPages.where("host").anyOf(matching).toArray();
        const removed = await deletePages(pages);
        if (removed > 0) await setTotalBytes((await totalBytes()) - removed);
        return pages.length;
      });
    },
  };
}
