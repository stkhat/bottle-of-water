import { Dexie, type EntityTable } from "dexie";
import type { Platform, Position } from "../core/url";
import type { Origin, TermRecord } from "../messaging/protocol";

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

/** A page or video of the sentence history. Never synced or exported. */
export interface HistoryPageRecord {
  /** `sourceId(platform, url)` */
  id: string;
  platform: Platform;
  /** Normalized with `normalizeUrl`. */
  url: string;
  /** Lowercase. */
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
  /** The term ids the sentence is found by. */
  keys: string[];
  seenAt: number;
}

/** A machine translation the UI made of a cleaned English definition. Device only. */
export interface MtCacheRecord {
  /** `${pair}:${text}` */
  key: string;
  /** `translationPair(learning, native)` */
  pair: string;
  text: string;
  translated: string;
  /** When the translation was last written or read. */
  usedAt: number;
}

/** A file of a downloaded pack, keyed by its SHA-256: a file shared by versions is stored once. */
interface PackFileRecord {
  sha256: string;
  blob: Blob;
}

export interface PackVersionRecord {
  pack: string;
  version: string;
  /** `PACK_FORMATS` */
  format: number;
  /** Each file's path in the pack ("freq.json") and its `packFiles` row. */
  files: { path: string; sha256: string }[];
}

/** `historyBytes`: the counted size of all of the sentence history. */
export type MetaKey = "lastExportAt" | "lastSavedAt" | "historyBytes";

interface MetaRecord {
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
  packFiles: EntityTable<PackFileRecord, "sha256">;
  packVersions: EntityTable<PackVersionRecord, "pack">;
};

/**
 * Tests pass a unique name per test. Versions 1–3 only added tables, so they were
 * merged into 4: Dexie upgrades an older database by comparing the schemas.
 */
export function openLingoDb(name = "lingo"): LingoDb {
  const db = new Dexie(name) as LingoDb;
  db.version(4).stores({
    terms: "id, lang, status, updatedAt, batchId, [lang+status]",
    sources: "id",
    occurrences:
      "++id, termId, &[termId+sourceId+sentence], [termId+seenAt], seenAt",
    meta: "key",
    historyPages: "id, lastSeen, host",
    historySentences: "++id, pageId, &[pageId+text], *keys",
    mtCache: "key, usedAt, pair",
    packFiles: "sha256",
    packVersions: "pack",
  });
  return db;
}
