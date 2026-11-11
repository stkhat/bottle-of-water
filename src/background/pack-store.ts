import { browser, type PublicPath } from "wxt/browser";
import { PACK_FORMATS } from "../core/packs/formats";
import type { FetchJson } from "../core/packs/load";
import {
  packBytes,
  type PackLock,
  type PackLockEntry,
  type PackLockFile,
} from "../core/packs/lock";
import type { PackState, PackStates } from "../core/packs/state";
import { PacksUnavailableError } from "../core/packs/unavailable";
import { errorText, listeners, own, promiseCache } from "../core/util";
import type { LingoDb, PackVersionRecord } from "./db";

/** What `ensure` did: the packs now at their lock version, and those that failed. */
export interface EnsureResult {
  /** Bundled packs, and downloaded ones at their lock version. */
  ready: string[];
  /** Packs whose download failed (their state says why), or that the lock lacks. */
  failed: string[];
}

/** A pack stored on the device. */
export interface DownloadedPack {
  pack: string;
  /** The version in use. */
  version: string;
  /** Bytes of its files. */
  size: number;
}

/**
 * Downloaded packs in IndexedDB (`packFiles`, `packVersions`): fetched from the
 * lock's mirrors, checked against the lock's SHA-256, switched to a new version in one
 * transaction. Bundled packs are not its business (`ensure` reports them ready).
 */
export interface PackStore {
  /**
   * Brings each downloaded pack of `packs` to its lock version. Files already stored
   * are not fetched again; the others are fetched one at a time, each from the mirrors
   * in order until one sends bytes with the lock's SHA-256, and stored at once. Once
   * all are there the pack switches to the version, and files no pack refers to are
   * deleted. Never rejects: a pack that cannot be downloaded is `failed`.
   */
  ensure(packs: readonly string[]): Promise<EnsureResult>;
  /**
   * A file of the pack's version in use ("freq.json"), parsed. Rejects with
   * `PacksUnavailableError` when the pack is not stored, or stored in a format this
   * code does not read.
   */
  read(pack: string, path: string): Promise<unknown>;
  /** Deletes a pack's version and the files no other pack refers to, and its state. */
  remove(pack: string): Promise<void>;
  /** Every stored pack, by name. */
  downloaded(): Promise<DownloadedPack[]>;
  /**
   * The state of each downloaded pack of `packs` (bundled ones are left out): as this
   * worker last wrote it, else from what is stored (a pack not yet at its lock version
   * counts as downloading: every start of the worker brings its pair's packs there).
   */
  states(packs: readonly string[]): Promise<Record<string, PackState>>;
  /**
   * Records each downloaded pack of `packs` that is not at its lock version as failed
   * with `error`, and the others as ready, then writes the state; packs downloading in
   * this worker are left as they are. For a start of the worker that leaves the
   * download to a scheduled retry: what a stopped download wrote then shows as failed.
   */
  markFailed(packs: readonly string[], error: string): Promise<void>;
  /** Calls `listener` with each pack whose version in use switched or was removed. */
  onSwitch(listener: (pack: string) => void): () => void;
}

export interface PackStoreOptions {
  db: LingoDb;
  /** The lock this build uses (`readLock()`). */
  lock: PackLock;
  fetch?: typeof globalThis.fetch;
  /** Writes the state of the packs (`packState` in `storage.local`). */
  setState(states: PackStates): Promise<void> | void;
  now?: () => number;
}

/** Progress within a file is written at most this often. */
const PROGRESS_INTERVAL_MS = 250;

const formatOf = (pack: string) => own<number>(PACK_FORMATS, pack);

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The body of a response, reporting the bytes as they come. Stops reading at more
 * than `limit` bytes: the file cannot be the one the lock lists.
 */
async function receive(
  response: Response,
  limit: number,
  onBytes: (count: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const add = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.byteLength;
    onBytes(chunk.byteLength);
  };
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      add(value);
      if (length > limit) {
        await reader.cancel();
        throw new Error("larger than the lock says");
      }
    }
  } else {
    add(new Uint8Array(await response.arrayBuffer()));
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const mirrorUrl = (template: string, entry: PackLockEntry, path: string) =>
  template
    .replaceAll("{package}", entry.package)
    .replaceAll("{version}", entry.version)
    .replaceAll("{file}", path);

export function createPackStore({
  db,
  lock,
  fetch = globalThis.fetch.bind(globalThis),
  setState,
  now = Date.now,
}: PackStoreOptions): PackStore {
  /** The state of the packs this worker brought to their lock version, or tried to. */
  const states = new Map<string, PackState>();
  /** Downloads in progress: one at a time per pack. */
  const inflight = promiseCache<boolean>({ keep: false });
  const switched = listeners<[string]>();
  let lastWrite = -Infinity;
  let writes: Promise<void> = Promise.resolve();

  const lockEntry = (pack: string) => own<PackLockEntry>(lock.packs, pack);

  /**
   * Writes the states (in order, one write at a time). Progress (`force` false) is
   * written at most every PROGRESS_INTERVAL_MS.
   */
  function publish(force: boolean) {
    const time = now();
    if (!force && time - lastWrite < PROGRESS_INTERVAL_MS) return;
    lastWrite = time;
    const snapshot: PackStates = Object.fromEntries(states);
    writes = writes
      .then(() => setState(snapshot))
      .catch((error: unknown) =>
        console.error("Lingo: could not write the pack state", error),
      );
  }

  /** Whether a stored version is the lock's (same version and format). */
  const isLockVersion = (
    stored: PackVersionRecord | undefined,
    entry: PackLockEntry,
  ) =>
    stored !== undefined &&
    stored.version === entry.version &&
    stored.format === entry.format;

  /** Which of the entry's files are stored, by SHA-256. */
  async function storedFiles(entry: PackLockEntry): Promise<Set<string>> {
    const keys = await db.packFiles
      .where("sha256")
      .anyOf(entry.files.map((file) => file.sha256))
      .primaryKeys();
    return new Set(keys);
  }

  /**
   * Deletes the files no pack version refers to, except those of downloads in
   * progress (stored files of a version not switched to yet). Runs in a transaction.
   */
  async function collectGarbage() {
    const keep = new Set<string>();
    for (const version of await db.packVersions.toArray())
      for (const file of version.files) keep.add(file.sha256);
    for (const pack of inflight.keys())
      for (const file of lockEntry(pack)?.files ?? []) keep.add(file.sha256);
    const all = await db.packFiles.toCollection().primaryKeys();
    await db.packFiles.bulkDelete(all.filter((key) => !keep.has(key)));
  }

  /**
   * A pack's state from what is stored: ready at its lock version, else downloading
   * with the bytes of its files already stored; and which of its files are stored.
   */
  async function storedState(
    pack: string,
    entry: PackLockEntry,
  ): Promise<{ state: PackState; stored: Set<string> }> {
    const [active, stored] = await Promise.all([
      db.packVersions.get(pack),
      storedFiles(entry),
    ]);
    const total = packBytes(entry);
    const missing = entry.files.filter((file) => !stored.has(file.sha256));
    if (isLockVersion(active, entry) && missing.length === 0)
      return { state: { state: "ready", received: total, total }, stored };
    // An older version in a format this code reads stays in use meanwhile.
    const updating =
      active !== undefined &&
      active.format === formatOf(pack) &&
      !isLockVersion(active, entry);
    return {
      state: {
        state: "downloading",
        received: total - packBytes({ files: missing }),
        total,
        ...(updating && { updating: true as const }),
      },
      stored,
    };
  }

  /**
   * Fetches one file from the mirrors in order until one sends the bytes the lock
   * lists. `onBytes` counts bytes received (negative: those of an attempt that failed).
   */
  async function download(
    entry: PackLockEntry,
    file: PackLockFile,
    onBytes: (count: number) => void,
  ): Promise<Blob> {
    const errors: string[] = [];
    for (const template of lock.mirrors) {
      const url = mirrorUrl(template, entry, file.path);
      let received = 0;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await receive(response, file.size, (count) => {
          received += count;
          onBytes(count);
        });
        if ((await sha256Hex(bytes)) !== file.sha256)
          throw new Error("SHA-256 does not match the lock");
        return new Blob([bytes], { type: "application/json" });
      } catch (error) {
        onBytes(-received);
        errors.push(`${url}: ${errorText(error)}`);
      }
    }
    throw new Error(
      `Could not download ${file.path} (${errors.join("; ") || "no mirrors"})`,
    );
  }

  /** Brings one pack to its lock version; true when it is there. */
  async function bring(pack: string): Promise<boolean> {
    const entry = lockEntry(pack);
    if (!entry) return false;
    if (entry.bundled) return true;
    const total = packBytes(entry);
    let received = 0;
    let updating = false;
    const set = (state: PackState["state"], error?: string) => {
      states.set(pack, {
        state,
        received,
        total,
        ...(error !== undefined && { error }),
        ...(updating && state !== "ready" && { updating: true as const }),
      });
    };
    try {
      const { state, stored } = await storedState(pack, entry);
      received = state.received;
      updating = state.updating === true;
      set(state.state);
      publish(true);
      if (state.state === "ready") return true;
      for (const file of entry.files) {
        if (stored.has(file.sha256)) continue;
        const blob = await download(entry, file, (count) => {
          received += count;
          set("downloading");
          publish(false);
        });
        await db.packFiles.put({ sha256: file.sha256, blob });
        stored.add(file.sha256);
        publish(true);
      }
      await db.transaction("rw", db.packVersions, db.packFiles, async () => {
        await db.packVersions.put({
          pack,
          version: entry.version,
          format: entry.format,
          files: entry.files.map(({ path, sha256 }) => ({ path, sha256 })),
        });
        await collectGarbage();
      });
      received = total;
      set("ready");
      publish(true);
      switched.emit(pack);
      return true;
    } catch (error) {
      set("failed", errorText(error));
      publish(true);
      return false;
    }
  }

  return {
    async ensure(packs) {
      const names = [...new Set(packs)];
      const done = await Promise.all(
        names.map((pack) => inflight.get(pack, () => bring(pack))),
      );
      await writes;
      return {
        ready: names.filter((_, i) => done[i]),
        failed: names.filter((_, i) => !done[i]),
      };
    },

    async read(pack, path) {
      // One transaction: a version switch cannot delete the file in between.
      const blob = await db.transaction(
        "r",
        db.packVersions,
        db.packFiles,
        async () => {
          const version = await db.packVersions.get(pack);
          if (!version || version.format !== formatOf(pack))
            throw new PacksUnavailableError([pack]);
          const file = version.files.find((f) => f.path === path);
          if (!file)
            throw new Error(`${pack} ${version.version} has no file ${path}`);
          const row = await db.packFiles.get(file.sha256);
          if (!row) throw new PacksUnavailableError([pack]);
          return row.blob;
        },
      );
      return JSON.parse(await blob.text()) as unknown;
    },

    async remove(pack) {
      await inflight.peek(pack);
      await db.transaction("rw", db.packVersions, db.packFiles, async () => {
        await db.packVersions.delete(pack);
        await collectGarbage();
      });
      states.delete(pack);
      publish(true);
      await writes;
      switched.emit(pack);
    },

    async downloaded() {
      // In primary key order: by pack name.
      const versions = await db.packVersions.toArray();
      return Promise.all(
        versions.map(async ({ pack, version, files }) => {
          const entry = lockEntry(pack);
          if (entry?.version === version)
            return { pack, version, size: packBytes(entry) };
          const rows = await db.packFiles.bulkGet(files.map((f) => f.sha256));
          return {
            pack,
            version,
            size: rows.reduce((sum, row) => sum + (row?.blob.size ?? 0), 0),
          };
        }),
      );
    },

    async states(packs) {
      const result: Record<string, PackState> = {};
      for (const pack of new Set(packs)) {
        const entry = lockEntry(pack);
        if (!entry || entry.bundled) continue;
        result[pack] =
          states.get(pack) ?? (await storedState(pack, entry)).state;
      }
      return result;
    },

    async markFailed(packs, error) {
      for (const pack of new Set(packs)) {
        const entry = lockEntry(pack);
        if (!entry || entry.bundled || inflight.peek(pack)) continue;
        const { state } = await storedState(pack, entry);
        states.set(
          pack,
          state.state === "ready"
            ? state
            : { ...state, state: "failed", error },
        );
      }
      publish(true);
      await writes;
    },

    onSwitch: switched.add,
  };
}

/** Reads a JSON file bundled with the extension (not web-accessible; background only). */
export async function fetchPackJson(path: string): Promise<unknown> {
  const response = await fetch(browser.runtime.getURL(path as PublicPath));
  if (!response.ok)
    throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response.json();
}

/**
 * What the pack loader reads through: a bundled pack's file from the extension, a
 * downloaded pack's from the store, which rejects with `PacksUnavailableError` while
 * that pack is not on the device.
 */
export function createPackSource({
  lock,
  store,
}: {
  lock: PackLock;
  store: Pick<PackStore, "read">;
}): FetchJson {
  return (path) => {
    const [, pack, file] = /^\/packs\/([^/]+)\/(.+)$/.exec(path) ?? [];
    if (
      pack !== undefined &&
      file !== undefined &&
      own(lock.packs, pack)?.bundled === false
    )
      return store.read(pack, file);
    return fetchPackJson(path);
  };
}
