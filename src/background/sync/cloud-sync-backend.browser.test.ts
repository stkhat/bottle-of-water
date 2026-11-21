import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filePath, parseFilePath } from "../../core/cloud/format";
import {
  mergeTimedSettings,
  stampSettings,
  type TimedSettings,
} from "../../core/cloud/settings";
import { gzip, decode } from "../../core/sync/codec";
import { metaKey, chunkKey, type SyncMeta } from "../../core/sync/layout";
import { snapshot } from "../../testing/cloud-devices";
import {
  createFakeCloud,
  type FakeAccount,
  type FakeCloud,
} from "../../testing/cloud-provider";
import { freshDb } from "../../testing/db";
import { ARTICLE } from "../../testing/sources";
import { createFakeSyncArea, type FakeSyncArea } from "../../testing/sync-area";
import { manualTimers } from "../../testing/timers";
import { mergeSettings, type SettingsPatch } from "../../core/settings";
import type { TermStatus } from "../../core/classify";
import type { LangleDb } from "../db";
import type { DeviceId } from "../device-id";
import { createHistoryStore, type HistoryStore } from "../history-store";
import { createTermStore, type TermStore } from "../term-store";
import {
  createBrowserSyncBackend,
  type BrowserSyncBackend,
} from "./browser-sync-backend";
import { readCopy } from "./cloud-copy";
import {
  CLOUD_CHECK_ALARM,
  CLOUD_SYNC_KEY,
  cloudConnected,
  createCloudSyncBackend,
  WRITE_DELAY_MS,
  type CloudSettings,
  type CloudSyncBackend,
  type CloudSyncState,
} from "./cloud-sync-backend";

let time: number;
let running: { stop(): void }[];

beforeEach(() => {
  time = Date.UTC(2026, 10, 21, 9);
  running = [];
});

afterEach(() => {
  for (const r of running) r.stop();
});

/** Settings kept in memory with their field times, as `settings-store.ts` keeps them. */
function memorySettings() {
  let timed: TimedSettings = { values: mergeSettings({}), times: {} };
  const watchers = new Set<() => void>();
  const settings: CloudSettings & {
    change(patch: SettingsPatch): void;
    values(): TimedSettings["values"];
  } = {
    get: async () => structuredClone(timed),
    take: async (incoming) => {
      timed = mergeTimedSettings(timed, incoming);
    },
    choose: async (provider) => settings.change({ cloudProvider: provider }),
    watch(listener) {
      watchers.add(listener);
      return () => watchers.delete(listener);
    },
    change(patch) {
      timed = stampSettings(mergeSettings(patch, timed.values), time, timed);
      for (const listener of watchers) listener();
    },
    values: () => timed.values,
  };
  return settings;
}

function fakeAlarms() {
  const listeners = new Set<(alarm: { name: string }) => void>();
  const set = new Set<string>();
  return {
    set,
    async create(name: string) {
      set.add(name);
    },
    async clear(name: string) {
      return set.delete(name);
    },
    onAlarm: {
      addListener: (l: (alarm: { name: string }) => void) => listeners.add(l),
      removeListener: (l: (alarm: { name: string }) => void) =>
        listeners.delete(l),
    },
    fire(name: string) {
      for (const l of listeners) l({ name });
    },
  };
}

function fakeDeviceId(initial: string): DeviceId {
  let id = initial;
  let renewals = 0;
  const get = async () => id;
  get.renew = async () => (id = `${initial}-${++renewals}`);
  return get;
}

interface Device {
  db: LangleDb;
  store: TermStore;
  history: HistoryStore;
  settings: ReturnType<typeof memorySettings>;
  ids: DeviceId;
  local: FakeSyncArea;
  alarms: ReturnType<typeof fakeAlarms>;
  timers: ReturnType<typeof manualTimers>;
  account: FakeAccount;
  browserSync: BrowserSyncBackend;
  backend: CloudSyncBackend;
  /** Lets listeners run, advances this device's timers by `ms`, then waits for its work. */
  after(ms?: number): Promise<void>;
  /** The data as plain values, for comparing devices. */
  data(): Promise<ReturnType<typeof snapshot>>;
  state(): Promise<CloudSyncState | undefined>;
}

/** Lets promise chains and storage writes started by listeners run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface DeviceOptions {
  id: string;
  cloud: FakeCloud;
  /** Browser sync's `storage.sync`, shared by devices on the same browser account. */
  area?: FakeSyncArea;
  /** Another device's `storage.local` and database, as a copied browser profile has. */
  copyOf?: Device;
}

function device({
  id,
  cloud,
  area = createFakeSyncArea(),
  copyOf,
}: DeviceOptions): Device {
  const db = freshDb();
  const ids = fakeDeviceId(id);
  const now = () => time;
  const store = createTermStore(db, { now, deviceId: ids });
  const history = createHistoryStore(db, { now, deviceId: ids });
  const settings = memorySettings();
  const local = createFakeSyncArea({
    quotaBytes: 1e9,
    quotaBytesPerItem: 1e9,
  });
  if (copyOf)
    for (const [k, v] of copyOf.local.data)
      local.data.set(k, structuredClone(v));
  const alarms = fakeAlarms();
  const timers = manualTimers();
  const account = cloud.account();
  const browserSync = createBrowserSyncBackend({
    store,
    area,
    onChanged: area.onChanged,
    now,
    timers,
    termsInCloud: () => cloudConnected(local),
  });
  const backend = createCloudSyncBackend({
    db,
    store,
    history,
    settings,
    deviceId: ids,
    providers: { googleDrive: cloud.provider(account) },
    browserSync,
    local,
    alarms,
    now,
    timers,
  });
  running.push(backend, browserSync);
  const self: Device = {
    db,
    store,
    history,
    settings,
    ids,
    local,
    alarms,
    timers,
    account,
    browserSync,
    backend,
    async after(ms = 0) {
      for (let round = 0; round < 3; round++) {
        await settle();
        timers.advance(round === 0 ? ms : 0);
        await backend.whenIdle();
        await browserSync.whenIdle();
      }
    },
    async data() {
      const { state } = await db.transaction(
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
      state.settings = await settings.get();
      return snapshot(state);
    },
    async state() {
      return (await local.get(CLOUD_SYNC_KEY))[CLOUD_SYNC_KEY] as
        CloudSyncState | undefined;
    },
  };
  return self;
}

async function startAll(...devices: Device[]) {
  for (const d of devices) await d.backend.start();
}

const save = (
  d: Device,
  key: string,
  status: TermStatus = "learning",
  sentence = `About ${key}.`,
) =>
  d.store.saveTerm({
    lang: "en",
    key,
    display: key,
    kind: key.includes(" ") ? "phrase" : "word",
    status,
    source: ARTICLE,
    sentence,
    pos: { textQuote: sentence },
  });

const keysOf = async (d: Device) =>
  (await d.store.listTerms("en")).map((t) => `${t.key}:${t.status}`);

/** The data without settings: devices on separate fakes merge settings the same way. */
async function sameData(a: Device, b: Device) {
  const [x, y] = await Promise.all([a.data(), b.data()]);
  expect({ ...x, settings: undefined }).toEqual({ ...y, settings: undefined });
}

const writesOf = (cloud: FakeCloud, folder: string) =>
  cloud.log.filter(
    (e) => e.op === "write" && parseFilePath(e.path!)?.deviceId === folder,
  ).length;

describe("CloudSyncBackend: two devices", () => {
  it("merges terms, occurrences and settings across devices", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    a.settings.change({ knownLevel: 5000 });
    await a.backend.connect("googleDrive");
    await save(b, "knead", "known");
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["knead:known", "loaf:learning"]);
    expect(b.settings.values().knownLevel).toBe(5000);
    expect(b.settings.values().cloudProvider).toBe("googleDrive");

    a.backend.requestCheck();
    await a.after();
    expect(await keysOf(a)).toEqual(["knead:known", "loaf:learning"]);
    await sameData(a, b);
    expect(cloud.paths()).toEqual([
      "devices/dev-a/main.json.gz",
      "devices/dev-a/occurrences-2026-11.json.gz",
      "devices/dev-b/main.json.gz",
      "devices/dev-b/occurrences-2026-11.json.gz",
    ]);
    expect(await a.backend.status()).toMatchObject({
      provider: "googleDrive",
      devices: 2,
      lastSavedAt: time,
      lastCheckedAt: time,
    });
    expect((await a.backend.status()).bytes).toBeGreaterThan(0);
  });

  it("writes 30 s after the last local change, main only after a local one", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    const before = writesOf(cloud, "dev-a");

    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS - 1000);
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS - 1000);
    expect(writesOf(cloud, "dev-a")).toBe(before);
    await a.after(1000);
    // The month file, then main.
    expect(writesOf(cloud, "dev-a")).toBe(before + 2);

    // Taking in another device's change writes nothing.
    const bWrites = writesOf(cloud, "dev-b");
    b.alarms.fire(CLOUD_CHECK_ALARM);
    await b.after(WRITE_DELAY_MS);
    expect(await keysOf(b)).toEqual(["loaf:learning", "rise:learning"]);
    expect(writesOf(cloud, "dev-b")).toBe(bWrites);
  });

  it("lists first and downloads only the files whose modified time changed", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    const reads = () => cloud.log.filter((e) => e.op === "read").length;
    const before = reads();
    b.backend.requestCheck();
    await b.after();
    expect(reads()).toBe(before);

    await a.store.setStatus("en:loaf", "known");
    await a.after(WRITE_DELAY_MS);
    b.backend.requestCheck();
    await b.after();
    // Only a's main changed (no new row).
    expect(reads()).toBe(before + 1);
    expect(await keysOf(b)).toEqual(["loaf:known"]);
  });

  it("does the writes left from before at the next start", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    await save(a, "loaf");
    await a.after();
    expect((await a.state())?.mainPending).toBe(true);
    a.backend.stop();

    // The worker starts again over the same storage and database.
    const again = createCloudSyncBackend({
      db: a.db,
      store: a.store,
      history: a.history,
      settings: a.settings,
      deviceId: a.ids,
      providers: { googleDrive: cloud.provider(a.account) },
      browserSync: a.browserSync,
      local: a.local,
      alarms: a.alarms,
      now: () => time,
      timers: a.timers,
    });
    running.push(again);
    await again.start();
    expect((await a.state())?.mainPending).toBe(false);
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
  });

  it("reads a month file before its main, and takes its rows once the main comes", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);

    // b lists while a's new main is not there yet: only the month file.
    const main = filePath("dev-a", "main");
    const newMain = cloud.stored.get(main)!;
    cloud.stored.delete(main);
    b.backend.requestCheck();
    await b.after();
    expect(await keysOf(b)).toEqual([]);
    expect((await b.state())?.reread).toEqual([
      "devices/dev-a/occurrences-2026-11.json.gz",
    ]);

    cloud.stored.set(main, newMain);
    b.backend.requestCheck();
    await b.after();
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
    expect(
      (await b.store.occurrencesOf("en:loaf")).map((o) => o.sentence),
    ).toEqual(["About loaf."]);
    expect((await b.state())?.reread).toEqual([]);
  });

  it("starts a new folder when its main was written by a copied profile", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");

    // A copy of a's browser profile: the same storage.local (device id, connection).
    const copy = device({ id: "dev-a", cloud, copyOf: a });
    // The copied profile is signed in as well.
    await copy.account.token({ interactive: true });
    await startAll(copy);
    time += 60_000;
    await save(copy, "rise");
    await copy.after(WRITE_DELAY_MS);

    a.backend.requestCheck();
    await a.after();
    expect(await a.ids()).not.toBe("dev-a");
    await a.after(WRITE_DELAY_MS);
    expect(
      new Set(cloud.paths().map((p) => parseFilePath(p)!.deviceId)),
    ).toEqual(new Set(["dev-a", await a.ids()]));
    expect(await keysOf(a)).toEqual(["loaf:learning", "rise:learning"]);

    copy.backend.requestCheck();
    await copy.after();
    expect(await copy.ids()).toBe("dev-a");
    expect(await keysOf(copy)).toEqual(["loaf:learning", "rise:learning"]);
  });
});

describe("CloudSyncBackend: browser sync", () => {
  async function syncedKeys(area: FakeSyncArea) {
    const meta = area.data.get(metaKey("en")) as SyncMeta | undefined;
    if (!meta) return [];
    const chunks = Array.from(
      { length: meta.chunks },
      (_, i) => area.data.get(chunkKey("en", i)) as string,
    );
    return (await decode(chunks)).map((r) => r.key);
  }

  it("pulls browser sync's terms when connecting, stops while connected, and resumes after", async () => {
    const cloud = createFakeCloud();
    const area = createFakeSyncArea();
    const other = device({ id: "dev-other", cloud, area });
    const a = device({ id: "dev-a", cloud, area });
    await other.browserSync.start();
    await a.browserSync.start();
    await startAll(a);
    await save(other, "knead");
    await other.after(5_000);
    expect(await syncedKeys(area)).toEqual(["knead"]);

    await a.backend.connect("googleDrive");
    expect(await keysOf(a)).toEqual(["knead:learning"]);
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["knead:learning"]);

    // While connected, terms are not written to storage.sync.
    time += 60_000;
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect(await syncedKeys(area)).toEqual(["knead"]);
    expect((await a.browserSync.status()).termsInCloud).toBe(true);

    await a.backend.disconnect();
    await a.after(5_000);
    expect(await syncedKeys(area)).toEqual(["knead", "loaf"]);
    expect(await a.state()).toBeUndefined();
    expect(await a.backend.status()).toEqual({ bytes: 0, devices: 0 });
    expect(a.alarms.set.has(CLOUD_CHECK_ALARM)).toBe(false);
    expect((await a.browserSync.status()).termsInCloud).toBe(false);
  });
});

describe("CloudSyncBackend: errors", () => {
  it("renews a refused token without a window, and asks to reconnect when it cannot", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");

    a.account.expire();
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBeUndefined();
    expect((await a.state())?.mainPending).toBe(false);

    a.account.expire();
    a.account.silent = false;
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBe("reconnect");
    // Changes keep collecting on the device.
    expect(await keysOf(a)).toEqual(["loaf:learning", "rise:learning"]);
    expect((await a.state())?.mainPending).toBe(true);

    a.account.silent = true;
    await a.backend.connect("googleDrive");
    expect((await a.backend.status()).error).toBeUndefined();
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning", "rise:learning"]);
  });

  it("retries a rate limit with backoff", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    cloud.failNext("retry", { ops: ["write"], retryAfterMs: 20_000 });
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBe("retrying");
    expect(a.timers.next()).toBe(20_000);

    cloud.failNext("retry", { ops: ["list"] });
    await a.after(20_000);
    expect((await a.backend.status()).error).toBe("retrying");
    // Doubled, and never more than 10 minutes.
    expect(a.timers.next()).toBe(30_000);
    await a.after(30_000);
    expect((await a.backend.status()).error).toBeUndefined();
    expect((await a.state())?.mainPending).toBe(false);
  });

  it("stops writing while the storage is full, and loses nothing", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    cloud.failNext("full", { ops: ["write"] });
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBe("full");
    expect(a.timers.next()).toBeUndefined();
    expect(await keysOf(a)).toEqual(["loaf:learning"]);

    // The next change tries again.
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBeUndefined();
  });

  it("skips another device's file of a newer version and asks for an update", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");
    const newer = await gzip(
      JSON.stringify({
        format: "langle-cloud",
        v: 2,
        kind: "main",
        deviceId: "dev-new",
        writtenAt: time,
      }),
    );
    cloud.stored.set(filePath("dev-new", "main"), {
      bytes: newer,
      modifiedTime: 1,
    });
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
    expect(await b.backend.status()).toMatchObject({
      error: "update",
      devices: 3,
    });
    const reads = cloud.log.filter((e) => e.op === "read").length;
    b.backend.requestCheck();
    await b.after();
    expect(cloud.log.filter((e) => e.op === "read").length).toBe(reads);
  });
});

describe("CloudSyncBackend: sentence history", () => {
  const record = (d: Device, text: string) =>
    d.history.record(ARTICLE, [
      { text, pos: { textQuote: text }, keys: ["en:loaf"] },
    ]);

  it("sends history while “Also save to” is on; off removes only its own history files", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await record(a, "A loaf of bread.");
    await a.backend.connect("googleDrive");
    await record(b, "Bake a loaf.");
    await b.backend.connect("googleDrive");
    a.backend.requestCheck();
    await a.after();
    await sameData(a, b);
    expect(cloud.paths()).toContain("devices/dev-a/history-2026-11.json.gz");

    a.settings.change({ cloudHistory: false });
    await a.after(WRITE_DELAY_MS);
    expect(cloud.paths()).not.toContain(
      "devices/dev-a/history-2026-11.json.gz",
    );
    expect(cloud.paths()).toContain("devices/dev-b/history-2026-11.json.gz");

    // On again: the whole kept history is sent again.
    a.settings.change({ cloudHistory: true });
    await a.after(WRITE_DELAY_MS);
    expect(cloud.paths()).toContain("devices/dev-a/history-2026-11.json.gz");
  });
});

describe("cloudConnected", () => {
  it("is true only while a connection is kept", async () => {
    const local = createFakeSyncArea();
    expect(await cloudConnected(local)).toBe(false);
    await local.set({ [CLOUD_SYNC_KEY]: { provider: "googleDrive" } });
    expect(await cloudConnected(local)).toBe(true);
  });
});
