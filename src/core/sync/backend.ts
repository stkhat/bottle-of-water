/**
 * A place that keeps a copy of the user's terms and merges it with other devices
 * (spec: "Sync"). `BrowserSyncBackend` uses the browser's `storage.sync`; the user's own
 * cloud storage can be another implementation later.
 */
export interface SyncBackend {
  /** Merges this device's terms of `lang` into the synced copy and writes it. */
  push(lang: string): Promise<void>;
  /** Reads the synced copy of `lang` and applies the versions newer than this device's. */
  pull(lang: string): Promise<void>;
  status(): Promise<SyncStatus>;
  /** Pulls every language, then follows local changes (push) and other devices' (pull). */
  start(): Promise<void>;
  stop(): void;
}

export interface SyncStatus {
  /** `settings.syncEnabled`; when false nothing is pushed or pulled. */
  enabled: boolean;
  bytesUsed: number;
  quotaBytes: number;
  /** When this device last wrote (or confirmed) its terms in the synced copy. */
  lastSavedAt?: number;
  /** Saved terms (all languages) that are in the synced copy. */
  syncedCount: number;
  /** Saved terms kept on this device only because the synced copy is full. */
  localOnlyCount: number;
  /**
   * Of the local-only terms, how many are not "save all" terms (known words, oldest
   * first) — left out because dropping every "save all" term was not enough.
   */
  droppedKnownCount: number;
  /** The last failure, until an operation of the same kind succeeds. */
  error?: string;
}
