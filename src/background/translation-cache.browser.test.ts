import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openLingoDb, type LingoDb } from "./db";
import {
  createTranslationCache,
  translationPair,
  type TranslationCache,
} from "./translation-cache";

const EN_JA = translationPair("en", "ja");
const ES_JA = translationPair("es", "ja");

let db: LingoDb;
let cache: TranslationCache;
let time: number;
const tick = (ms = 1000) => (time += ms);

function cacheWithLimit(limit: number) {
  return createTranslationCache(db, { limit, now: () => time });
}

beforeEach(() => {
  time = 1_000_000;
  db = openLingoDb(`lingo-test-${crypto.randomUUID()}`);
  cache = createTranslationCache(db, { now: () => time });
});

afterEach(async () => {
  await db.delete();
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
      usedAt: time,
    });
  });

  it("replaces a translation that is put again", async () => {
    await cache.put(EN_JA, [{ text: "To quit.", translated: "やめる。" }]);
    tick();
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

  it("marks the translations it gives back as used now", async () => {
    await cache.put(EN_JA, [
      { text: "a", translated: "あ" },
      { text: "b", translated: "び" },
    ]);
    const putAt = time;
    tick(5_000);
    await cache.get(EN_JA, ["a", "missing"]);
    expect((await db.mtCache.get("en>ja:a"))?.usedAt).toBe(putAt + 5_000);
    expect((await db.mtCache.get("en>ja:b"))?.usedAt).toBe(putAt);
    expect(await db.mtCache.get("en>ja:missing")).toBeUndefined();
  });

  it("removes the least recently used rows when a write goes over the limit", async () => {
    const small = cacheWithLimit(3);
    for (const text of ["a", "b", "c"]) {
      await small.put(EN_JA, [{ text, translated: text.toUpperCase() }]);
      tick();
    }
    // "a" is read again, so "b" is now the least recently used.
    await small.get(EN_JA, ["a"]);
    tick();
    await small.put(ES_JA, [
      { text: "d", translated: "D" },
      { text: "e", translated: "E" },
    ]);
    expect(await db.mtCache.count()).toBe(3);
    expect(await small.get(EN_JA, ["a", "b", "c"])).toEqual({ a: "A" });
    expect(await small.get(ES_JA, ["d", "e"])).toEqual({ d: "D", e: "E" });
  });

  it("keeps at most 20,000 rows by default", async () => {
    await cache.put(
      EN_JA,
      Array.from({ length: 20_001 }, (_, i) => ({
        text: `text ${String(i).padStart(5, "0")}`,
        translated: `訳 ${i}`,
      })),
    );
    expect(await db.mtCache.count()).toBe(20_000);
  });

  it("clears one pair and keeps the others", async () => {
    await cache.put(EN_JA, [{ text: "a", translated: "あ" }]);
    await cache.put(ES_JA, [{ text: "a", translated: "エー" }]);
    await cache.clearPair(EN_JA);
    expect(await cache.get(EN_JA, ["a"])).toEqual({});
    expect(await cache.get(ES_JA, ["a"])).toEqual({ a: "エー" });
  });
});

describe("upgrade from version 2", () => {
  it("keeps the terms and adds the translation cache", async () => {
    const name = `lingo-test-${crypto.randomUUID()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({
      terms: "id, lang, status, updatedAt, batchId, [lang+status]",
      sources: "id",
      occurrences:
        "++id, termId, &[termId+sourceId+sentence], [termId+seenAt], seenAt",
      meta: "key",
    });
    v2.version(2).stores({
      historyPages: "id, lastSeen, host",
      historySentences: "++id, pageId, &[pageId+text], *keys",
    });
    await v2.table("terms").put({
      id: "en:dough",
      lang: "en",
      key: "dough",
      display: "dough",
      kind: "word",
      status: "learning",
      createdAt: 1,
      updatedAt: 1,
    });
    v2.close();

    const upgraded = openLingoDb(name);
    try {
      expect(await upgraded.terms.get("en:dough")).toMatchObject({
        status: "learning",
      });
      const upgradedCache = createTranslationCache(upgraded);
      await upgradedCache.put(EN_JA, [{ text: "dough", translated: "生地" }]);
      expect(await upgradedCache.get(EN_JA, ["dough"])).toEqual({
        dough: "生地",
      });
    } finally {
      await upgraded.delete();
    }
  });
});
