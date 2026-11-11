import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  answerLogRequest,
  createErrorLog,
  createRelay,
  ERROR_LOG_KEY,
  MAX_ENTRIES,
  MAX_PENDING,
  MESSAGE_TYPE,
  PENDING_KEY,
  type CheckError,
  type PendingStore,
} from "./error-log";

const entry = (message: string): CheckError => ({
  level: "error",
  message,
  context: "service worker",
  url: "chrome-extension://test-extension-id/background.js",
  time: "2026-11-12T10:00:00.000Z",
});

function memoryStore(): PendingStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

beforeEach(() => fakeBrowser.reset());

describe("createErrorLog", () => {
  const log = () => createErrorLog(fakeBrowser.storage.local);

  it("keeps entries in storage.local under one key, oldest first", async () => {
    await log().append([entry("a")]);
    await log().append([entry("b"), entry("c")]);
    expect(
      (await fakeBrowser.storage.local.get(ERROR_LOG_KEY))[ERROR_LOG_KEY],
    ).toEqual([entry("a"), entry("b"), entry("c")]);
    expect((await log().read()).map((e) => e.message)).toEqual(["a", "b", "c"]);
  });

  it("loses none of the appends that run at the same time", async () => {
    const l = log();
    await Promise.all(["a", "b", "c", "d"].map((m) => l.append([entry(m)])));
    expect((await l.read()).map((e) => e.message)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it(`keeps the newest ${MAX_ENTRIES} entries`, async () => {
    const l = log();
    const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) =>
      entry(`${i}`),
    );
    await l.append(many);
    const kept = await l.read();
    expect(kept).toHaveLength(MAX_ENTRIES);
    expect(kept[0]!.message).toBe("5");
    expect(kept.at(-1)!.message).toBe(`${MAX_ENTRIES + 4}`);
  });

  it("clears the log", async () => {
    const l = log();
    await l.append([entry("a")]);
    await l.clear();
    expect(await l.read()).toEqual([]);
  });
});

describe("answerLogRequest", () => {
  it("appends, reads and clears", async () => {
    const log = createErrorLog(fakeBrowser.storage.local);
    const type = MESSAGE_TYPE;
    expect(
      await answerLogRequest(log, {
        type,
        action: "append",
        entries: [entry("a")],
      }),
    ).toBe(true);
    expect(await answerLogRequest(log, { type, action: "read" })).toEqual([
      entry("a"),
    ]);
    expect(await answerLogRequest(log, { type, action: "clear" })).toBe(true);
    expect(await answerLogRequest(log, { type, action: "read" })).toEqual([]);
  });
});

describe("createRelay", () => {
  it("sends entries to the background and keeps nothing once sent", async () => {
    const sent: CheckError[][] = [];
    const store = memoryStore();
    const relay = createRelay({ send: async (e) => void sent.push(e), store });
    relay.push(entry("a"));
    relay.push(entry("b"));
    await relay.flush();
    expect(sent.flat().map((e) => e.message)).toEqual(["a", "b"]);
    expect(relay.pending()).toEqual([]);
    expect(store.items.has(PENDING_KEY)).toBe(false);
  });

  it("keeps what it cannot send, also in the tab's store, for the next script", async () => {
    const store = memoryStore();
    const orphaned = createRelay({
      send: () => Promise.reject(new Error("Extension context invalidated.")),
      store,
    });
    orphaned.push(entry("teardown"));
    await orphaned.flush();
    expect(orphaned.pending().map((e) => e.message)).toEqual(["teardown"]);

    // The tab is reloaded: the new script sends what the old one left.
    const sent: CheckError[] = [];
    const next = createRelay({
      send: async (e) => void sent.push(...e),
      store,
    });
    await next.flush();
    expect(sent.map((e) => e.message)).toEqual(["teardown"]);
    expect(store.items.has(PENDING_KEY)).toBe(false);
  });

  it("survives a send that throws at once (runtime taken away)", async () => {
    const relay = createRelay({
      send: () => {
        throw new TypeError("Cannot read properties of undefined");
      },
    });
    relay.push(entry("a"));
    await relay.flush();
    expect(relay.pending()).toHaveLength(1);
  });

  it(`keeps the newest ${MAX_PENDING} entries it could not send`, async () => {
    const relay = createRelay({
      send: () => Promise.reject(new Error("gone")),
    });
    for (let i = 0; i < MAX_PENDING + 3; i++) relay.push(entry(`${i}`));
    await relay.flush();
    expect(relay.pending()).toHaveLength(MAX_PENDING);
    expect(relay.pending()[0]!.message).toBe("3");
  });

  it("clears what is pending", async () => {
    const store = memoryStore();
    const relay = createRelay({
      send: () => Promise.reject(new Error("gone")),
      store,
    });
    relay.push(entry("a"));
    relay.clear();
    expect(relay.pending()).toEqual([]);
    expect(store.items.has(PENDING_KEY)).toBe(false);
  });
});
