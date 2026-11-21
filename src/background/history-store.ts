import type { Classifier, ClassifyOptions } from "../core/classify";
import {
  HISTORY_CAP_BYTES,
  pageSize,
  pagesToEvict,
  sentenceSize,
} from "../core/history-size";
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
import { listeners } from "../core/util";
import { watchSettings } from "../messaging/storage";
import type {
  HistorySentenceInput,
  HistoryStatus,
  SourceInput,
} from "../messaging/protocol";
import type { HistoryPageRecord, HistorySentenceRecord, LangleDb } from "./db";
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
  /** Removes every page and sentence, and keeps the time of the "Clear". */
  clear(): Promise<void>;
  /**
   * Removes the pages of a host and its subdomains, and keeps the time the host was
   * added to "Never run on". Returns how many pages.
   */
  forgetHost(host: string): Promise<number>;
  /**
   * Called after each local change that was committed: `"rows"` when pages or sentences
   * were kept, `"forgotten"` after a "Clear" or a forgotten host (what `main` carries).
   */
  onChange(listener: (kind: "rows" | "forgotten") => void): () => void;
}

export interface HistoryStoreOptions {
  now?: () => number;
  /** This device's id (`deviceId`), which new sentences carry. Default: one per store. */
  deviceId?: () => Promise<string>;
  /** When the total goes over it, the oldest pages go until it is under 90 % of it. */
  capBytes?: number;
}

/** Base forms ranked within this many are too common to find sentences by. */
const COMMON_RANK = 300;

const PLATFORMS: readonly Platform[] = ["web", "youtube", "netflix"];

/**
 * The term ids a kept sentence is found by: every base form of each word except the
 * most common ones and the names the classifier finds (rule D, with the document's
 * casing in `options`), then the phrases (dictionary and saved) it finds. Each id
 * once, in that order.
 */
export function historyKeys(
  text: string,
  pack: LanguagePack,
  classifier: Classifier,
  options: ClassifyOptions,
): string[] {
  const keys = new Set<string>();
  const tokens = pack.tokenize(text);
  const spans = classifier.classify(tokens, options);
  const names = new Set(spans.filter((s) => s.name).map((s) => s.start));
  for (const token of tokens) {
    if (!token.isWord || names.has(token.start)) continue;
    for (const base of pack.lemmas(token.text))
      if (pack.rank(base) > COMMON_RANK) keys.add(termId(pack.lang, base));
  }
  for (const span of spans)
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

/** A random device id made once. */
function oneDevice() {
  const id = crypto.randomUUID();
  return () => Promise.resolve(id);
}

/**
 * Local changes are timed as cloud sync needs (architecture "Merge"): a page seen and
 * its new sentences no earlier than the last "Clear" (`historyClearedAt`) or the time
 * the host (or a parent domain) was added to "Never run on"; a "Clear" or a forgotten
 * host after the one before it and after every page it removes.
 */
export function createHistoryStore(
  db: LangleDb,
  {
    now = Date.now,
    deviceId = oneDevice(),
    capBytes = HISTORY_CAP_BYTES,
  }: HistoryStoreOptions = {},
): HistoryStore {
  const changed = listeners<["rows" | "forgotten"]>();
  const tables = [
    db.historyPages,
    db.historySentences,
    db.historyForgotten,
    db.meta,
  ];

  const totalBytes = async () =>
    (await db.meta.get("historyBytes"))?.value ?? 0;
  const setTotalBytes = (value: number) =>
    db.meta.put({ key: "historyBytes", value: Math.max(0, value) });
  const clearedAt = async () =>
    (await db.meta.get("historyClearedAt"))?.value ?? 0;

  /** When the host (or a parent domain) was last added to "Never run on"; 0 if never. */
  async function forgottenAt(host: string) {
    let at = 0;
    await db.historyForgotten.each((entry) => {
      if (onHost(host, entry.host)) at = Math.max(at, entry.at);
    });
    return at;
  }

  /** After every page in `pages` was last seen (their sentences were added by then). */
  const afterPages = (pages: readonly HistoryPageRecord[]) =>
    Math.max(0, ...pages.map((page) => page.lastSeen + 1));

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
    const oldestFirst = await db.historyPages.orderBy("lastSeen").toArray();
    const victims = pagesToEvict(oldestFirst, total, capBytes, keepId);
    return total - (await deletePages(victims));
  }

  return {
    async record(source, items) {
      const keyed = items.filter((item) => item.keys.length > 0);
      if (keyed.length === 0) return 0;
      // Read before the transaction: only database work may be waited for inside it.
      const device = await deviceId();
      const count = await db.transaction("rw", tables, async () => {
        const url = normalizeUrl(source.url);
        const host = hostnameOf(url)!.toLowerCase();
        const at = Math.max(now(), await clearedAt(), await forgottenAt(host));
        const id = sourceId(source.platform, url);
        const existing = await db.historyPages.get(id);
        const title = source.title || existing?.title || "";
        let added = existing ? 0 : pageSize({ url, title });

        // The first item of each text, then those the page does not keep yet.
        const seen = new Set<string>();
        const firsts = keyed.filter((item) => {
          if (seen.has(item.text)) return false;
          seen.add(item.text);
          return true;
        });
        const keptKeys = await db.historySentences
          .where("[pageId+text]")
          .anyOf(firsts.map((item) => [id, item.text]))
          .keys();
        const kept = new Set(
          keptKeys.map((key) => (key as unknown as [string, string])[1]),
        );
        const sentences = firsts
          .filter((item) => !kept.has(item.text))
          .map((item): HistorySentenceRecord => ({
            pageId: id,
            text: item.text,
            ...(item.translation !== undefined && {
              translation: item.translation,
            }),
            pos: item.pos,
            keys: [...new Set(item.keys)],
            seenAt: at,
            deviceId: device,
            addedAt: at,
          }));
        // In order: ids grow as sentences are added (`find` reads newest first).
        await db.historySentences.bulkAdd(sentences);
        for (const sentence of sentences) added += sentenceSize(sentence);
        const count = sentences.length;

        await db.historyPages.put({
          id,
          platform: source.platform,
          url,
          host,
          title,
          lang: source.lang,
          firstSeen: existing?.firstSeen ?? at,
          lastSeen: at,
          bytes: (existing?.bytes ?? 0) + added,
        });
        await setTotalBytes(await evict(id, (await totalBytes()) + added));
        return count;
      });
      changed.emit("rows");
      return count;
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

    async clear() {
      await db.transaction("rw", tables, async () => {
        const newest = await db.historyPages.orderBy("lastSeen").last();
        const at = Math.max(
          now(),
          (await clearedAt()) + 1,
          afterPages(newest ? [newest] : []),
        );
        await db.meta.put({ key: "historyClearedAt", value: at });
        await db.historySentences.clear();
        await db.historyPages.clear();
        await setTotalBytes(0);
      });
      changed.emit("forgotten");
    },

    async forgetHost(entry) {
      const host = entry.trim().toLowerCase();
      const count = await db.transaction("rw", tables, async () => {
        // Reads the host index only, then just the matching pages.
        const hosts = (await db.historyPages
          .orderBy("host")
          .uniqueKeys()) as string[];
        const matching = hosts.filter((h) => onHost(h, host));
        const pages =
          matching.length === 0
            ? []
            : await db.historyPages.where("host").anyOf(matching).toArray();
        const before = (await db.historyForgotten.get(host))?.at ?? 0;
        await db.historyForgotten.put({
          host,
          at: Math.max(now(), before + 1, afterPages(pages)),
        });
        const removed = await deletePages(pages);
        if (removed > 0) await setTotalBytes((await totalBytes()) - removed);
        return pages.length;
      });
      changed.emit("forgotten");
      return count;
    },

    onChange: changed.add,
  };
}
