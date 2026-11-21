/**
 * Sync through the user's own cloud storage (architecture "Sync to the user's own cloud
 * storage"): reads the other devices' files, merges them with the reference merge
 * (`core/cloud/state.ts`) over this device's copy, and writes this device's own files.
 * It knows no provider: a `CloudProvider` gives the files and the token.
 *
 * What it keeps in `storage.local` (`cloudSync`) is the connection: the provider, the
 * files read (by modified time) and written (by content), the writes still to do, and
 * the status. Tokens are the auth half's, never here.
 */
import { browser } from "wxt/browser";
import {
  encodeFile,
  decodeFile,
  filePath,
  parseFilePath,
  type CloudFile,
  type MainFile,
  type MonthFile,
} from "../../core/cloud/format";
import { sameRecord } from "../../core/cloud/merge";
import {
  CLOUD_PROVIDERS,
  CloudError,
  cloudErrorKind,
  type CloudProvider,
  type CloudProviderId,
} from "../../core/cloud/provider";
import type { FileSettings, TimedSettings } from "../../core/cloud/settings";
import {
  applyLimits,
  filesOf,
  takeMain,
  takeMonth,
  type CloudState,
  type Limits,
} from "../../core/cloud/state";
import { errorText, serial } from "../../core/util";
import type { CloudStatus } from "../../messaging/protocol";
import type { LangleDb } from "../db";
import type { DeviceId } from "../device-id";
import type { HistoryStore } from "../history-store";
import type { TermStore } from "../term-store";
import { readCopy, storeCopy } from "./cloud-copy";
import type { SyncArea } from "./browser-sync-backend";

/** `storage.local`: the connection to the user's own cloud storage (`CloudSyncState`). */
export const CLOUD_SYNC_KEY = "cloudSync";
/** The alarm that reads the other devices' files every 5 minutes. */
export const CLOUD_CHECK_ALARM = "langle-cloud-check";

/** Writes wait this long after the last local change. */
export const WRITE_DELAY_MS = 30_000;
const CHECK_PERIOD_MINUTES = 5;
/** The first retry after a network error or a 429; doubled each time, up to 10 minutes. */
const RETRY_BASE_MS = 15_000;
const MAX_RETRY_DELAY_MS = 10 * 60_000;

export interface CloudSyncState {
  provider: CloudProviderId;
  /** Other devices' files taken in: path → the modified time they had then. */
  seen: Record<string, number>;
  /** Month files with rows for terms not known yet: read again at the next check. */
  reread: string[];
  /** Other devices' files skipped (a newer `v`, or not readable): path → modified time. */
  unreadable: Record<string, number>;
  /** This device's files as last written: path → a hash of their content. */
  sent: Record<string, string>;
  /** A local change `main` has not been written with yet. */
  mainPending: boolean;
  /** Month files may have rows not sent yet (they are written when their content differs). */
  monthsPending: boolean;
  /** Whether this device's history files are in the cloud ("Also save to …" as last acted on). */
  history: boolean;
  /** This device's `main` as it last wrote it, to tell a copied browser profile. */
  ownMain?: { writtenAt: number; modifiedTime: number };
  lastSavedAt?: number;
  lastCheckedAt?: number;
  /** Every file's size, as the last list and this device's writes since had them. */
  sizes: Record<string, number>;
  /** `reconnect` stops reading and writing until `connect`; `full` stops writing. */
  error?: "reconnect" | "full" | "retrying";
}

/** The settings as cloud sync reads and merges them (`settings-store.ts`: `cloudSettings`). */
export interface CloudSettings {
  get(): Promise<TimedSettings>;
  /** Merges another device's settings into the stored ones (`mergeTimedSettings`). */
  take(incoming: FileSettings): Promise<void>;
  /** Sets the synced `cloudProvider` setting (`"none"` on disconnect). */
  choose(provider: CloudProviderId | "none"): Promise<void>;
  /** Calls `listener` after each change of the stored settings that `take` did not make. */
  watch(listener: () => void): () => void;
}

type LocalArea = Pick<SyncArea, "get" | "set" | "remove">;

interface Alarms {
  create(name: string, info: { periodInMinutes: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
  onAlarm: {
    addListener(listener: (alarm: { name: string }) => void): void;
    removeListener(listener: (alarm: { name: string }) => void): void;
  };
}

interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CloudSyncBackendOptions {
  db: LangleDb;
  store: TermStore;
  history: Pick<HistoryStore, "onChange">;
  settings: CloudSettings;
  deviceId: DeviceId;
  providers: Partial<Record<CloudProviderId, CloudProvider>>;
  /** Connecting first pulls browser sync's terms; disconnecting resumes it. */
  browserSync: { pullAll(): Promise<void> };
  /** Defaults to `browser.storage.local`. */
  local?: LocalArea;
  /** Defaults to `browser.alarms`. */
  alarms?: Alarms;
  now?: () => number;
  timers?: Timers;
  /** The merge's limits (tests make them small). */
  limits?: Limits;
}

export interface CloudSyncBackend {
  /**
   * Signs in with a window, then connects this device: browser sync's terms are pulled
   * first (unless switching from another provider), then every file is read and this
   * device's whole copy written. Connecting again to the same provider (after
   * "Reconnect needed") keeps what was read and written.
   */
  connect(provider: CloudProviderId): Promise<void>;
  /**
   * Forgets the connection and the token; browser sync takes the terms back. The synced
   * `cloudProvider` goes back to `"none"`, so devices not connected stop offering
   * "Connect … on this device too"; devices still connected keep syncing until they
   * disconnect themselves.
   */
  disconnect(): Promise<void>;
  /** Reads the other devices' changed files soon (the popup or the Word list opened). */
  requestCheck(): void;
  status(): Promise<CloudStatus>;
  /** Follows local changes and the alarm; reads at once and does pending writes. */
  start(): Promise<void>;
  stop(): void;
  /** Resolves once nothing is running or queued (timers not counted). */
  whenIdle(): Promise<void>;
}

const isState = (value: unknown): value is CloudSyncState =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CloudSyncState).provider === "string";

/** Whether this device syncs its terms through its own cloud storage (not browser sync). */
export async function cloudConnected(
  local: LocalArea = browser.storage.local,
): Promise<boolean> {
  return isState((await local.get(CLOUD_SYNC_KEY))[CLOUD_SYNC_KEY]);
}

const pathOf = (file: CloudFile) =>
  file.kind === "main"
    ? filePath(file.deviceId, "main")
    : filePath(file.deviceId, file.kind, file.month);

/** A file's content without the time it was written, as a short hash. */
async function hashOf(file: CloudFile): Promise<string> {
  const text = JSON.stringify({ ...file, writtenAt: 0 });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** Whether the rows this device recorded are the same in both states. */
function sameOwnRows(a: CloudState, b: CloudState, device: string) {
  const same = <T extends { deviceId: string }>(
    x: Map<string, T>,
    y: Map<string, T>,
  ) => {
    const own = (m: Map<string, T>) =>
      [...m].filter(([, row]) => row.deviceId === device);
    const ours = own(x);
    const theirs = own(y);
    return (
      ours.length === theirs.length &&
      ours.every(([key, row]) => sameRecord(y.get(key), row))
    );
  };
  return same(a.occurrences, b.occurrences) && same(a.sentences, b.sentences);
}

const fresh = (
  provider: CloudProviderId,
  history: boolean,
): CloudSyncState => ({
  provider,
  seen: {},
  reread: [],
  unreadable: {},
  sent: {},
  mainPending: true,
  monthsPending: true,
  history,
  sizes: {},
});

/** The entries of `record` whose path passes `keep`. */
function only<T>(
  record: Record<string, T>,
  keep: (path: string) => boolean,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([path]) => keep(path)),
  );
}

export function createCloudSyncBackend({
  db,
  store,
  history,
  settings,
  deviceId,
  providers,
  browserSync,
  local = browser.storage.local,
  alarms = browser.alarms,
  now = Date.now,
  timers = globalThis,
  limits = {},
}: CloudSyncBackendOptions): CloudSyncBackend {
  const queue = serial((error: unknown) => console.error(error));
  const enqueue = <T>(op: () => Promise<T>) => queue.run(op);

  let state: CloudSyncState | undefined;
  let loaded: Promise<void> | undefined;
  /** Counts local changes, so a write clears only the pending flags it covered. */
  let generation = 0;
  let failures = 0;
  let writeTimer: unknown;
  let retryTimer: unknown;
  let checkQueued = false;
  let started = false;
  let unsubscribe: (() => void) | undefined;

  const load = () =>
    (loaded ??= local.get(CLOUD_SYNC_KEY).then(
      (stored) => {
        const value = stored[CLOUD_SYNC_KEY];
        state = isState(value) ? value : undefined;
      },
      (error: unknown) => {
        loaded = undefined;
        throw error;
      },
    ));

  const persist = () =>
    state
      ? local.set({ [CLOUD_SYNC_KEY]: state })
      : local.remove(CLOUD_SYNC_KEY);

  const providerOf = (s: CloudSyncState) => {
    const provider = providers[s.provider];
    if (!provider) throw new Error(`No provider ${s.provider}`);
    return provider;
  };

  /** Runs `op` with a token; a 401 renews it once without a window. */
  async function withToken<T>(
    provider: CloudProvider,
    op: (token: string) => Promise<T>,
  ): Promise<T> {
    const token = await provider.auth.token({ interactive: false });
    try {
      return await op(token);
    } catch (error) {
      if (cloudErrorKind(error) !== "unauthorized") throw error;
      return op(
        await provider.auth.token({ interactive: false, refused: token }),
      );
    }
  }

  function scheduleWrite(delay = WRITE_DELAY_MS) {
    if (!started) return;
    timers.clearTimeout(writeTimer);
    writeTimer = timers.setTimeout(() => {
      writeTimer = undefined;
      void enqueue(save);
    }, delay);
  }

  function scheduleRetry(retryAfterMs = 0) {
    if (!started) return;
    failures++;
    const delay = Math.min(
      Math.max(RETRY_BASE_MS * 2 ** (failures - 1), retryAfterMs),
      MAX_RETRY_DELAY_MS,
    );
    timers.clearTimeout(retryTimer);
    retryTimer = timers.setTimeout(() => {
      retryTimer = undefined;
      void enqueue(async () => {
        if (await check()) await save();
      });
    }, delay);
  }

  /** Keeps the failure in the status; network errors and 429s are tried again later. */
  function failed(s: CloudSyncState, error: unknown) {
    const kind = cloudErrorKind(error);
    if (kind === "unauthorized") s.error = "reconnect";
    else if (kind === "full") s.error = "full";
    else {
      if (s.error === undefined) s.error = "retrying";
      scheduleRetry(error instanceof CloudError ? error.retryAfterMs : 0);
      if (kind !== "retry") console.error(errorText(error));
    }
  }

  function succeeded(s: CloudSyncState) {
    if (s.error === "retrying") delete s.error;
    failures = 0;
    timers.clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  /** Takes in the files read: every `main`, then the month files. */
  async function merge(
    device: string,
    files: { path: string; file: CloudFile }[],
  ) {
    const byPath = (a: { path: string }, b: { path: string }) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    const mains = files
      .filter(
        (f): f is { path: string; file: MainFile } => f.file.kind === "main",
      )
      .sort(byPath);
    const months = files
      .filter(
        (f): f is { path: string; file: MonthFile } => f.file.kind !== "main",
      )
      .sort(byPath);
    const waiting: string[] = [];
    let ownRowsChanged = false;
    await store.applyCloud(async (changed) => {
      const copy = await readCopy(db);
      const after = structuredClone(copy.state);
      for (const { file } of mains) takeMain(after, file);
      for (const { path, file } of months)
        if (!takeMonth(after, file)) waiting.push(path);
      applyLimits(after, limits);
      await storeCopy(db, copy, after, changed);
      ownRowsChanged = !sameOwnRows(copy.state, after, device);
    });
    for (const { file } of mains) await settings.take(file.settings);
    return { waiting, ownRowsChanged };
  }

  /** Lists the files and takes in the changed ones. False when it failed. */
  async function check(): Promise<boolean> {
    const s = state;
    if (!s || s.error === "reconnect") return false;
    const provider = providerOf(s);
    const historyOn = (await settings.get()).values.cloudHistory;
    try {
      await withToken(provider, async (token) => {
        const listed = await provider.files.list(token);
        let device = await deviceId();
        s.sizes = Object.fromEntries(listed.map((f) => [f.path, f.size]));

        // This device's main written by someone else since its last write: a copied
        // browser profile. The copy that sees it takes a new id and a new folder.
        const ownMain = listed.find((f) => f.path === filePath(device, "main"));
        if (
          ownMain &&
          s.ownMain &&
          ownMain.modifiedTime !== s.ownMain.modifiedTime
        ) {
          const decoded = await decodeFile(
            await provider.files.read(token, ownMain.path),
          );
          if (
            decoded.status !== "ok" ||
            decoded.file.writtenAt !== s.ownMain.writtenAt
          ) {
            device = await deviceId.renew();
            s.sent = {};
            delete s.ownMain;
            s.mainPending = true;
            s.monthsPending = true;
          } else s.ownMain.modifiedTime = ownMain.modifiedTime;
        }

        const present = new Set(listed.map((f) => f.path));
        s.seen = only(s.seen, (path) => present.has(path));
        s.unreadable = only(s.unreadable, (path) => present.has(path));
        const reread = new Set(s.reread.filter((path) => present.has(path)));

        const changed = listed.filter((f) => {
          const parsed = parseFilePath(f.path);
          if (!parsed || parsed.deviceId === device) return false;
          if (parsed.kind === "history" && !historyOn) return false;
          if (s.unreadable[f.path] === f.modifiedTime) return false;
          return s.seen[f.path] !== f.modifiedTime || reread.has(f.path);
        });
        const read: { path: string; file: CloudFile; modifiedTime: number }[] =
          [];
        for (const info of changed) {
          let bytes: Uint8Array;
          try {
            bytes = await provider.files.read(token, info.path);
          } catch (error) {
            if (cloudErrorKind(error) === "notFound") continue;
            throw error;
          }
          const decoded = await decodeFile(bytes);
          if (decoded.status === "ok") {
            read.push({ ...info, file: decoded.file });
            s.unreadable = only(s.unreadable, (path) => path !== info.path);
          } else {
            s.unreadable[info.path] = info.modifiedTime;
            s.seen = only(s.seen, (path) => path !== info.path);
          }
        }

        if (read.length > 0) {
          const { waiting, ownRowsChanged } = await merge(device, read);
          for (const { path, modifiedTime } of read)
            s.seen[path] = modifiedTime;
          for (const path of read.map((r) => r.path)) reread.delete(path);
          for (const path of waiting) reread.add(path);
          if (ownRowsChanged) {
            s.monthsPending = true;
            scheduleWrite();
          }
        }
        s.reread = [...reread];
        s.lastCheckedAt = now();
      });
      succeeded(s);
    } catch (error) {
      failed(s, error);
      await persist();
      return false;
    }
    if ((await settings.get()).values.cloudHistory !== s.history)
      scheduleWrite(0);
    await persist();
    return true;
  }

  async function save() {
    const s = state;
    if (!s || s.error === "reconnect") return;
    const timed = await settings.get();
    const historyOn = timed.values.cloudHistory;
    const switched = historyOn !== s.history;
    if (!s.mainPending && !s.monthsPending && !switched) return;
    const provider = providerOf(s);
    const covered = generation;
    const device = await deviceId();
    const copy = await db.transaction(
      "r",
      [
        db.terms,
        db.sources,
        db.occurrences,
        db.meanings,
        db.meaningChoices,
        db.historyPages,
        db.historySentences,
        db.historyForgotten,
        db.meta,
      ],
      () => readCopy(db),
    );
    copy.state.settings = timed;
    const at = now();
    const files = filesOf(copy.state, device, at, Object.keys(s.sent));

    const writes: { path: string; file: CloudFile; hash: string }[] = [];
    let main: { path: string; file: CloudFile; hash: string } | undefined;
    for (const file of files) {
      const path = pathOf(file);
      if (file.kind === "history" && !historyOn) continue;
      const hash = await hashOf(file);
      if (file.kind === "main") {
        if (s.mainPending) main = { path, file, hash };
      } else if ((s.monthsPending || switched) && s.sent[path] !== hash)
        writes.push({ path, file, hash });
    }
    // Months first, so a device that reads the new main finds its rows' files.
    if (main) writes.push(main);
    const removals = historyOn
      ? []
      : Object.keys(s.sent).filter(
          (path) => parseFilePath(path)?.kind === "history",
        );

    try {
      await withToken(provider, async (token) => {
        for (const { path, file, hash } of writes) {
          if (s.sent[path] === hash && file.kind !== "main") continue;
          const info = await provider.files.write(
            token,
            path,
            await encodeFile(file),
          );
          s.sent[path] = hash;
          s.sizes[path] = info.size;
          if (file.kind === "main")
            s.ownMain = { writtenAt: at, modifiedTime: info.modifiedTime };
          await persist();
        }
        for (const path of removals) {
          try {
            await provider.files.remove(token, path);
          } catch (error) {
            if (cloudErrorKind(error) !== "notFound") throw error;
          }
          s.sent = only(s.sent, (p) => p !== path);
          s.sizes = only(s.sizes, (p) => p !== path);
        }
      });
      if (covered === generation) {
        s.mainPending = false;
        s.monthsPending = false;
      }
      s.history = historyOn;
      s.lastSavedAt = at;
      if (s.error === "full") delete s.error;
      succeeded(s);
    } catch (error) {
      failed(s, error);
    }
    await persist();
  }

  /** A local change: `main`, month files or both have something new to write. */
  function pending(main: boolean, months: boolean) {
    generation++;
    void load()
      .then(async () => {
        const s = state;
        if (!s) return;
        const flags = [s.mainPending, s.monthsPending];
        s.mainPending ||= main;
        s.monthsPending ||= months;
        if (flags[0] !== s.mainPending || flags[1] !== s.monthsPending)
          await persist();
        scheduleWrite();
      })
      .catch((error: unknown) => console.error(error));
  }

  function requestCheck() {
    if (checkQueued) return;
    checkQueued = true;
    void enqueue(async () => {
      checkQueued = false;
      await load();
      await check();
    });
  }

  const onAlarm = (alarm: { name: string }) => {
    if (alarm.name === CLOUD_CHECK_ALARM) requestCheck();
  };

  function cancelTimers() {
    timers.clearTimeout(writeTimer);
    timers.clearTimeout(retryTimer);
    writeTimer = retryTimer = undefined;
    failures = 0;
  }

  return {
    connect(id) {
      const provider = providers[id];
      if (!provider) return Promise.reject(new Error(`No provider ${id}`));
      return enqueue(async () => {
        await provider.auth.token({ interactive: true });
        await load();
        const { values } = await settings.get();
        if (state?.provider === id) delete state.error;
        else {
          // From browser sync: its terms come into IndexedDB first. Switching from
          // another provider: the whole copy goes to the new one.
          if (!state) await browserSync.pullAll();
          state = fresh(id, values.cloudHistory);
          await persist();
        }
        // Also when reconnecting: another device's disconnect may have cleared it.
        if (values.cloudProvider !== id) await settings.choose(id);
        await alarms.create(CLOUD_CHECK_ALARM, {
          periodInMinutes: CHECK_PERIOD_MINUTES,
        });
        await check();
        await save();
      });
    },

    disconnect() {
      return enqueue(async () => {
        await load();
        const s = state;
        if (!s) return;
        cancelTimers();
        await alarms.clear(CLOUD_CHECK_ALARM);
        state = undefined;
        await persist();
        await providers[s.provider]?.auth.forget();
        await settings.choose("none");
        await browserSync.pullAll();
      });
    },

    requestCheck,

    async status() {
      await load();
      const s = state;
      const available = CLOUD_PROVIDERS.filter((id) => providers[id]);
      if (!s) return { available, bytes: 0, devices: 0 };
      const paths = Object.keys(s.sizes);
      const status: CloudStatus = {
        available,
        provider: s.provider,
        bytes: Object.values(s.sizes).reduce((sum, size) => sum + size, 0),
        devices: new Set(paths.map((path) => parseFilePath(path)?.deviceId))
          .size,
      };
      if (s.lastSavedAt !== undefined) status.lastSavedAt = s.lastSavedAt;
      if (s.lastCheckedAt !== undefined) status.lastCheckedAt = s.lastCheckedAt;
      // The most pressing first: a newer file waits for an update, a retry does not.
      const update = Object.keys(s.unreadable).length > 0;
      const error =
        s.error === "reconnect" || s.error === "full"
          ? s.error
          : update
            ? "update"
            : s.error;
      if (error !== undefined) status.error = error;
      return status;
    },

    async start() {
      if (started) return;
      started = true;
      // Registered before anything is awaited, so an alarm that woke the worker is heard.
      alarms.onAlarm.addListener(onAlarm);
      const unsubscribers = [
        store.onChange((_lang, _kind, origin) => {
          // A term change may bring rows too (saving records the sentence).
          if (origin === "local") pending(true, true);
        }),
        history.onChange((kind) => pending(kind === "forgotten", true)),
        settings.watch(() => pending(true, false)),
      ];
      unsubscribe = () => {
        alarms.onAlarm.removeListener(onAlarm);
        for (const off of unsubscribers) off();
      };
      await enqueue(async () => {
        await load();
        if (!state) return;
        await alarms.create(CLOUD_CHECK_ALARM, {
          periodInMinutes: CHECK_PERIOD_MINUTES,
        });
        await check();
        // Writes left from before (the worker stopped first) are done now.
        await save();
      });
    },

    stop() {
      if (!started) return;
      started = false;
      unsubscribe?.();
      cancelTimers();
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
