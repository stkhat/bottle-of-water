/**
 * Each language's terms are kept as codec chunks under `sync:<lang>:…`; sources and
 * occurrences stay on the device. A signed-out browser keeps `storage.sync` on the
 * device only, which needs no special case here.
 */
import { browser } from "wxt/browser";
import { SETTINGS_FIELDS } from "../../core/cloud/settings";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  SETTINGS_KEY,
  SETTINGS_TIMES_KEY,
} from "../../core/settings";
import {
  CHUNK_CHARS,
  compareKeys,
  decode,
  encode,
  fromMinutes,
  merge,
  toMinutes,
  type SyncRecord,
} from "../../core/sync/codec";
import {
  chunkIndexOf,
  chunkKey,
  itemBytes,
  langOfKey,
  metaKey,
  type SyncMeta,
} from "../../core/sync/layout";
import { errorText, serial } from "../../core/util";
import type { SyncStatus, TermRecord } from "../../messaging/protocol";
import {
  watchStorage,
  type StorageChange,
  type StorageChangedEvent,
} from "../../messaging/storage";
import type { TermStore } from "../term-store";

/** The parts of `storage.sync` the backend uses. */
export interface SyncArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getBytesInUse?(keys?: string | string[] | null): Promise<number>;
  QUOTA_BYTES?: number;
  QUOTA_BYTES_PER_ITEM?: number;
}

interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface BrowserSyncBackendOptions {
  store: TermStore;
  /** Defaults to `browser.storage.sync`. */
  area?: SyncArea;
  /** Defaults to `browser.storage.onChanged`. */
  onChanged?: StorageChangedEvent;
  now?: () => number;
  timers?: Timers;
  /**
   * Whether the terms sync through the user's own cloud storage instead: then nothing
   * is pushed or pulled (settings stay in `storage.sync` all the same).
   */
  termsInCloud?: () => Promise<boolean>;
}

export interface BrowserSyncBackend {
  /** Merges this device's terms of `lang` into the synced copy and writes it. */
  push(lang: string): Promise<void>;
  /** Reads the synced copy of `lang` and applies the versions newer than this device's. */
  pull(lang: string): Promise<void>;
  status(): Promise<SyncStatus>;
  /** Pulls every language on this device or in the synced data, and waits for it. */
  pullAll(): Promise<void>;
  /** Pulls every language, then follows local changes (push) and other devices' (pull). */
  start(): Promise<void>;
  stop(): void;
  /** Resolves once no push or pull is running or queued (timers not counted). */
  whenIdle(): Promise<void>;
}

/** Used when the browser does not expose the `storage.sync` constants. */
const DEFAULT_QUOTA_BYTES = 102_400;
const DEFAULT_QUOTA_BYTES_PER_ITEM = 8_192;
/** Pushes wait this long after the last local change. */
const PUSH_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 10 * 60_000;
/** Removals older than this are no longer carried to other devices. */
const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60_000;
/** The synced copy of a language may fill this share of the room left by other keys. */
const FILL_LIMIT = 0.9;

/**
 * Key → bytes kept for the settings and their field times even before they are stored
 * (at their default size), so writing them never runs into the quota.
 */
export function settingsReserves(): Map<string, number> {
  return new Map([
    [SETTINGS_KEY, itemBytes(SETTINGS_KEY, DEFAULT_SETTINGS)],
    [
      SETTINGS_TIMES_KEY,
      itemBytes(SETTINGS_TIMES_KEY, {
        values: DEFAULT_SETTINGS,
        times: Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, Date.now()])),
      }),
    ],
  ]);
}
const SYNC_VERSION: SyncMeta["v"] = 1;

const NEWER_VERSION =
  "The synced data was written by a newer version of Langle. Update Langle on this device.";
const UNREADABLE = "The synced data could not be read.";

const isMeta = (value: unknown): value is SyncMeta => {
  const m = value as Partial<SyncMeta> | null;
  return (
    typeof m === "object" &&
    m !== null &&
    Number.isSafeInteger(m.chunks) &&
    m.chunks! >= 0 &&
    typeof m.updatedAt === "number" &&
    typeof m.v === "number"
  );
};

interface Remote {
  meta?: SyncMeta;
  /** Shared with later reads of the same chunks: never changed. */
  records: readonly SyncRecord[];
  /** Why the records are empty though data is there. */
  problem?: string;
}

/**
 * Decodes chunks, reusing the last result of each language while its chunks read the
 * same: the popup asks for the status every second, and decoding is most of it.
 */
function remoteDecoder() {
  const last = new Map<string, { text: string; records: SyncRecord[] }>();
  return async (lang: string, chunks: string[]) => {
    if (chunks.length === 0) return decode(chunks);
    const text = chunks.join("");
    const kept = last.get(lang);
    if (kept?.text === text) return kept.records;
    const records = await decode(chunks);
    last.set(lang, { text, records });
    return records;
  };
}

async function readRemote(
  lang: string,
  all: Record<string, unknown>,
  decodeChunks: (lang: string, chunks: string[]) => Promise<SyncRecord[]>,
): Promise<Remote> {
  const meta = all[metaKey(lang)];
  if (meta === undefined) return { records: [] };
  if (!isMeta(meta)) return { records: [], problem: UNREADABLE };
  if (meta.v > SYNC_VERSION)
    return { meta, records: [], problem: NEWER_VERSION };
  const chunks: string[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = all[chunkKey(lang, i)];
    if (typeof chunk !== "string")
      return { meta, records: [], problem: UNREADABLE };
    chunks.push(chunk);
  }
  try {
    return { meta, records: await decodeChunks(lang, chunks) };
  } catch {
    return { meta, records: [], problem: UNREADABLE };
  }
}

const toRecord = (term: TermRecord): SyncRecord => ({
  key: term.key,
  status: term.status,
  ...(term.learnedAt !== undefined && { learned: true }),
  updatedMinutes: toMinutes(term.updatedAt),
});

const sameRecords = (a: readonly SyncRecord[], b: readonly SyncRecord[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.key === b[i]!.key &&
      r.status === b[i]!.status &&
      r.learned === b[i]!.learned &&
      r.updatedMinutes === b[i]!.updatedMinutes,
  );

/** What a value looked like when this device wrote it, to recognize its own writes. */
const fingerprint = (value: unknown) =>
  value === undefined ? "<removed>" : JSON.stringify(value);

export function createBrowserSyncBackend({
  store,
  area = browser.storage.sync,
  onChanged = browser.storage.onChanged,
  now = Date.now,
  timers = globalThis,
  termsInCloud = () => Promise.resolve(false),
}: BrowserSyncBackendOptions): BrowserSyncBackend {
  const quotaBytes =
    typeof area.QUOTA_BYTES === "number"
      ? area.QUOTA_BYTES
      : DEFAULT_QUOTA_BYTES;
  const quotaBytesPerItem =
    typeof area.QUOTA_BYTES_PER_ITEM === "number"
      ? area.QUOTA_BYTES_PER_ITEM
      : DEFAULT_QUOTA_BYTES_PER_ITEM;
  const reserves = settingsReserves();

  const written = new Map<string, string>();
  const pushTimers = new Map<string, unknown>();
  const queuedPulls = new Set<string>();
  const droppedKnown = new Map<string, number>();
  let pushError: string | undefined;
  let pullError: string | undefined;
  let failures = 0;
  let started = false;
  let unsubscribe: (() => void) | undefined;

  const decodeChunks = remoteDecoder();
  const queue = serial((error: unknown) => console.error(error));
  const enqueue = (op: () => Promise<void>) => queue.run(op);

  const isEnabled = (all: Record<string, unknown>) =>
    mergeSettings(all[SETTINGS_KEY]).syncEnabled;

  /** Room for this language's chunks and meta: the quota minus every other key. */
  function room(lang: string, all: Record<string, unknown>) {
    let others = 0;
    for (const [key, value] of Object.entries(all)) {
      if (key === metaKey(lang) || chunkIndexOf(lang, key) !== undefined)
        continue;
      others += Math.max(itemBytes(key, value), reserves.get(key) ?? 0);
    }
    for (const [key, reserve] of reserves) if (!(key in all)) others += reserve;
    return quotaBytes - others;
  }

  async function pack(lang: string, records: SyncRecord[], at: number) {
    const chunkChars = Math.min(
      CHUNK_CHARS,
      quotaBytesPerItem - itemBytes(chunkKey(lang, 999), ""),
    );
    const chunks = await encode(records, { chunkChars });
    const meta: SyncMeta = {
      chunks: chunks.length,
      updatedAt: at,
      v: SYNC_VERSION,
    };
    const bytes = chunks.reduce(
      (sum, chunk, i) => sum + itemBytes(chunkKey(lang, i), chunk),
      itemBytes(metaKey(lang), meta),
    );
    return { chunks, meta, bytes };
  }

  type Packed = Awaited<ReturnType<typeof pack>> & { records: SyncRecord[] };

  /**
   * Leaves out the fewest of `keys` (in order) so the rest of `records` fits in
   * `limit`. Sizes grow with the number of records, so a binary search finds it.
   */
  async function leaveOut(
    lang: string,
    records: SyncRecord[],
    keys: string[],
    limit: number,
    at: number,
  ): Promise<{ packed: Packed; count: number }> {
    const without = async (n: number): Promise<Packed> => {
      const out = new Set(keys.slice(0, n));
      const kept = records.filter((r) => !out.has(r.key));
      return { ...(await pack(lang, kept, at)), records: kept };
    };
    let best = await without(keys.length);
    if (best.bytes > limit) return { packed: best, count: keys.length };
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const packed = await without(mid);
      if (packed.bytes <= limit) {
        best = packed;
        high = mid;
      } else low = mid + 1;
    }
    return { packed: best, count: high };
  }

  /**
   * The records packed within `limit`: when they do not fit, "save all" terms are left
   * out oldest first, then known words oldest first.
   */
  async function fitToQuota(
    lang: string,
    records: SyncRecord[],
    local: TermRecord[],
    limit: number,
    at: number,
  ): Promise<{ packed: Packed; knownLeftOut: number }> {
    const packed: Packed = { ...(await pack(lang, records, at)), records };
    if (packed.bytes <= limit) return { packed, knownLeftOut: 0 };
    const oldestFirst = (terms: TermRecord[]) =>
      terms
        .sort((a, b) => a.updatedAt - b.updatedAt || compareKeys(a.key, b.key))
        .map((t) => t.key);
    const bulk = oldestFirst(
      local.filter((t) => t.bulk && t.status !== "removed"),
    );
    const withoutBulk = await leaveOut(lang, records, bulk, limit, at);
    if (withoutBulk.packed.bytes <= limit)
      return { packed: withoutBulk.packed, knownLeftOut: 0 };
    const known = oldestFirst(
      local.filter((t) => !t.bulk && t.status === "known"),
    );
    const withoutKnown = await leaveOut(
      lang,
      withoutBulk.packed.records,
      known,
      limit,
      at,
    );
    return { packed: withoutKnown.packed, knownLeftOut: withoutKnown.count };
  }

  async function write(
    lang: string,
    all: Record<string, unknown>,
    { chunks, meta }: Packed,
  ) {
    const items: Record<string, unknown> = {};
    chunks.forEach((chunk, i) => (items[chunkKey(lang, i)] = chunk));
    const stale = Object.keys(all).filter(
      (key) => (chunkIndexOf(lang, key) ?? -1) >= chunks.length,
    );
    // Chunks first, then the meta that points at them, then chunks nobody needs.
    for (const [key, value] of Object.entries(items))
      written.set(key, fingerprint(value));
    if (chunks.length > 0) await area.set(items);
    written.set(metaKey(lang), fingerprint(meta));
    await area.set({ [metaKey(lang)]: meta });
    for (const key of stale) written.set(key, fingerprint(undefined));
    if (stale.length > 0) await area.remove(stale);
  }

  /**
   * Everything in `storage.sync` and the synced copy of `lang`; none while sync is off
   * or the terms sync through the user's own cloud storage.
   */
  async function readSynced(lang: string) {
    const all = await area.get(null);
    if (!isEnabled(all) || (await termsInCloud())) return undefined;
    return { all, remote: await readRemote(lang, all, decodeChunks) };
  }

  /** This device's terms of `lang` (tombstones included), merged with the synced copy. */
  async function readAndMerge(lang: string, remote: Remote) {
    const local = await store.listTerms(lang, { includeRemoved: true });
    return { local, ...merge(local.map(toRecord), remote.records) };
  }

  async function pushNow(lang: string) {
    const synced = await readSynced(lang);
    if (!synced) return;
    const { all, remote } = synced;
    if (remote.problem === NEWER_VERSION) throw new Error(NEWER_VERSION);

    const {
      local: read,
      merged,
      changedLocal,
    } = await readAndMerge(lang, remote);
    let local = read;
    if (changedLocal.length > 0) {
      await store.applySynced(lang, changedLocal);
      local = await store.listTerms(lang, { includeRemoved: true });
    }

    const at = now();
    const cutoff = at - TOMBSTONE_MAX_AGE_MS;
    const records = merged.filter(
      (r) => r.status !== "removed" || fromMinutes(r.updatedMinutes) >= cutoff,
    );
    const { packed, knownLeftOut } = await fitToQuota(
      lang,
      records,
      local,
      FILL_LIMIT * room(lang, all),
      at,
    );
    droppedKnown.set(lang, knownLeftOut);

    const unchanged =
      remote.meta !== undefined &&
      remote.problem === undefined &&
      sameRecords(packed.records, remote.records);
    if (!unchanged) await write(lang, all, packed);
    await store.setMeta("lastSavedAt", at);
  }

  async function pullNow(lang: string) {
    const synced = await readSynced(lang);
    if (!synced) return;
    const { remote } = synced;
    if (remote.problem) {
      pullError = remote.problem;
      return;
    }
    const { local, changedLocal } = await readAndMerge(lang, remote);
    if (changedLocal.length > 0) await store.applySynced(lang, changedLocal);
    pullError = undefined;

    // Push when this device has versions the synced copy lacks: newer ones, or
    // ones changed after it was written (older missing ones were left out on purpose).
    const taken = new Set(changedLocal.map((r) => r.key));
    const theirs = new Map(remote.records.map((r) => [r.key, r]));
    const writtenAt = remote.meta?.updatedAt ?? -Infinity;
    const cutoff = now() - TOMBSTONE_MAX_AGE_MS;
    const ahead = local.some((term) => {
      if (taken.has(term.key)) return false;
      if (term.status === "removed" && term.updatedAt < cutoff) return false;
      const other = theirs.get(term.key);
      return other
        ? toMinutes(term.updatedAt) > other.updatedMinutes
        : term.updatedAt > writtenAt;
    });
    if (ahead) schedulePush(lang);
  }

  function push(lang: string) {
    return enqueue(async () => {
      try {
        await pushNow(lang);
        pushError = undefined;
        failures = 0;
      } catch (error) {
        pushError = errorText(error);
        failures++;
        schedulePush(lang);
      }
    });
  }

  /** A pull whose failure is kept as the status's error. */
  async function pullSafely(lang: string) {
    try {
      await pullNow(lang);
    } catch (error) {
      pullError = errorText(error);
    }
  }

  function pull(lang: string) {
    return enqueue(() => pullSafely(lang));
  }

  /** Pulls `lang` once, however many changes come in before it runs. */
  function requestPull(lang: string) {
    if (queuedPulls.has(lang)) return;
    queuedPulls.add(lang);
    void enqueue(() => {
      queuedPulls.delete(lang);
      return pullSafely(lang);
    });
  }

  function schedulePush(lang: string) {
    if (!started) return;
    const backoff =
      failures > 0
        ? Math.min(PUSH_DELAY_MS * 2 ** failures, MAX_RETRY_DELAY_MS)
        : 0;
    timers.clearTimeout(pushTimers.get(lang));
    pushTimers.set(
      lang,
      timers.setTimeout(
        () => {
          pushTimers.delete(lang);
          void push(lang);
        },
        Math.max(PUSH_DELAY_MS, backoff),
      ),
    );
  }

  function cancelPushes() {
    for (const handle of pushTimers.values()) timers.clearTimeout(handle);
    pushTimers.clear();
  }

  /** Queues a pull of every language on this device or in the synced data. */
  function pullAll() {
    return enqueue(async () => {
      const all = await area.get(null);
      const langs = new Set(await store.languages());
      for (const key of Object.keys(all)) {
        const lang = langOfKey(key);
        if (lang) langs.add(lang);
      }
      for (const lang of langs) requestPull(lang);
    });
  }

  const onStorageChanged = (changes: Record<string, StorageChange>) => {
    const settings = changes[SETTINGS_KEY];
    if (settings) {
      const was = mergeSettings(settings.oldValue).syncEnabled;
      const is = mergeSettings(settings.newValue).syncEnabled;
      if (was && !is) cancelPushes();
      if (!was && is) void pullAll();
    }
    for (const [key, change] of Object.entries(changes)) {
      const lang = langOfKey(key);
      if (!lang || written.get(key) === fingerprint(change.newValue)) continue;
      requestPull(lang);
    }
  };

  async function bytesInUse(all: Record<string, unknown>) {
    if (typeof area.getBytesInUse === "function") {
      try {
        return await area.getBytesInUse(null);
      } catch {
        // Not implemented in this browser; count it ourselves.
      }
    }
    return Object.entries(all).reduce(
      (sum, [key, value]) => sum + itemBytes(key, value),
      0,
    );
  }

  return {
    push,
    pull,

    async pullAll() {
      await pullAll();
      await this.whenIdle();
    },

    async status() {
      const all = await area.get(null);
      let syncedCount = 0;
      let localOnlyCount = 0;
      for (const lang of await store.languages()) {
        const remote = await readRemote(lang, all, decodeChunks);
        const synced = new Set(
          remote.records
            .filter((r) => r.status !== "removed")
            .map((r) => r.key),
        );
        // The live terms' keys: the index stays the same map until they change.
        for (const key of (await store.termIndex(lang)).keys()) {
          if (synced.has(key)) syncedCount++;
          else if (!remote.problem) localOnlyCount++;
        }
      }
      const status: SyncStatus = {
        enabled: isEnabled(all),
        termsInCloud: await termsInCloud(),
        bytesUsed: await bytesInUse(all),
        quotaBytes,
        syncedCount,
        localOnlyCount,
        droppedKnownCount: [...droppedKnown.values()].reduce(
          (a, b) => a + b,
          0,
        ),
      };
      const lastSavedAt = await store.getMeta("lastSavedAt");
      if (lastSavedAt !== undefined) status.lastSavedAt = lastSavedAt;
      const error = pushError ?? pullError;
      if (error !== undefined) status.error = error;
      return status;
    },

    async start() {
      if (started) return;
      started = true;
      const unsubscribeStore = store.onChange((lang, kind, origin) => {
        if (kind === "terms" && origin === "local") schedulePush(lang);
      });
      const unwatch = watchStorage("sync", onStorageChanged, onChanged);
      unsubscribe = () => {
        unsubscribeStore();
        unwatch();
      };
      await pullAll().catch((error: unknown) => {
        pullError = errorText(error);
      });
      await this.whenIdle();
    },

    stop() {
      if (!started) return;
      started = false;
      unsubscribe?.();
      cancelPushes();
    },

    async whenIdle() {
      let current: Promise<unknown>;
      do {
        current = queue.idle;
        await current;
      } while (current !== queue.idle);
    },
  };
}
