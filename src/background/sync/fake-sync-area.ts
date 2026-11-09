// Test helper: an in-memory storage.sync with quotas, getBytesInUse and failure injection,
// which WXT's fakeBrowser does not have. Several simulated devices can share one.
import { itemBytes } from "../../core/sync/layout";
import type {
  StorageChange,
  StorageChangedEvent,
  StorageChangedListener,
  SyncArea,
} from "./browser-sync-backend";

export interface FakeSyncArea extends SyncArea {
  onChanged: StorageChangedEvent;
  /** The stored items, as JSON values. */
  readonly data: Map<string, unknown>;
  /** Every `set` and `remove` that succeeded, in order. */
  readonly log: { op: "set" | "remove"; keys: string[] }[];
  /** Makes the next `set` or `remove` fail with `error`. */
  failNext(error: Error): void;
}

export interface FakeSyncAreaOptions {
  quotaBytes?: number;
  quotaBytesPerItem?: number;
  /** Leave out the quota constants, as a browser that does not expose them. */
  noQuotaConstants?: boolean;
  /** Leave out `getBytesInUse`. */
  noBytesInUse?: boolean;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createFakeSyncArea({
  quotaBytes = 102_400,
  quotaBytesPerItem = 8_192,
  noQuotaConstants = false,
  noBytesInUse = false,
}: FakeSyncAreaOptions = {}): FakeSyncArea {
  const data = new Map<string, unknown>();
  const listeners = new Set<StorageChangedListener>();
  const log: FakeSyncArea["log"] = [];
  let failure: Error | undefined;

  const keyList = (keys?: string | string[] | null) =>
    keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];

  const total = (items: Map<string, unknown>) =>
    [...items].reduce((sum, [k, v]) => sum + itemBytes(k, v), 0);

  function takeFailure() {
    const error = failure;
    failure = undefined;
    if (error) throw error;
  }

  /** Listeners run before the write resolves, as every device's onChanged would. */
  function emit(changes: Record<string, StorageChange>) {
    if (Object.keys(changes).length === 0) return;
    for (const listener of [...listeners]) listener(clone(changes), "sync");
  }

  const area: FakeSyncArea = {
    data,
    log,
    failNext(error) {
      failure = error;
    },

    get(keys) {
      const result: Record<string, unknown> = {};
      for (const key of keyList(keys))
        if (data.has(key)) result[key] = clone(data.get(key));
      return Promise.resolve(result);
    },

    set(items) {
      return Promise.resolve().then(() => {
        takeFailure();
        const next = new Map(data);
        for (const [key, value] of Object.entries(items)) {
          if (itemBytes(key, value) > quotaBytesPerItem)
            throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
          next.set(key, clone(value));
        }
        if (total(next) > quotaBytes)
          throw new Error("QUOTA_BYTES quota exceeded");
        const changes: Record<string, StorageChange> = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: data.get(key), newValue: value };
          data.set(key, clone(value));
        }
        log.push({ op: "set", keys: Object.keys(items) });
        emit(changes);
      });
    },

    remove(keys) {
      return Promise.resolve().then(() => {
        takeFailure();
        const changes: Record<string, StorageChange> = {};
        for (const key of keyList(keys)) {
          if (!data.has(key)) continue;
          changes[key] = { oldValue: data.get(key) };
          data.delete(key);
        }
        log.push({ op: "remove", keys: keyList(keys) });
        emit(changes);
      });
    },

    onChanged: {
      addListener: (listener) => void listeners.add(listener),
      removeListener: (listener) => void listeners.delete(listener),
    },
  };
  if (!noBytesInUse)
    area.getBytesInUse = (keys) =>
      Promise.resolve(
        keyList(keys).reduce(
          (sum, key) =>
            data.has(key) ? sum + itemBytes(key, data.get(key)) : sum,
          0,
        ),
      );
  if (!noQuotaConstants) {
    area.QUOTA_BYTES = quotaBytes;
    area.QUOTA_BYTES_PER_ITEM = quotaBytesPerItem;
  }
  return area;
}
