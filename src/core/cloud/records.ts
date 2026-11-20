/**
 * The records cloud sync moves between devices (architecture "Sync to the user's own
 * cloud storage"). They are the device's records with the fields every device needs to
 * merge them the same way: `clearedAt` on terms, `deviceId` and `addedAt` on rows.
 * Device-only fields (`batchId`, local ids, a page's counted `bytes`) are left out.
 */
import type { StoredStatus, TermKind } from "../classify";
import type { Meaning } from "../meanings";
import type { Platform, Position } from "../url";

export interface CloudTerm {
  /** `termId(lang, key)` */
  id: string;
  lang: string;
  key: string;
  display: string;
  kind: TermKind;
  status: StoredStatus;
  bulk?: boolean;
  learnedAt?: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
  /**
   * The last time the term was removed (a tombstone counts from its `updatedAt`).
   * Rows and choices from before it are never taken in again.
   */
  clearedAt?: number;
}

export interface CloudSource {
  /** `sourceId(platform, url)` */
  id: string;
  platform: Platform;
  url: string;
  title: string;
  lang: string;
  firstSeen: number;
  lastSeen: number;
}

type Origin = "saved" | "encountered";

/** A row recorded by one device: the one that first recorded it, and when. */
interface Recorded {
  deviceId: string;
  addedAt: number;
}

export interface CloudOccurrence extends Recorded {
  termId: string;
  sourceId: string;
  sentence: string;
  translation?: string;
  pos: Position;
  seenAt: number;
  origin: Origin;
}

export interface CloudMeaning extends Meaning {
  /** `meaningKey(termId, from, text)` */
  key: string;
  termId: string;
  createdAt: number;
}

/** The meaning chosen for one place of a term; `meaningKey` null is an undo. */
export interface CloudChoice {
  termId: string;
  sourceId: string;
  sentence: string;
  meaningKey: string | null;
  at: number;
  /** The device that made the choice. */
  deviceId: string;
}

export interface CloudHistoryPage {
  /** `sourceId(platform, url)` */
  id: string;
  platform: Platform;
  url: string;
  /** Lowercase. */
  host: string;
  title: string;
  lang: string;
  firstSeen: number;
  lastSeen: number;
}

export interface CloudHistorySentence extends Recorded {
  pageId: string;
  text: string;
  translation?: string;
  pos: Position;
  /** The term ids the sentence is found by. */
  keys: string[];
  seenAt: number;
}
