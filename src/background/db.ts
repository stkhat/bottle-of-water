import { Dexie, type EntityTable, type Table } from "dexie";
import type { Answer } from "../core/explain/answer";
import type { Meaning } from "../core/meanings";
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

/**
 * The device that first recorded a row (`deviceId`) and when it did (`addedAt`). Rows
 * taken in from elsewhere keep theirs; cloud sync writes a device's own rows into the
 * month of their `addedAt`.
 */
interface Recorded {
  deviceId: string;
  addedAt: number;
}

export interface OccurrenceRecord extends Recorded {
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
 * A meaning of "your meanings", named by the choices of a term's sentences. One row per
 * `key`, so the same meaning made on two devices, or imported, is one row. Dropped
 * locally once no live choice names it.
 */
export interface MeaningRecord extends Meaning {
  /** `meaningKey(termId, from, text)` */
  key: string;
  termId: string;
  createdAt: number;
}

/**
 * The meaning chosen for one place of a term: its source and sentence, the identity of
 * an occurrence. `meaningKey` null is an undo; the latest `at` wins.
 */
export interface MeaningChoiceRecord {
  termId: string;
  sourceId: string;
  sentence: string;
  meaningKey: string | null;
  at: number;
  /** The device that made the choice. */
  deviceId: string;
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

export interface HistorySentenceRecord extends Recorded {
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

/**
 * An answer of the on-device AI for a term in one sentence (`explanation-cache.ts`).
 * Device only, never exported.
 */
interface ExplanationRecord {
  /** The JSON array of the pair, the term, the source, the sentence and the model. */
  key: string;
  /** `translationPair(learning, native)` */
  pair: string;
  answer: Answer;
  /** How many lines around the sentence the prompt held. */
  lines: number;
  /** When the answer was last written or read. */
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

/**
 * `historyBytes`: the counted size of all of the sentence history. `historyClearedAt`:
 * the last "Clear" of the history; nothing kept from before it comes back.
 */
export type MetaKey =
  "lastExportAt" | "lastSavedAt" | "historyBytes" | "historyClearedAt";

/**
 * A host added to "Never run on", and when (lowercase): what the history kept of it
 * (and its subdomains) before that time never comes back.
 */
interface ForgottenHostRecord {
  host: string;
  at: number;
}

interface MetaRecord {
  key: MetaKey;
  value: number;
}

export type LangleDb = Dexie & {
  terms: EntityTable<TermRecord, "id">;
  sources: EntityTable<SourceRecord, "id">;
  occurrences: EntityTable<OccurrenceRecord, "id">;
  meta: EntityTable<MetaRecord, "key">;
  historyPages: EntityTable<HistoryPageRecord, "id">;
  historySentences: EntityTable<HistorySentenceRecord, "id">;
  historyForgotten: EntityTable<ForgottenHostRecord, "host">;
  mtCache: EntityTable<MtCacheRecord, "key">;
  packFiles: EntityTable<PackFileRecord, "sha256">;
  packVersions: EntityTable<PackVersionRecord, "pack">;
  meanings: EntityTable<MeaningRecord, "key">;
  meaningChoices: Table<MeaningChoiceRecord, [string, string, string]>;
  explanations: EntityTable<ExplanationRecord, "key">;
};

export interface LangleDbOptions {
  /** This device's id (`device-id.ts`): version 7 gives it to the rows it finds. */
  deviceId: () => Promise<string>;
  now?: () => number;
}

/**
 * Tests pass a unique name per test. Versions 1–3 only added tables, so they were
 * merged into 4: Dexie upgrades an older database by comparing the schemas. Version 5
 * adds your meanings and 6 the on-device AI's answers (phase 3). Version 7 prepares
 * cloud sync: the occurrences and history sentences already there get this device and
 * the upgrade time (`deviceId`, `addedAt`); terms gain `clearedAt` with nothing to fill
 * (a tombstone without one counts as cleared at its `updatedAt`); the hosts added to
 * "Never run on" are kept with their times.
 */
export function openLangleDb(
  name: string,
  { deviceId, now = Date.now }: LangleDbOptions,
): LangleDb {
  const db = new Dexie(name) as LangleDb;
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
  db.version(5).stores({
    meanings: "key, termId",
    meaningChoices: "[termId+sourceId+sentence], termId, meaningKey",
  });
  db.version(6).stores({ explanations: "key, usedAt, pair" });
  db.version(7)
    .stores({ historyForgotten: "host" })
    .upgrade(async (tx) => {
      // The id is read from storage.local: waiting for it keeps the transaction open.
      const device = await Dexie.waitFor(deviceId());
      const at = now();
      const recorded = (row: Partial<Recorded>) => {
        row.deviceId ??= device;
        row.addedAt ??= at;
      };
      await tx.table("occurrences").toCollection().modify(recorded);
      await tx.table("historySentences").toCollection().modify(recorded);
    });
  return db;
}
