import { beforeEach, describe, expect, it } from "vitest";
import type { LangleDb } from "./db";
import { translationPair } from "../core/packs/pairs";
import {
  createTranslationCache,
  TRANSLATION_CACHE_LIMIT,
  type TranslationCache,
} from "./translation-cache";
import { fakeClock } from "../testing/clock";
import { freshDb } from "../testing/db";

const DAY = 24 * 60 * 60 * 1000;
const EN_JA = translationPair("en", "ja");
const ES_JA = translationPair("es", "ja");

let db: LangleDb;
let cache: TranslationCache;
let clock: ReturnType<typeof fakeClock>;

function cacheWithLimit(limit: number) {
  return createTranslationCache(db, { limit, now: clock.now });
}

beforeEach(() => {
  clock = fakeClock();
  db = freshDb();
  cache = createTranslationCache(db, { now: clock.now });
});

describe("translationPair", () => {
  it("names the learning and the native language", () => {
    expect(EN_JA).toBe("en>ja");
  });
});

describe("translation cache", () => {
  it("gives back what was put, by English text, and nothing for the rest", async () => {
    await cache.put(EN_JA, [
      { text: "To reveal a secret.", translated: "秘密を漏らす。" },
      { text: "To come to understand", translated: "理解するようになる" },
    ]);
    expect(
      await cache.get(EN_JA, [
        "To reveal a secret.",
        "To discover.",
        "To come to understand",
      ]),
    ).toEqual({
      "To reveal a secret.": "秘密を漏らす。",
      "To come to understand": "理解するようになる",
    });
    expect(await cache.get(EN_JA, [])).toEqual({});
  });

  it("keeps each pair apart", async () => {
    await cache.put(EN_JA, [{ text: "secretly", translated: "こっそり" }]);
    expect(await cache.get(ES_JA, ["secretly"])).toEqual({});
    expect(await db.mtCache.get("en>ja:secretly")).toEqual({
      key: "en>ja:secretly",
      pair: EN_JA,
      text: "secretly",
      translated: "こっそり",
      usedAt: clock.time,
    });
  });

  it("replaces a translation that is put again", async () => {
    await cache.put(EN_JA, [{ text: "To quit.", translated: "やめる。" }]);
    clock.tick();
    await cache.put(EN_JA, [{ text: "To quit.", translated: "辞める。" }]);
    expect(await cache.get(EN_JA, ["To quit."])).toEqual({
      "To quit.": "辞める。",
    });
    expect(await db.mtCache.count()).toBe(1);
  });

  it("keeps a key such as __proto__ as an own property", async () => {
    await cache.put(EN_JA, [{ text: "__proto__", translated: "プロト" }]);
    const found = await cache.get(EN_JA, ["__proto__"]);
    expect(Object.hasOwn(found, "__proto__")).toBe(true);
    expect(found["__proto__"]).toBe("プロト");
  });

  /** How many rows of the cache were written since it was called. */
  function countUpdates() {
    let updates = 0;
    db.mtCache.hook("updating", () => {
      updates++;
    });
    return () => updates;
  }

  it("marks the translations it gives back as used now when last used over a day ago", async () => {
    await cache.put(EN_JA, [
      { text: "a", translated: "あ" },
      { text: "b", translated: "び" },
    ]);
    const putAt = clock.time;
    clock.tick(DAY + 5_000);
    await cache.get(EN_JA, ["a", "missing"]);
    expect((await db.mtCache.get("en>ja:a"))?.usedAt).toBe(putAt + DAY + 5_000);
    expect((await db.mtCache.get("en>ja:b"))?.usedAt).toBe(putAt);
    expect(await db.mtCache.get("en>ja:missing")).toBeUndefined();
  });

  it("writes a row read again within a day once: its time stays", async () => {
    await cache.put(EN_JA, [{ text: "a", translated: "あ" }]);
    clock.tick(DAY + 1);
    const updates = countUpdates();
    await cache.get(EN_JA, ["a"]);
    const refreshedAt = clock.time;
    clock.tick(DAY - 1);
    expect(await cache.get(EN_JA, ["a"])).toEqual({ a: "あ" });
    expect(updates()).toBe(1);
    expect((await db.mtCache.get("en>ja:a"))?.usedAt).toBe(refreshedAt);
  });

  it("writes nothing for a read of rows used within the day", async () => {
    await cache.put(EN_JA, [
      { text: "a", translated: "あ" },
      { text: "b", translated: "び" },
    ]);
    clock.tick(DAY);
    const updates = countUpdates();
    expect(await cache.get(EN_JA, ["a", "b"])).toEqual({ a: "あ", b: "び" });
    expect(updates()).toBe(0);
  });

  it("removes the least recently used rows when a write goes over the limit", async () => {
    const small = cacheWithLimit(3);
    for (const text of ["a", "b", "c"]) {
      await small.put(EN_JA, [{ text, translated: text.toUpperCase() }]);
      clock.tick(DAY);
    }
    clock.tick(1);
    // "a" is read again, so "b" is now the least recently used.
    await small.get(EN_JA, ["a"]);
    clock.tick();
    await small.put(ES_JA, [
      { text: "d", translated: "D" },
      { text: "e", translated: "E" },
    ]);
    expect(await db.mtCache.count()).toBe(3);
    expect(await small.get(EN_JA, ["a", "b", "c"])).toEqual({ a: "A" });
    expect(await small.get(ES_JA, ["d", "e"])).toEqual({ d: "D", e: "E" });
  });

  // The limit itself is tested above with a small one: filling 20,000 rows took seconds
  // on Firefox, and timed out on a loaded machine.
  it("keeps at most 20,000 rows by default", () => {
    expect(TRANSLATION_CACHE_LIMIT).toBe(20_000);
  });

  it("clears one pair and keeps the others", async () => {
    await cache.put(EN_JA, [{ text: "a", translated: "あ" }]);
    await cache.put(ES_JA, [{ text: "a", translated: "エー" }]);
    await cache.clearPair(EN_JA);
    expect(await cache.get(EN_JA, ["a"])).toEqual({});
    expect(await cache.get(ES_JA, ["a"])).toEqual({ a: "エー" });
  });
});
