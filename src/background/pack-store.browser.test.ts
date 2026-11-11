import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackLock, PackLockEntry } from "../core/packs/lock";
import type { PackStates } from "../core/packs/state";
import { PacksUnavailableError } from "../core/packs/unavailable";
import { openLingoDb, type LingoDb } from "./db";
import { createPackStore, type PackStore } from "./pack-store";

const MIRRORS = [
  "https://one.test/npm/{package}@{version}/{file}",
  "https://two.test/{package}/{version}/{file}",
];

/** A pack version's files: path → JSON value. */
type Contents = Record<string, unknown>;

const text = (value: unknown) => JSON.stringify(value);
const bytesOf = (value: unknown) => new TextEncoder().encode(text(value));

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", bytesOf(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function lockEntry(
  name: string,
  version: string,
  contents: Contents,
): Promise<PackLockEntry> {
  return {
    package: `@lingo-test/${name}`,
    version,
    format: 1,
    bundled: false,
    files: await Promise.all(
      Object.entries(contents).map(async ([path, value]) => ({
        path,
        size: bytesOf(value).byteLength,
        sha256: await sha256(value),
      })),
    ),
  };
}

const bundled = (name: string): PackLockEntry => ({
  package: `@lingo-test/${name}`,
  version: "2026.1111.0",
  format: 1,
  bundled: true,
  files: [],
});

const ES_V1: Contents = {
  "freq.json": ["de", "estar", "comer"],
  "lemmas.json": { estoy: "estar" },
};
/** The next version: freq.json changed, lemmas.json did not. */
const ES_V2: Contents = { ...ES_V1, "freq.json": ["de", "estar", "casa"] };
const ES_EN: Contents = {
  "index.json": {
    shards: [{ file: "dict-1.json", first: "comer", last: "comer" }],
  },
  "dict-1.json": { comer: ["to eat", [["verb", "to eat"]]] },
};

/** A lock with en, en-ja and en-defs bundled, es and es-en downloaded. */
async function testLock(
  packs: { es?: PackLockEntry; "es-en"?: PackLockEntry } = {},
): Promise<PackLock> {
  return {
    v: 1,
    mirrors: MIRRORS,
    packs: {
      en: bundled("en"),
      "en-ja": bundled("en-ja"),
      "en-defs": bundled("en-defs"),
      es: packs.es ?? (await lockEntry("es", "2026.1111.0", ES_V1)),
      "es-en":
        packs["es-en"] ?? (await lockEntry("es-en", "2026.1111.0", ES_EN)),
    },
  };
}

const urlOf = (mirror: number, entry: PackLockEntry, path: string) =>
  MIRRORS[mirror]!.replace("{package}", entry.package)
    .replace("{version}", entry.version)
    .replace("{file}", path);

const fileOf = (entry: PackLockEntry, path: string) =>
  entry.files.find((file) => file.path === path)!;

const sizeOf = (entry: PackLockEntry) =>
  entry.files.reduce((sum, file) => sum + file.size, 0);

const hashesOf = (entry: PackLockEntry) =>
  entry.files.map((file) => file.sha256).sort();

/** What a mirror URL answers: a body, or a response (or failure) made on request. */
type Served = string | (() => Promise<Response>);

/** The mirrors (the network boundary): URLs they serve, and every URL requested. */
function fakeMirrors() {
  const served = new Map<string, Served>();
  const requests: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    requests.push(url);
    const body = served.get(url);
    if (body === undefined) return new Response("Not found", { status: 404 });
    return typeof body === "string" ? new Response(body) : body();
  });
  /** Serves a version's files on mirror `mirror` (0: the first). */
  const serve = (mirror: number, entry: PackLockEntry, contents: Contents) => {
    for (const [path, value] of Object.entries(contents))
      served.set(urlOf(mirror, entry, path), text(value));
  };
  return { served, requests, fetch, serve };
}

/** A response held back until `release` is called. */
function heldResponse(body: string) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const respond = async () => {
    await held;
    return new Response(body);
  };
  return { respond, release };
}

let db: LingoDb;
let mirrors: ReturnType<typeof fakeMirrors>;
let written: PackStates[];
let time: number;
/** Called for each `now()`; time stands still unless a test moves it. */
let clock: () => number;

beforeEach(() => {
  db = openLingoDb(`lingo-test-${crypto.randomUUID()}`);
  mirrors = fakeMirrors();
  written = [];
  time = 1_000_000;
  clock = () => time;
});

afterEach(async () => {
  await db.delete();
});

/** A pack store as one service worker has it (a new one per worker). */
const storeWith = (lock: PackLock): PackStore =>
  createPackStore({
    db,
    lock,
    fetch: mirrors.fetch,
    setState: (states) => {
      written.push(states);
    },
    now: () => clock(),
  });

const lastState = () => written.at(-1);

/** The URLs requested for a pack's files, on either mirror. */
const requestsOf = (entry: PackLockEntry) =>
  mirrors.requests.filter(
    (url) =>
      url.includes(`${entry.package}@`) || url.includes(`${entry.package}/`),
  );

describe("pack store: downloads", () => {
  it("downloads a pack's files from the first mirror, checks them and switches to its version", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    mirrors.serve(1, es, ES_V1);
    const store = storeWith(lock);
    expect(await store.ensure(["es"])).toEqual({ ready: ["es"], failed: [] });
    expect(mirrors.requests).toEqual([
      "https://one.test/npm/@lingo-test/es@2026.1111.0/freq.json",
      "https://one.test/npm/@lingo-test/es@2026.1111.0/lemmas.json",
    ]);
    expect(await store.read("es", "freq.json")).toEqual(ES_V1["freq.json"]);
    expect(await store.read("es", "lemmas.json")).toEqual(ES_V1["lemmas.json"]);
    expect(await db.packVersions.get("es")).toEqual({
      pack: "es",
      version: "2026.1111.0",
      format: 1,
      files: es.files.map(({ path, sha256 }) => ({ path, sha256 })),
    });
    const total = sizeOf(es);
    expect(written[0]).toEqual({
      es: { state: "downloading", received: 0, total },
    });
    expect(lastState()).toEqual({
      es: { state: "ready", received: total, total },
    });
  });

  it("does nothing more for a pack that is already at its version", async () => {
    const lock = await testLock();
    mirrors.serve(0, lock.packs.es, ES_V1);
    await storeWith(lock).ensure(["es"]);
    mirrors.requests.length = 0;
    written = [];
    const store = storeWith(lock);
    expect(await store.ensure(["es"])).toEqual({ ready: ["es"], failed: [] });
    expect(mirrors.requests).toEqual([]);
    const total = sizeOf(lock.packs.es);
    expect(written).toEqual([
      { es: { state: "ready", received: total, total } },
    ]);
  });

  it("leaves bundled packs alone", async () => {
    const store = storeWith(await testLock());
    expect(await store.ensure(["en", "en-ja", "en-defs"])).toEqual({
      ready: ["en", "en-ja", "en-defs"],
      failed: [],
    });
    expect(mirrors.fetch).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it("takes a file from the next mirror when the first one sends other bytes, an error or nothing", async () => {
    const lock = await testLock();
    const [es, esEn] = [lock.packs.es, lock.packs["es-en"]];
    mirrors.served.set(urlOf(0, es, "freq.json"), text(["tampered"]));
    mirrors.served.set(urlOf(0, esEn, "index.json"), () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    mirrors.serve(1, es, ES_V1);
    mirrors.serve(1, esEn, ES_EN);
    mirrors.serve(0, esEn, { "dict-1.json": ES_EN["dict-1.json"] });
    const store = storeWith(lock);
    expect(await store.ensure(["es", "es-en"])).toEqual({
      ready: ["es", "es-en"],
      failed: [],
    });
    // lemmas.json is not on the first mirror (404).
    expect(requestsOf(es)).toEqual([
      urlOf(0, es, "freq.json"),
      urlOf(1, es, "freq.json"),
      urlOf(0, es, "lemmas.json"),
      urlOf(1, es, "lemmas.json"),
    ]);
    expect(requestsOf(esEn)).toEqual([
      urlOf(0, esEn, "index.json"),
      urlOf(1, esEn, "index.json"),
      urlOf(0, esEn, "dict-1.json"),
    ]);
    expect(await store.read("es", "freq.json")).toEqual(ES_V1["freq.json"]);
    expect(await store.read("es-en", "index.json")).toEqual(
      ES_EN["index.json"],
    );
    expect(lastState()).toEqual({
      es: { state: "ready", received: sizeOf(es), total: sizeOf(es) },
      "es-en": { state: "ready", received: sizeOf(esEn), total: sizeOf(esEn) },
    });
  });

  it("fails without switching when no mirror has a file that checks out, keeping the files that did", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    mirrors.served.set(urlOf(0, es, "lemmas.json"), text({ estoy: "ser" }));
    mirrors.served.set(urlOf(1, es, "lemmas.json"), () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const store = storeWith(lock);
    expect(await store.ensure(["es"])).toEqual({ ready: [], failed: ["es"] });
    expect(await db.packVersions.get("es")).toBeUndefined();
    await expect(store.read("es", "freq.json")).rejects.toThrow(
      PacksUnavailableError,
    );
    const state = lastState()!.es!;
    // Bytes that did not check out are not counted.
    expect(state).toMatchObject({
      state: "failed",
      received: fileOf(es, "freq.json").size,
      total: sizeOf(es),
    });
    expect(state.error).toContain("lemmas.json");
    expect(state.error).toContain("SHA-256");
    expect(state.error).toContain("Failed to fetch");
    expect(state.updating).toBeUndefined();
    expect(
      await db.packFiles.get(fileOf(es, "freq.json").sha256),
    ).toBeDefined();
    expect(
      await db.packFiles.get(fileOf(es, "lemmas.json").sha256),
    ).toBeUndefined();
  });

  it("stops reading a file larger than the lock says", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    mirrors.served.set(urlOf(0, es, "freq.json"), "x".repeat(1_000_000));
    expect(await storeWith(lock).ensure(["es"])).toEqual({
      ready: [],
      failed: ["es"],
    });
    expect(lastState()!.es!.error).toContain("larger than the lock says");
    expect(lastState()!.es!.received).toBe(0);
  });

  it("fails when the lock lists no mirror", async () => {
    const lock = { ...(await testLock()), mirrors: [] };
    expect(await storeWith(lock).ensure(["es"])).toEqual({
      ready: [],
      failed: ["es"],
    });
    expect(lastState()!.es).toMatchObject({ state: "failed" });
  });

  it("carries on where a stopped download left off, fetching only the missing files", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    // An earlier service worker stored freq.json, then stopped.
    await db.packFiles.put({
      sha256: fileOf(es, "freq.json").sha256,
      blob: new Blob([text(ES_V1["freq.json"])]),
    });
    mirrors.serve(0, es, ES_V1);
    const store = storeWith(lock);
    expect(await store.ensure(["es"])).toEqual({ ready: ["es"], failed: [] });
    expect(mirrors.requests).toEqual([urlOf(0, es, "lemmas.json")]);
    expect(written[0]).toEqual({
      es: {
        state: "downloading",
        received: fileOf(es, "freq.json").size,
        total: sizeOf(es),
      },
    });
    expect(await store.read("es", "freq.json")).toEqual(ES_V1["freq.json"]);
  });

  it("downloads a pack once when it is asked for again meanwhile", async () => {
    const lock = await testLock();
    mirrors.serve(0, lock.packs.es, ES_V1);
    mirrors.serve(0, lock.packs["es-en"], ES_EN);
    const store = storeWith(lock);
    const [a, b] = await Promise.all([
      store.ensure(["es"]),
      store.ensure(["es", "es-en", "es"]),
    ]);
    expect(a).toEqual({ ready: ["es"], failed: [] });
    expect(b).toEqual({ ready: ["es", "es-en"], failed: [] });
    expect(mirrors.requests).toHaveLength(4);
    expect(new Set(mirrors.requests).size).toBe(4);
  });

  it("keeps the files of a pack still downloading when another pack switches", async () => {
    const lock = await testLock();
    const [es, esEn] = [lock.packs.es, lock.packs["es-en"]];
    mirrors.serve(0, es, ES_V1);
    mirrors.serve(0, esEn, ES_EN);
    const lemmas = heldResponse(text(ES_V1["lemmas.json"]));
    const dict = heldResponse(text(ES_EN["dict-1.json"]));
    mirrors.served.set(urlOf(0, es, "lemmas.json"), lemmas.respond);
    mirrors.served.set(urlOf(0, esEn, "dict-1.json"), dict.respond);
    const store = storeWith(lock);
    const both = store.ensure(["es", "es-en"]);
    // es-en has stored index.json and waits for dict-1.json when es switches
    // (and deletes the files nothing refers to).
    await vi.waitFor(async () =>
      expect(
        await db.packFiles.get(fileOf(esEn, "index.json").sha256),
      ).toBeDefined(),
    );
    lemmas.release();
    await vi.waitFor(async () =>
      expect(await db.packVersions.get("es")).toBeDefined(),
    );
    dict.release();
    expect(await both).toEqual({ ready: ["es", "es-en"], failed: [] });
    expect(await store.read("es-en", "index.json")).toEqual(
      ES_EN["index.json"],
    );
    expect(mirrors.requests).toHaveLength(4);
  });
});

describe("pack store: progress", () => {
  /** Serves freq.json in two chunks. */
  function serveInTwoChunks(entry: PackLockEntry) {
    const bytes = bytesOf(ES_V1["freq.json"]);
    const half = Math.floor(bytes.length / 2);
    mirrors.served.set(
      urlOf(0, entry, "freq.json"),
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.slice(0, half));
              controller.enqueue(bytes.slice(half));
              controller.close();
            },
          }),
        ),
    );
    return half;
  }

  it("writes the bytes received as they come", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    const half = serveInTwoChunks(es);
    clock = () => (time += 300);
    await storeWith(lock).ensure(["es"]);
    expect(written.map((states) => states.es!.received)).toContain(half);
  });

  it("writes progress at most every 250 ms, and after each file", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    serveInTwoChunks(es);
    await storeWith(lock).ensure(["es"]);
    const total = sizeOf(es);
    expect(
      written.map((states) => [states.es!.state, states.es!.received]),
    ).toEqual([
      ["downloading", 0],
      ["downloading", fileOf(es, "freq.json").size],
      ["downloading", total],
      ["ready", total],
    ]);
  });
});

describe("pack store: versions", () => {
  it("downloads only the changed files of a new version, switches, then deletes the old files", async () => {
    const v1 = await testLock();
    mirrors.serve(0, v1.packs.es, ES_V1);
    await storeWith(v1).ensure(["es"]);
    const v2 = await testLock({
      es: await lockEntry("es", "2026.1112.0", ES_V2),
    });
    mirrors.serve(0, v2.packs.es, ES_V2);
    mirrors.requests.length = 0;
    written = [];
    const store = storeWith(v2);
    const switched = vi.fn();
    store.onSwitch(switched);
    expect(await store.ensure(["es"])).toEqual({ ready: ["es"], failed: [] });
    expect(mirrors.requests).toEqual([urlOf(0, v2.packs.es, "freq.json")]);
    expect(written[0]!.es).toMatchObject({
      state: "downloading",
      updating: true,
    });
    expect(lastState()!.es).toEqual({
      state: "ready",
      received: sizeOf(v2.packs.es),
      total: sizeOf(v2.packs.es),
    });
    expect(await store.read("es", "freq.json")).toEqual(ES_V2["freq.json"]);
    expect(await store.read("es", "lemmas.json")).toEqual(ES_V2["lemmas.json"]);
    expect(switched).toHaveBeenCalledWith("es");
    expect((await db.packFiles.toCollection().primaryKeys()).sort()).toEqual(
      hashesOf(v2.packs.es),
    );
  });

  it("keeps the old version in use while the new one cannot be downloaded", async () => {
    const v1 = await testLock();
    mirrors.serve(0, v1.packs.es, ES_V1);
    await storeWith(v1).ensure(["es"]);
    const v2 = await testLock({
      es: await lockEntry("es", "2026.1112.0", ES_V2),
    });
    const store = storeWith(v2);
    const switched = vi.fn();
    store.onSwitch(switched);
    expect(await store.ensure(["es"])).toEqual({ ready: [], failed: ["es"] });
    expect(await store.read("es", "freq.json")).toEqual(ES_V1["freq.json"]);
    expect(lastState()!.es).toMatchObject({ state: "failed", updating: true });
    expect(switched).not.toHaveBeenCalled();
    // Not the lock's version: its size is its files' size.
    expect(await store.downloaded()).toEqual([
      { pack: "es", version: "2026.1111.0", size: sizeOf(v1.packs.es) },
    ]);
  });

  it("does not read a stored version in another format, and replaces it with the lock's", async () => {
    const lock = await testLock();
    mirrors.serve(0, lock.packs.es, ES_V1);
    await storeWith(lock).ensure(["es"]);
    await db.packVersions.update("es", { format: 0 });
    const store = storeWith(lock);
    const read = store.read("es", "freq.json");
    await expect(read).rejects.toThrow(PacksUnavailableError);
    await expect(read).rejects.toMatchObject({ packs: ["es"] });
    mirrors.requests.length = 0;
    written = [];
    expect(await store.ensure(["es"])).toEqual({ ready: ["es"], failed: [] });
    // Its files are stored already; an old format is not an update in use.
    expect(mirrors.requests).toEqual([]);
    expect(written[0]!.es).toMatchObject({ state: "downloading" });
    expect(written[0]!.es!.updating).toBeUndefined();
    expect(await store.read("es", "freq.json")).toEqual(ES_V1["freq.json"]);
  });

  it("does not read a pack whose file is missing, and gets it again", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    await storeWith(lock).ensure(["es"]);
    await db.packFiles.delete(fileOf(es, "lemmas.json").sha256);
    const store = storeWith(lock);
    await expect(store.read("es", "lemmas.json")).rejects.toThrow(
      PacksUnavailableError,
    );
    mirrors.requests.length = 0;
    expect(await store.ensure(["es"])).toEqual({ ready: ["es"], failed: [] });
    expect(mirrors.requests).toEqual([urlOf(0, es, "lemmas.json")]);
    expect(await store.read("es", "lemmas.json")).toEqual(ES_V1["lemmas.json"]);
  });

  it("refuses a file the pack does not have", async () => {
    const lock = await testLock();
    mirrors.serve(0, lock.packs.es, ES_V1);
    const store = storeWith(lock);
    await store.ensure(["es"]);
    await expect(store.read("es", "ipa.json")).rejects.toThrow(
      "es 2026.1111.0 has no file ipa.json",
    );
  });
});

describe("pack store: removal and listing", () => {
  it("removes a pack: its version, its files and its state", async () => {
    const lock = await testLock();
    mirrors.serve(0, lock.packs.es, ES_V1);
    mirrors.serve(0, lock.packs["es-en"], ES_EN);
    const store = storeWith(lock);
    await store.ensure(["es", "es-en"]);
    expect(await store.downloaded()).toEqual([
      { pack: "es", version: "2026.1111.0", size: sizeOf(lock.packs.es) },
      {
        pack: "es-en",
        version: "2026.1111.0",
        size: sizeOf(lock.packs["es-en"]),
      },
    ]);
    const switched = vi.fn();
    store.onSwitch(switched);
    await store.remove("es-en");
    expect(await db.packVersions.get("es-en")).toBeUndefined();
    expect((await db.packFiles.toCollection().primaryKeys()).sort()).toEqual(
      hashesOf(lock.packs.es),
    );
    await expect(store.read("es-en", "index.json")).rejects.toThrow(
      PacksUnavailableError,
    );
    expect(await store.read("es", "freq.json")).toEqual(ES_V1["freq.json"]);
    const total = sizeOf(lock.packs.es);
    expect(lastState()).toEqual({
      es: { state: "ready", received: total, total },
    });
    expect(switched).toHaveBeenCalledWith("es-en");
    expect(await store.downloaded()).toEqual([
      { pack: "es", version: "2026.1111.0", size: total },
    ]);
  });

  it("removes a pack after its download in progress ends", async () => {
    const lock = await testLock();
    const es = lock.packs.es;
    mirrors.serve(0, es, ES_V1);
    const lemmas = heldResponse(text(ES_V1["lemmas.json"]));
    mirrors.served.set(urlOf(0, es, "lemmas.json"), lemmas.respond);
    const store = storeWith(lock);
    const download = store.ensure(["es"]);
    await vi.waitFor(() => expect(mirrors.requests).toHaveLength(2));
    const removed = store.remove("es");
    lemmas.release();
    await download;
    await removed;
    expect(await db.packVersions.get("es")).toBeUndefined();
    expect(await db.packFiles.count()).toBe(0);
    expect(lastState()).toEqual({});
  });

  it("marks the packs not at their lock version failed while a retry waits, and writes it", async () => {
    const lock = await testLock();
    const [es, esEn] = [lock.packs.es, lock.packs["es-en"]];
    mirrors.serve(0, es, ES_V1);
    await storeWith(lock).ensure(["es"]);
    // es-en's download stopped after index.json.
    await db.packFiles.put({
      sha256: fileOf(esEn, "index.json").sha256,
      blob: new Blob([text(ES_EN["index.json"])]),
    });
    written = [];
    const store = storeWith(lock);
    await store.markFailed(["es", "es-en", "en"], "Retry pending");
    const failed = {
      state: "failed",
      received: fileOf(esEn, "index.json").size,
      total: sizeOf(esEn),
      error: "Retry pending",
    };
    expect(written).toEqual([
      {
        es: { state: "ready", received: sizeOf(es), total: sizeOf(es) },
        "es-en": failed,
      },
    ]);
    expect(await store.states(["es-en"])).toEqual({ "es-en": failed });
    expect(mirrors.requests).toHaveLength(2);
  });

  it("marks an update in waiting failed with the old version in use", async () => {
    const v1 = await testLock();
    mirrors.serve(0, v1.packs.es, ES_V1);
    await storeWith(v1).ensure(["es"]);
    const v2 = await testLock({
      es: await lockEntry("es", "2026.1112.0", ES_V2),
    });
    written = [];
    await storeWith(v2).markFailed(["es"], "Retry pending");
    expect(lastState()!.es).toMatchObject({
      state: "failed",
      updating: true,
      error: "Retry pending",
    });
  });

  it("gives each pack's state, also before this worker brought it to its version", async () => {
    const lock = await testLock();
    mirrors.serve(0, lock.packs.es, ES_V1);
    await storeWith(lock).ensure(["es"]);
    const store = storeWith(lock);
    const es = sizeOf(lock.packs.es);
    const esEn = sizeOf(lock.packs["es-en"]);
    expect(await store.states(["es", "es-en", "en"])).toEqual({
      es: { state: "ready", received: es, total: es },
      "es-en": { state: "downloading", received: 0, total: esEn },
    });
    await store.ensure(["es-en"]);
    expect((await store.states(["es-en"]))["es-en"]).toMatchObject({
      state: "failed",
    });
  });
});
