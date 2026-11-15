import { beforeEach, describe, expect, it } from "vitest";
import type { LingoDb } from "./db";
import {
  createExplanationCache,
  type ExplanationCache,
} from "./explanation-cache";
import type { ExplanationKey, KeptExplanation } from "../messaging/protocol";
import { fakeClock } from "../testing/clock";
import { freshDb } from "../testing/db";
import { testBackground } from "../testing/background";

const KEY: ExplanationKey = {
  learning: "en",
  native: "ja",
  key: "bank",
  sourceUrl: "https://example.com/river",
  sentence: "We sat on the bank.",
  provider: "chrome-prompt-api",
  version: "157",
};

const kept = (meaning: string, lines = 5): KeptExplanation => ({
  answer: { meaning, unusual: false, explanation: null, sense: null },
  lines,
});

let db: LingoDb;
let cache: ExplanationCache;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  clock = fakeClock();
  db = freshDb();
  cache = createExplanationCache(db, { now: clock.now });
});

describe("explanation cache", () => {
  it("gives back the answer and its line count, and nothing for another key", async () => {
    await cache.put(KEY, {
      answer: {
        meaning: "土手",
        unusual: true,
        explanation: "川のそばの土地。",
        sense: 2,
      },
      lines: 3,
    });
    expect(await cache.get(KEY)).toEqual({
      answer: {
        meaning: "土手",
        unusual: true,
        explanation: "川のそばの土地。",
        sense: 2,
      },
      lines: 3,
    });
    expect(await cache.get({ ...KEY, key: "banks" })).toBeUndefined();
  });

  it("keeps an answer per source, sentence, pair and model", async () => {
    await cache.put(KEY, kept("土手"));
    for (const other of [
      { sourceUrl: "https://example.com/money" },
      { sentence: "We sat on the bank again." },
      { native: "es" },
      { provider: "other" },
      { version: "158" },
    ])
      expect(await cache.get({ ...KEY, ...other })).toBeUndefined();
    await cache.put(
      { ...KEY, sourceUrl: "https://example.com/money" },
      kept("銀行"),
    );
    expect((await cache.get(KEY))?.answer.meaning).toBe("土手");
    expect(
      (await cache.get({ ...KEY, sourceUrl: "https://example.com/money" }))
        ?.answer.meaning,
    ).toBe("銀行");
  });

  it("replaces an answer put again", async () => {
    await cache.put(KEY, kept("土手"));
    clock.tick();
    await cache.put(KEY, kept("岸", 2));
    expect(await cache.get(KEY)).toEqual(kept("岸", 2));
    expect(await db.explanations.count()).toBe(1);
  });

  it("removes the least recently used answers past the limit", async () => {
    const small = createExplanationCache(db, { limit: 3, now: clock.now });
    const keyOf = (sentence: string) => ({ ...KEY, sentence });
    for (const sentence of ["a", "b", "c"]) {
      await small.put(keyOf(sentence), kept(sentence));
      clock.tick();
    }
    // "a" is read again, so "b" is now the least recently used.
    await small.get(keyOf("a"));
    clock.tick();
    await small.put(keyOf("d"), kept("d"));
    expect(await db.explanations.count()).toBe(3);
    expect(await small.get(keyOf("b"))).toBeUndefined();
    for (const sentence of ["a", "c", "d"])
      expect(await small.get(keyOf(sentence))).toEqual(kept(sentence));
  });

  it("keeps at most 5,000 answers by default", async () => {
    await db.explanations.bulkPut(
      Array.from({ length: 5_000 }, (_, i) => ({
        key: `old ${i}`,
        pair: "en>ja",
        ...kept("古い"),
        usedAt: clock.time - 1,
      })),
    );
    await cache.put(KEY, kept("土手"));
    expect(await db.explanations.count()).toBe(5_000);
    expect(await cache.get(KEY)).toEqual(kept("土手"));
  });

  it("clears one pair and keeps the others", async () => {
    await cache.put(KEY, kept("土手"));
    await cache.put({ ...KEY, native: "es" }, kept("orilla"));
    await cache.clearPair("en>ja");
    expect(await cache.get(KEY)).toBeUndefined();
    expect(await cache.get({ ...KEY, native: "es" })).toEqual(kept("orilla"));
  });
});

describe("explanation messages", () => {
  it("keep answers by the source's normalized URL and drop them with the pair's packs", async () => {
    const background = testBackground(
      { learningLang: "es", nativeLang: "en" },
      { storedPacks: ["en-es"] },
    );
    try {
      const key = { ...KEY, native: "es" };
      await background.send({
        type: "putExplanation",
        explanation: { ...key, sourceUrl: "https://example.com/river#part-2" },
        ...kept("orilla"),
      });
      expect(
        await background.send({ type: "getExplanation", explanation: key }),
      ).toEqual(kept("orilla"));
      expect(
        await background.send({
          type: "getExplanation",
          explanation: { ...key, sourceUrl: "https://example.com/other" },
        }),
      ).toBeNull();
      await background.send({ type: "removePack", pack: "en-es" });
      expect(
        await background.send({ type: "getExplanation", explanation: key }),
      ).toBeNull();
    } finally {
      await background.close();
    }
  });
});
