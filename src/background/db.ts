import { Dexie, type EntityTable } from "dexie";
import type { TermKind, TermStatus } from "../core/classify";
import type { Platform, Position } from "../core/url";

/**
 * A removed term stays as a tombstone with status `"removed"` (its `updatedAt` is the
 * removal time) so that sync and import can carry the removal to other copies.
 * Tombstones are left out of counts, the term index and live term lists.
 */
export type StoredStatus = TermStatus | "removed";

export interface TermRecord {
  /** `${lang}:${key}` */
  id: string;
  lang: string;
  /** The base form, or the base forms of a phrase joined by single spaces. */
  key: string;
  display: string;
  kind: TermKind;
  status: StoredStatus;
  /** Saved by "save all" (dropped first from sync when space runs out). */
  bulk?: boolean;
  /** The "save all" batch that created the term, until the term is changed. */
  batchId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SourceRecord {
  /** `sourceId(platform, url)` */
  id: string;
  platform: Platform;
  /** Normalized with `normalizeUrl`. */
  url: string;
  title: string;
  lang: string;
  firstSeen: number;
  lastSeen: number;
}

export type Origin = "saved" | "encountered";

export interface OccurrenceRecord {
  id?: number;
  termId: string;
  sourceId: string;
  sentence: string;
  translation?: string;
  pos: Position;
  seenAt: number;
  origin: Origin;
}

/**
 * A page or video whose sentences Lingo keeps for "Seen elsewhere" (sentence history).
 * Never synced or exported.
 */
export interface HistoryPageRecord {
  /** `sourceId(platform, url)` */
  id: string;
  platform: Platform;
  /** Normalized with `normalizeUrl`. */
  url: string;
  /** The URL's host, lowercase. */
  host: string;
  title: string;
  lang: string;
  firstSeen: number;
  lastSeen: number;
  /** The counted size of the page record and its sentences. */
  bytes: number;
}

export interface HistorySentenceRecord {
  id?: number;
  pageId: string;
  text: string;
  translation?: string;
  pos: Position;
  /** The term ids (`lang:key`) the sentence is found by. */
  keys: string[];
  seenAt: number;
}

/**
 * A machine translation of a cleaned English definition (`cleanDefinition`), made by
 * the browser's translator in the UI. Device only: never synced or exported.
 */
export interface MtCacheRecord {
  /** `${pair}:${text}` */
  key: string;
  /** `${learning language}>${native language}` (`translationPair`). */
  pair: string;
  /** The cleaned English definition. */
  text: string;
  translated: string;
  /** When the translation was last written or read (epoch ms). */
  usedAt: number;
}

/** `historyBytes`: the counted size of all of the sentence history. */
export type MetaKey = "lastExportAt" | "lastSavedAt" | "historyBytes";

export interface MetaRecord {
  key: MetaKey;
  value: number;
}

export type LingoDb = Dexie & {
  terms: EntityTable<TermRecord, "id">;
  sources: EntityTable<SourceRecord, "id">;
  occurrences: EntityTable<OccurrenceRecord, "id">;
  meta: EntityTable<MetaRecord, "key">;
  historyPages: EntityTable<HistoryPageRecord, "id">;
  historySentences: EntityTable<HistorySentenceRecord, "id">;
  mtCache: EntityTable<MtCacheRecord, "key">;
};

/** The extension's IndexedDB database. Tests pass a unique name per test. */
export function openLingoDb(name = "lingo"): LingoDb {
  const db = new Dexie(name) as LingoDb;
  db.version(1).stores({
    terms: "id, lang, status, updatedAt, batchId, [lang+status]",
    sources: "id",
    occurrences:
      "++id, termId, &[termId+sourceId+sentence], [termId+seenAt], seenAt",
    meta: "key",
  });
  db.version(2).stores({
    historyPages: "id, lastSeen, host",
    historySentences: "++id, pageId, &[pageId+text], *keys",
  });
  db.version(3).stores({
    mtCache: "key, usedAt, pair",
  });
  return db;
}
