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

export type MetaKey = "lastExportAt" | "lastSavedAt";

export interface MetaRecord {
  key: MetaKey;
  value: number;
}

export type LingoDb = Dexie & {
  terms: EntityTable<TermRecord, "id">;
  sources: EntityTable<SourceRecord, "id">;
  occurrences: EntityTable<OccurrenceRecord, "id">;
  meta: EntityTable<MetaRecord, "key">;
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
  return db;
}
