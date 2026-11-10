import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { decode, toMinutes, type SyncRecord } from "../../core/sync/codec";
import {
  chunkKey,
  itemBytes,
  metaKey,
  type SyncMeta,
} from "../../core/sync/layout";
import { openLingoDb, type LingoDb } from "../db";
import type { TermStatus } from "../../core/classify";
import {
  createTermStore,
  type SourceInput,
  type TermStore,
} from "../term-store";
import {
  createBrowserSyncBackend,
  type BrowserSyncBackend,
} from "./browser-sync-backend";
import { createFakeSyncArea, type FakeSyncArea } from "./fake-sync-area";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SOURCE: SourceInput = {
  platform: "web",
  url: "https://example.com/bread",
  title: "Bread",
  lang: "en",
};

let time: number;
let dbs: LingoDb[];
let backends: BrowserSyncBackend[];

beforeEach(() => {
  time = Date.UTC(2026, 10, 9);
  dbs = [];
  backends = [];
});

afterEach(async () => {
  for (const backend of backends) backend.stop();
  await Promise.all(dbs.map((db) => db.delete()));
});

/** setTimeout/clearTimeout driven by `advance`, so debounce and backoff run on demand. */
function manualTimers() {
  let clock = 0;
  let nextId = 0;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout(run: () => void, ms: number) {
      pending.set(++nextId, { at: clock + ms, run });
      return nextId;
    },
    clearTimeout(id: unknown) {
      pending.delete(id as number);
    },
    advance(ms: number) {
      clock += ms;
      const due = [...pending]
        .filter(([, t]) => t.at <= clock)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of due) {
        pending.delete(id);
        t.run();
      }
    },
  };
}

interface Device {
  store: TermStore;
  backend: BrowserSyncBackend;
  timers: ReturnType<typeof manualTimers>;
  /** Advances this device's timers by `ms`, then waits for both devices' work. */
  after(ms: number, ...others: Device[]): Promise<void>;
}

/** A simulated device: its own database, sharing the given sync area. */
function device(area: FakeSyncArea): Device {
  const db = openLingoDb(`lingo-sync-test-${crypto.randomUUID()}`);
  dbs.push(db);
  const store = createTermStore(db, { now: () => time });
  const timers = manualTimers();
  const backend = createBrowserSyncBackend({
    store,
    area,
    onChanged: area.onChanged,
    now: () => time,
    timers,
  });
  backends.push(backend);
  const self: Device = {
    store,
    backend,
    timers,
    async after(ms, ...others) {
      timers.advance(ms);
      await idle(self, ...others);
    },
  };
  return self;
}

/** Waits until no device has sync work running or queued (one may start another's). */
async function idle(...devices: Device[]) {
  for (let round = 0; round < 3; round++)
    for (const d of devices) await d.backend.whenIdle();
}

const save = (store: TermStore, key: string, status: TermStatus = "learning") =>
  store.saveTerm({
    lang: "en",
    key,
    display: key,
    kind: key.includes(" ") ? "phrase" : "word",
    status,
    source: SOURCE,
    sentence: `About ${key}.`,
    pos: { textQuote: key },
  });

/** Pseudo-random, hard-to-compress keys. */
const words = (n: number, from = 0) =>
  Array.from(
    { length: n },
    (_, i) => `w${(((from + i + 1) * 2654435761) >>> 0).toString(36)}`,
  );

const metaOf = (area: FakeSyncArea, lang = "en") =>
  area.data.get(metaKey(lang)) as SyncMeta | undefined;

async function remote(area: FakeSyncArea, lang = "en"): Promise<SyncRecord[]> {
  const meta = metaOf(area, lang);
  if (!meta) return [];
  const chunks = Array.from(
    { length: meta.chunks },
    (_, i) => area.data.get(chunkKey(lang, i)) as string,
  );
  return decode(chunks);
}

const remoteKeys = async (area: FakeSyncArea) =>
  (await remote(area)).map((r) => r.key);

const versions = async (store: TermStore) =>
  (await store.listTerms("en", { includeRemoved: true })).map((t) => [
    t.key,
    t.status,
    toMinutes(t.updatedAt),
  ]);

const chunkKeysIn = (area: FakeSyncArea) =>
  [...area.data.keys()].filter((k) => /^sync:en:\d+$/.test(k));

const writes = (area: FakeSyncArea) =>
  area.log.filter((e) => e.keys.includes(metaKey("en"))).length;

describe("push", () => {
  it("writes the terms and removals as chunks plus a meta, and records the time", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "dough");
    await save(a.store, "bread", "known");
    await save(a.store, "crust");
    time += MIN;
    await a.store.removeTerm("en:crust");
    time += MIN;
    await a.backend.push("en");

    expect(metaOf(area)).toEqual({ chunks: 1, updatedAt: time, v: 1 });
    const minute = toMinutes(time);
    expect(await remote(area)).toEqual([
      { key: "bread", status: "known", updatedMinutes: minute - 2 },
      { key: "crust", status: "removed", updatedMinutes: minute - 1 },
      { key: "dough", status: "learning", updatedMinutes: minute - 2 },
    ]);
    expect(await a.store.getMeta("lastSavedAt")).toBe(time);
  });

  it("leaves out removals older than 90 days", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "crust");
    await save(a.store, "bread");
    await a.store.removeTerm("en:crust");
    time += 2 * DAY;
    await a.store.removeTerm("en:bread");
    time += 89 * DAY;
    await save(a.store, "dough");
    await a.backend.push("en");
    expect(await remoteKeys(area)).toEqual(["bread", "dough"]);
  });

  it("merges what is already synced before writing", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    const b = device(area);
    await save(a.store, "dough");
    await a.backend.push("en");
    await save(b.store, "bread");
    await b.backend.push("en");
    expect(await remoteKeys(area)).toEqual(["bread", "dough"]);
    expect((await b.store.listTerms("en")).map((t) => t.key)).toEqual([
      "bread",
      "dough",
    ]);
  });

  it("does not write again when the synced copy already matches", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "dough");
    await a.backend.push("en");
    const logged = area.log.length;
    time += MIN;
    await a.backend.push("en");
    expect(area.log.length).toBe(logged);
    expect(await a.store.getMeta("lastSavedAt")).toBe(time);
  });

  it("removes chunks that are no longer needed", async () => {
    const area = createFakeSyncArea({ quotaBytesPerItem: 300 });
    const a = device(area);
    const keys = words(300);
    for (const key of keys) await save(a.store, key);
    await a.backend.push("en");
    const before = metaOf(area)!.chunks;
    expect(before).toBeGreaterThan(3);
    expect(chunkKeysIn(area)).toHaveLength(before);

    for (const key of keys.slice(10)) await a.store.removeTerm(`en:${key}`);
    time += 91 * DAY;
    await a.backend.push("en");
    const after = metaOf(area)!.chunks;
    expect(after).toBeLessThan(before);
    expect(chunkKeysIn(area).sort()).toEqual(
      Array.from({ length: after }, (_, i) => chunkKey("en", i)).sort(),
    );
    expect(await remoteKeys(area)).toEqual(keys.slice(0, 10).sort());
  });

  it("never leaves the meta pointing at chunks that are missing", async () => {
    const area = createFakeSyncArea({ quotaBytesPerItem: 300 });
    const broken: string[] = [];
    area.onChanged.addListener(() => {
      const meta = metaOf(area);
      for (let i = 0; meta && i < meta.chunks; i++)
        if (!area.data.has(chunkKey("en", i))) broken.push(chunkKey("en", i));
    });
    const a = device(area);
    await save(a.store, "dough");
    await a.backend.push("en");
    const keys = words(300);
    for (const key of keys) await save(a.store, key);
    await a.backend.push("en");
    for (const key of keys) await a.store.removeTerm(`en:${key}`);
    time += 91 * DAY;
    await a.backend.push("en");
    expect(metaOf(area)!.chunks).toBe(1);
    expect(broken).toEqual([]);
  });
});

describe("pull", () => {
  it("takes newer synced versions and keeps this device's newer ones", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    const b = device(area);
    await save(a.store, "dough");
    await save(b.store, "bread");
    time += MIN;
    await save(b.store, "dough", "known");
    await b.backend.push("en");
    time += MIN;
    await save(a.store, "bread", "known");
    await a.backend.pull("en");
    const minute = toMinutes(time);
    expect(await versions(a.store)).toEqual([
      ["bread", "known", minute],
      ["dough", "known", minute - 1],
    ]);
  });

  it("keeps this device's version when both changed in the same minute", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    const b = device(area);
    await save(a.store, "dough", "learning");
    time += 1000;
    await save(b.store, "dough", "known");
    await b.backend.push("en");
    await a.backend.pull("en");
    expect((await a.store.listTerms("en"))[0]!.status).toBe("learning");
  });

  it("does not push back what it pulled", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    const b = device(area);
    await a.backend.start();
    await b.backend.start();
    await save(a.store, "dough");
    await a.after(2000, b);
    expect(await versions(b.store)).toEqual(await versions(a.store));
    const written = area.log.length;
    await b.after(60_000, a);
    expect(area.log.length).toBe(written);
    expect(await b.store.getMeta("lastSavedAt")).toBeUndefined();
  });

  it("reports synced data it cannot read and keeps the local terms", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "dough");
    area.data.set(metaKey("en"), { chunks: 1, updatedAt: time, v: 1 });
    area.data.set(chunkKey("en", 0), "not gzip");
    await a.backend.pull("en");
    expect((await a.backend.status()).error).toMatch(/read/);
    expect(await versions(a.store)).toEqual([
      ["dough", "learning", toMinutes(time)],
    ]);
  });

  it("leaves data written by a newer version alone", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "dough");
    area.data.set(metaKey("en"), { chunks: 0, updatedAt: time, v: 2 });
    await a.backend.push("en");
    expect(metaOf(area)).toEqual({ chunks: 0, updatedAt: time, v: 2 });
    expect((await a.backend.status()).error).toMatch(/newer version/);
  });
});

describe("two devices", () => {
  it("converge, including a removal and a status change", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    const b = device(area);
    await a.backend.start();
    await b.backend.start();

    await save(a.store, "dough");
    await save(a.store, "bread");
    await a.after(2000, b);
    expect(await versions(b.store)).toEqual(await versions(a.store));

    time += MIN;
    await b.store.removeTerm("en:dough");
    await b.after(2000, a);
    time += MIN;
    await a.store.setStatus("en:bread", "known");
    await a.after(2000, b);

    const minute = toMinutes(time);
    expect(await versions(a.store)).toEqual([
      ["bread", "known", minute],
      ["dough", "removed", minute - 1],
    ]);
    expect(await versions(b.store)).toEqual(await versions(a.store));
    expect(await a.store.listTerms("en")).toHaveLength(1);
  });

  it("a device that starts with terms of its own adds them", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    const b = device(area);
    await save(a.store, "dough");
    await a.backend.push("en");
    time += MIN;
    await save(b.store, "crust");
    await b.backend.start();
    expect((await b.store.listTerms("en")).map((t) => t.key)).toEqual([
      "crust",
      "dough",
    ]);
    await b.after(2000);
    expect(await remoteKeys(area)).toEqual(["crust", "dough"]);
  });
});

describe("when the synced copy gets full", () => {
  /** What the area may hold for terms: the quota minus the settings key the backend reserves. */
  const room = (quota: number) =>
    quota - itemBytes("settings", DEFAULT_SETTINGS);

  it("keeps the oldest save-all terms on this device only", async () => {
    const quota = 2000;
    const area = createFakeSyncArea({ quotaBytes: quota });
    const a = device(area);
    const mine = words(5, 10_000);
    for (const key of mine) await save(a.store, key);
    const older = words(200);
    const newer = words(200, 200);
    await a.store.saveAll("en", older, "learning", SOURCE);
    time += MIN;
    await a.store.saveAll("en", newer, "learning", SOURCE);
    await a.backend.push("en");

    const synced = new Set(await remoteKeys(area));
    expect(mine.every((k) => synced.has(k))).toBe(true);
    expect(older.some((k) => synced.has(k))).toBe(false);
    const syncedNewer = newer.filter((k) => synced.has(k)).length;
    expect(syncedNewer).toBeGreaterThan(0);
    expect(syncedNewer).toBeLessThan(newer.length);
    expect(await a.backend.status()).toMatchObject({
      syncedCount: 5 + syncedNewer,
      localOnlyCount: 400 - syncedNewer,
      droppedKnownCount: 0,
    });
    expect(await a.store.listTerms("en")).toHaveLength(405);
    const used = [...area.data].reduce((s, [k, v]) => s + itemBytes(k, v), 0);
    expect(used).toBeLessThanOrEqual(0.9 * room(quota));
  });

  it("then leaves out the oldest known terms and reports how many", async () => {
    const quota = 1500;
    const area = createFakeSyncArea({ quotaBytes: quota });
    const a = device(area);
    const learning = words(20, 5000);
    for (const key of learning) await save(a.store, key);
    const known = words(150);
    for (const key of known) {
      time += MIN;
      await save(a.store, key, "known");
    }
    await a.store.saveAll("en", words(50, 9000), "learning", SOURCE);
    await a.backend.push("en");

    const synced = new Set(await remoteKeys(area));
    expect(learning.every((k) => synced.has(k))).toBe(true);
    const keptKnown = known.filter((k) => synced.has(k));
    expect(keptKnown.length).toBeGreaterThan(0);
    expect(keptKnown).toEqual(known.slice(known.length - keptKnown.length));
    const status = await a.backend.status();
    expect(status.droppedKnownCount).toBe(known.length - keptKnown.length);
    expect(status.localOnlyCount).toBe(50 + status.droppedKnownCount);
    expect(await a.store.listTerms("en")).toHaveLength(220);
  });

  it("measures the room left by other keys such as the settings", async () => {
    const quota = 3500;
    const area = createFakeSyncArea({ quotaBytes: quota });
    const settings = {
      ...DEFAULT_SETTINGS,
      neverRunOn: words(100).map((w) => `${w}.example.com`),
    };
    await area.set({ settings });
    const a = device(area);
    await a.store.saveAll("en", words(400), "learning", SOURCE);
    await a.backend.push("en");
    const used = [...area.data].reduce((s, [k, v]) => s + itemBytes(k, v), 0);
    const settingsBytes = itemBytes("settings", settings);
    expect(used - settingsBytes).toBeLessThanOrEqual(
      0.9 * (quota - settingsBytes),
    );
    expect(used - settingsBytes).toBeGreaterThan(0);
  });
});

describe("status", () => {
  it("reports usage, the last save and the counts", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "dough");
    await save(a.store, "bread");
    await a.backend.push("en");
    expect(await a.backend.status()).toEqual({
      enabled: true,
      bytesUsed: await area.getBytesInUse!(null),
      quotaBytes: 102_400,
      lastSavedAt: time,
      syncedCount: 2,
      localOnlyCount: 0,
      droppedKnownCount: 0,
    });
  });

  it("computes the bytes in use and the quota when the browser does not say", async () => {
    const area = createFakeSyncArea({
      noBytesInUse: true,
      noQuotaConstants: true,
    });
    const a = device(area);
    await save(a.store, "dough");
    await a.backend.push("en");
    const status = await a.backend.status();
    expect(status.quotaBytes).toBe(102_400);
    expect(status.bytesUsed).toBe(
      [...area.data].reduce((s, [k, v]) => s + itemBytes(k, v), 0),
    );
    expect(status.bytesUsed).toBeGreaterThan(0);
  });
});

describe("following changes", () => {
  it("pushes once, 2 s after the last of several changes", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await a.backend.start();
    for (const key of ["dough", "bread", "crust"]) {
      await save(a.store, key);
      await a.after(500);
    }
    await a.after(1499);
    expect(writes(area)).toBe(0);
    await a.after(1);
    expect(writes(area)).toBe(1);
    expect(await remoteKeys(area)).toEqual(["bread", "crust", "dough"]);
  });

  it("does not push for occurrences alone", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await save(a.store, "dough");
    await a.backend.push("en");
    await a.backend.start();
    await a.store.recordEncounters(SOURCE, [
      { termId: "en:dough", sentence: "More dough.", pos: { textQuote: "x" } },
    ]);
    await a.after(60_000);
    expect(writes(area)).toBe(1);
  });

  it("stops following changes after stop()", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await a.backend.start();
    await save(a.store, "dough");
    a.backend.stop();
    await a.after(60_000);
    expect(writes(area)).toBe(0);
  });
});

describe("when sync is turned off in the settings", () => {
  const syncEnabled = (area: FakeSyncArea, on: boolean) =>
    area.set({ settings: { ...DEFAULT_SETTINGS, syncEnabled: on } });

  it("neither pushes nor pulls, and says so", async () => {
    const area = createFakeSyncArea();
    await syncEnabled(area, false);
    const a = device(area);
    await a.backend.start();
    await save(a.store, "dough");
    await a.backend.push("en");
    await a.after(60_000);
    expect(writes(area)).toBe(0);

    // Another device's data appears; a disabled device does not take it.
    const elsewhere = createFakeSyncArea();
    const b = device(elsewhere);
    await save(b.store, "bread");
    await b.backend.push("en");
    for (const [key, value] of elsewhere.data) area.data.set(key, value);
    await a.backend.pull("en");
    expect((await a.store.listTerms("en")).map((t) => t.key)).toEqual([
      "dough",
    ]);
    expect((await a.backend.status()).enabled).toBe(false);
  });

  it("catches up when sync is turned back on", async () => {
    const area = createFakeSyncArea();
    await syncEnabled(area, false);
    const a = device(area);
    await a.backend.start();
    await save(a.store, "dough");
    await a.after(60_000);
    expect(writes(area)).toBe(0);

    await syncEnabled(area, true);
    await idle(a);
    await a.after(2000);
    expect(await remoteKeys(area)).toEqual(["dough"]);
    expect((await a.backend.status()).enabled).toBe(true);
  });
});

describe("storage errors", () => {
  it("shows the error in the status and retries with backoff", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await a.backend.start();
    area.failNext(new Error("MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded"));
    await save(a.store, "dough");
    await a.after(2000);
    expect((await a.backend.status()).error).toMatch(
      /MAX_WRITE_OPERATIONS_PER_MINUTE/,
    );
    expect(writes(area)).toBe(0);

    await a.after(3999);
    expect(writes(area)).toBe(0);
    await a.after(1);
    expect(writes(area)).toBe(1);
    expect(await remoteKeys(area)).toEqual(["dough"]);
    expect((await a.backend.status()).error).toBeUndefined();
  });

  it("waits out the backoff when another change comes in", async () => {
    const area = createFakeSyncArea();
    const a = device(area);
    await a.backend.start();
    area.failNext(new Error("QUOTA_BYTES quota exceeded"));
    await save(a.store, "dough");
    await a.after(2000);
    await save(a.store, "bread");
    await a.after(2000);
    expect(writes(area)).toBe(0);
    await a.after(2000);
    expect(await remoteKeys(area)).toEqual(["bread", "dough"]);
  });
});
