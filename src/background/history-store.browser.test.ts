import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeUrl, sourceId } from "../core/url";
import { openLingoDb, type LingoDb } from "./db";
import {
  createHistoryStore,
  type HistoryItem,
  type HistorySource,
  type HistoryStore,
} from "./history-store";

const ARTICLE: HistorySource = {
  platform: "web",
  url: "https://Example.com/bread?utm_source=x#top",
  title: "Bread",
  lang: "en",
};
const OTHER_ARTICLE: HistorySource = {
  platform: "web",
  url: "https://news.example.org/cake",
  title: "Cake",
  lang: "en",
};
const VIDEO: HistorySource = {
  platform: "youtube",
  url: "https://youtu.be/dQw4w9WgXcQ?si=share",
  title: "A video",
  lang: "en",
};

const knead: HistoryItem = {
  text: "Knead the dough well.",
  pos: { textQuote: "Knead the dough well." },
  keys: ["en:knead", "en:dough"],
};
const rest: HistoryItem = {
  text: "Let the dough rest.",
  translation: "生地を休ませる。",
  pos: { timeMs: 12_000 },
  keys: ["en:dough", "en:rest"],
};

/** The size the store counts for a sentence and for a page record. */
const sentenceBytes = (item: HistoryItem) =>
  2 *
    (item.text.length +
      (item.translation?.length ?? 0) +
      item.keys.reduce((sum, key) => sum + key.length, 0)) +
  64;
const pageBytes = (source: HistorySource) =>
  2 * (normalizeUrl(source.url).length + source.title.length) + 64;

const pageId = (source: HistorySource) =>
  sourceId(source.platform, normalizeUrl(source.url));

let db: LingoDb;
let history: HistoryStore;
let time: number;
const tick = (ms = 1000) => (time += ms);

function storeWithCap(capBytes: number) {
  return createHistoryStore(db, { now: () => time, capBytes });
}

beforeEach(() => {
  time = 1_000_000;
  db = openLingoDb(`lingo-test-${crypto.randomUUID()}`);
  history = createHistoryStore(db, { now: () => time });
});

afterEach(async () => {
  await db.delete();
});

describe("upgrade from version 1", () => {
  it("keeps terms, sources and occurrences and adds the history tables", async () => {
    const name = `lingo-test-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      terms: "id, lang, status, updatedAt, batchId, [lang+status]",
      sources: "id",
      occurrences:
        "++id, termId, &[termId+sourceId+sentence], [termId+seenAt], seenAt",
      meta: "key",
    });
    await v1.table("terms").put({
      id: "en:dough",
      lang: "en",
      key: "dough",
      display: "dough",
      kind: "word",
      status: "learning",
      createdAt: 1,
      updatedAt: 1,
    });
    await v1.table("sources").put({
      id: "s1",
      platform: "web",
      url: "https://example.com/",
      title: "Example",
      lang: "en",
      firstSeen: 1,
      lastSeen: 1,
    });
    await v1.table("occurrences").add({
      termId: "en:dough",
      sourceId: "s1",
      sentence: "Knead the dough.",
      pos: { textQuote: "Knead the dough." },
      seenAt: 1,
      origin: "saved",
    });
    await v1.table("meta").put({ key: "lastSavedAt", value: 1 });
    v1.close();

    const upgraded = openLingoDb(name);
    try {
      expect(await upgraded.terms.get("en:dough")).toMatchObject({
        status: "learning",
      });
      expect(await upgraded.sources.get("s1")).toMatchObject({
        title: "Example",
      });
      expect(await upgraded.occurrences.count()).toBe(1);
      expect(await upgraded.meta.get("lastSavedAt")).toMatchObject({
        value: 1,
      });
      const store = createHistoryStore(upgraded, { now: () => time });
      expect(await store.record(ARTICLE, [knead])).toBe(1);
      expect(await store.find("en:dough")).toHaveLength(1);
    } finally {
      await upgraded.delete();
    }
  });
});

describe("record", () => {
  it("keeps the page with its normalized url and lowercase host", async () => {
    await history.record(ARTICLE, [knead]);
    expect(await db.historyPages.get(pageId(ARTICLE))).toEqual({
      id: pageId(ARTICLE),
      platform: "web",
      url: "https://example.com/bread",
      host: "example.com",
      title: "Bread",
      lang: "en",
      firstSeen: 1_000_000,
      lastSeen: 1_000_000,
      bytes: pageBytes(ARTICLE) + sentenceBytes(knead),
    });
  });

  it("returns how many sentences it added and keeps each one once per page", async () => {
    expect(await history.record(ARTICLE, [knead, rest, knead])).toBe(2);
    tick();
    expect(await history.record(ARTICLE, [knead, rest])).toBe(0);
    expect(await db.historySentences.count()).toBe(2);
    // The same sentence on another page is kept for that page too.
    expect(await history.record(OTHER_ARTICLE, [knead])).toBe(1);
    expect(await db.historySentences.count()).toBe(3);
  });

  it("updates the last visit and title and keeps the first visit", async () => {
    await history.record(ARTICLE, [knead]);
    tick(5000);
    await history.record({ ...ARTICLE, title: "Bread, revised" }, [knead]);
    expect(await db.historyPages.get(pageId(ARTICLE))).toMatchObject({
      title: "Bread, revised",
      firstSeen: 1_000_000,
      lastSeen: 1_005_000,
    });
  });

  it("skips sentences without keys and keeps no page for them alone", async () => {
    expect(await history.record(ARTICLE, [{ ...knead, keys: [] }, rest])).toBe(
      1,
    );
    expect(await history.record(OTHER_ARTICLE, [{ ...knead, keys: [] }])).toBe(
      0,
    );
    expect(await db.historyPages.get(pageId(OTHER_ARTICLE))).toBeUndefined();
    expect((await history.status()).pages).toBe(1);
  });

  it("counts the size of pages and sentences once each", async () => {
    await history.record(ARTICLE, [knead]);
    await history.record(ARTICLE, [knead, rest]);
    await history.record(VIDEO, [rest]);
    const article =
      pageBytes(ARTICLE) + sentenceBytes(knead) + sentenceBytes(rest);
    const video = pageBytes(VIDEO) + sentenceBytes(rest);
    expect((await db.historyPages.get(pageId(ARTICLE)))?.bytes).toBe(article);
    expect((await db.historyPages.get(pageId(VIDEO)))?.bytes).toBe(video);
    expect((await history.status()).bytes).toBe(article + video);
  });
});

describe("eviction", () => {
  /** A source of its own with one sentence of a known size. */
  const page = (n: number): [HistorySource, HistoryItem[]] => [
    {
      platform: "web",
      url: `https://example.com/p${n}`,
      title: `P${n}`,
      lang: "en",
    },
    [
      {
        text: `Sentence ${n} `.padEnd(100, "x"),
        pos: { textQuote: "x" },
        keys: ["en:x"],
      },
    ],
  ];
  const size = (n: number) => {
    const [source, items] = page(n);
    return pageBytes(source) + sentenceBytes(items[0]!);
  };

  it("removes the oldest pages first until the total is at most 90 % of the cap", async () => {
    const cap = size(1) * 3 + 10;
    history = storeWithCap(cap);
    for (const n of [1, 2, 3]) {
      await history.record(...page(n));
      tick();
    }
    // Page 1 is visited again, so page 2 is now the oldest.
    await history.record(...page(1));
    tick();
    await history.record(...page(4));

    const status = await history.status();
    expect(status.bytes).toBeLessThanOrEqual(cap * 0.9);
    const urls = (await db.historyPages.toArray()).map((p) => p.url).sort();
    // Over the cap with four pages: 2 then 3 go (one is not enough for 90 %).
    expect(urls).toEqual(["https://example.com/p1", "https://example.com/p4"]);
    expect(status).toEqual({ bytes: size(1) + size(4), cap, pages: 2 });
    expect(await db.historySentences.count()).toBe(2);
  });

  it("keeps the page just recorded when it alone is over the cap", async () => {
    history = storeWithCap(size(1) + 10);
    await history.record(...page(1));
    tick();
    const [source] = page(2);
    const big: HistoryItem = {
      text: "y".repeat(500),
      pos: { textQuote: "y" },
      keys: ["en:y"],
    };
    await history.record(source, [big]);
    const pages = await db.historyPages.toArray();
    expect(pages.map((p) => p.url)).toEqual(["https://example.com/p2"]);
    expect((await history.status()).bytes).toBe(
      pageBytes(source) + sentenceBytes(big),
    );
  });
});

describe("find", () => {
  it("returns the sentences with the term, newest first, joined with their page", async () => {
    await history.record(ARTICLE, [knead]);
    tick();
    await history.record(VIDEO, [rest]);
    tick();
    await history.record(OTHER_ARTICLE, [{ ...knead, keys: ["en:knead"] }]);

    expect(await history.find("en:dough")).toEqual([
      {
        text: rest.text,
        translation: rest.translation,
        pos: rest.pos,
        seenAt: 1_001_000,
        page: {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "A video",
          lang: "en",
        },
      },
      {
        text: knead.text,
        pos: knead.pos,
        seenAt: 1_000_000,
        page: {
          platform: "web",
          url: "https://example.com/bread",
          title: "Bread",
          lang: "en",
        },
      },
    ]);
    expect(await history.find("en:missing")).toEqual([]);
  });

  it("leaves out the page with the excluded url, in any form", async () => {
    await history.record(ARTICLE, [knead]);
    tick();
    await history.record(VIDEO, [rest]);
    const found = await history.find("en:dough", {
      excludeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    });
    expect(found.map((s) => s.text)).toEqual([knead.text]);
  });

  it("returns at most `limit` sentences, 50 by default", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      text: `Dough number ${i}.`,
      pos: { textQuote: `${i}` },
      keys: ["en:dough"],
    }));
    for (const item of items) {
      await history.record(ARTICLE, [item]);
      tick();
    }
    const all = await history.find("en:dough");
    expect(all).toHaveLength(50);
    expect(all[0]?.text).toBe("Dough number 59.");
    const three = await history.find("en:dough", { limit: 3 });
    expect(three.map((s) => s.text)).toEqual([
      "Dough number 59.",
      "Dough number 58.",
      "Dough number 57.",
    ]);
  });

  it("returns only the newest `limit` of many matches, after leaving out the excluded page", async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      text: `Dough on the other page ${i}.`,
      pos: { textQuote: `${i}` },
      keys: ["en:dough"],
    }));
    await history.record(OTHER_ARTICLE, many);
    tick();
    await history.record(VIDEO, [rest]);
    tick();
    // The newest sentences are on the excluded page: they must not use up the limit.
    await history.record(
      ARTICLE,
      Array.from({ length: 80 }, (_, i) => ({
        text: `Dough here ${i}.`,
        pos: { textQuote: `${i}` },
        keys: ["en:dough"],
      })),
    );

    const found = await history.find("en:dough", {
      excludeUrl: ARTICLE.url,
      limit: 5,
    });
    expect(found.map((s) => s.text)).toEqual([
      rest.text,
      "Dough on the other page 119.",
      "Dough on the other page 118.",
      "Dough on the other page 117.",
      "Dough on the other page 116.",
    ]);
    expect(await history.find("en:dough", { limit: 7 })).toHaveLength(7);
  });
});

describe("status", () => {
  it("is empty at first", async () => {
    expect(await history.status()).toEqual({
      bytes: 0,
      cap: 50 * 1024 * 1024,
      pages: 0,
    });
  });
});

describe("clear", () => {
  it("removes every page and sentence and sets the total to 0", async () => {
    await history.record(ARTICLE, [knead]);
    await history.record(VIDEO, [rest]);
    await history.clear();
    expect(await history.status()).toMatchObject({ bytes: 0, pages: 0 });
    expect(await db.historySentences.count()).toBe(0);
    expect(await history.find("en:dough")).toEqual([]);
  });
});

describe("forgetHost", () => {
  it("removes the pages of the host and its subdomains and subtracts their size", async () => {
    await history.record(ARTICLE, [knead]);
    await history.record({ ...ARTICLE, url: "https://blog.example.com/rye" }, [
      rest,
    ]);
    await history.record(OTHER_ARTICLE, [knead]);
    await history.record({ ...ARTICLE, url: "https://notexample.com/x" }, [
      rest,
    ]);

    await history.forgetHost("Example.com");

    const urls = (await db.historyPages.toArray()).map((p) => p.url).sort();
    expect(urls).toEqual([
      "https://news.example.org/cake",
      "https://notexample.com/x",
    ]);
    const kept =
      pageBytes(OTHER_ARTICLE) +
      sentenceBytes(knead) +
      pageBytes({ ...ARTICLE, url: "https://notexample.com/x" }) +
      sentenceBytes(rest);
    expect((await history.status()).bytes).toBe(kept);
    expect(await db.historySentences.count()).toBe(2);
  });

  it("returns how many pages it removed, and changes nothing for a host with none", async () => {
    await history.record(ARTICLE, [knead]);
    await history.record({ ...ARTICLE, url: "https://www.example.com/rye" }, [
      rest,
    ]);
    await history.record(OTHER_ARTICLE, [knead]);
    const before = await history.status();

    expect(await history.forgetHost("example.net")).toBe(0);
    expect(await history.status()).toEqual(before);

    expect(await history.forgetHost(" EXAMPLE.com ")).toBe(2);
    expect((await db.historyPages.toArray()).map((p) => p.url)).toEqual([
      "https://news.example.org/cake",
    ]);
  });
});
