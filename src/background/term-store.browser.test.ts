import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLingoDb, type LingoDb } from "./db";
import {
  createTermStore,
  type LingoExport,
  type SaveTermInput,
  type SourceInput,
  type TermStore,
} from "./term-store";

const VIDEO: SourceInput = {
  platform: "youtube",
  url: "https://youtu.be/dQw4w9WgXcQ?si=share",
  title: "A video",
  lang: "en",
};
const ARTICLE: SourceInput = {
  platform: "web",
  url: "https://example.com/bread#top",
  title: "Bread",
  lang: "en",
};

const dough = (overrides: Partial<SaveTermInput> = {}): SaveTermInput => ({
  lang: "en",
  key: "dough",
  display: "dough",
  kind: "word",
  status: "learning",
  source: VIDEO,
  sentence: "Knead the dough.",
  translation: "生地をこねる。",
  pos: { timeMs: 12_000 },
  ...overrides,
});

const figureOut = (overrides: Partial<SaveTermInput> = {}): SaveTermInput =>
  dough({
    key: "figure out",
    display: "figured out",
    kind: "phrase",
    sentence: "She figured it out.",
    ...overrides,
  });

let db: LingoDb;
let store: TermStore;
let time: number;
const tick = (ms = 1000) => (time += ms);

beforeEach(() => {
  time = 1_000_000;
  db = openLingoDb(`lingo-test-${crypto.randomUUID()}`);
  let batch = 0;
  store = createTermStore(db, {
    now: () => time,
    newBatchId: () => `batch-${++batch}`,
  });
});

afterEach(async () => {
  await db.delete();
});

/** A second store on its own database, for import tests. */
async function withOtherStore(fn: (other: TermStore) => Promise<void>) {
  const otherDb = openLingoDb(`lingo-test-${crypto.randomUUID()}`);
  try {
    await fn(createTermStore(otherDb, { now: () => time }));
  } finally {
    await otherDb.delete();
  }
}

describe("saveTerm", () => {
  it("creates a term with the given status and the times of saving", async () => {
    const term = await store.saveTerm(dough());
    expect(term).toMatchObject({
      id: "en:dough",
      lang: "en",
      key: "dough",
      display: "dough",
      kind: "word",
      status: "learning",
      createdAt: time,
      updatedAt: time,
    });
    expect(await store.listTerms("en")).toEqual([term]);
  });

  it("refuses to save without a source", async () => {
    const input = dough();
    delete (input as Partial<SaveTermInput>).source;
    await expect(store.saveTerm(input)).rejects.toThrow(/source/);
    expect(await store.listTerms("en")).toEqual([]);
  });

  it("stores the source under its normalized URL", async () => {
    await store.saveTerm(dough());
    const [occurrence] = await store.occurrencesOf("en:dough");
    expect(occurrence!.source).toMatchObject({
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "A video",
      lang: "en",
      firstSeen: time,
      lastSeen: time,
    });
  });

  it("adds an occurrence marked as saved", async () => {
    await store.saveTerm(dough());
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      termId: "en:dough",
      sentence: "Knead the dough.",
      translation: "生地をこねる。",
      pos: { timeMs: 12_000 },
      seenAt: time,
      origin: "saved",
    });
  });

  it("updates an existing term and keeps its creation time", async () => {
    const created = time;
    await store.saveTerm(dough());
    tick();
    const term = await store.saveTerm(dough({ status: "known" }));
    expect(term).toMatchObject({
      status: "known",
      createdAt: created,
      updatedAt: time,
    });
  });

  it("keeps one source per page and updates when it was last seen", async () => {
    await store.saveTerm(dough());
    tick();
    await store.saveTerm(
      figureOut({ source: { ...VIDEO, url: VIDEO.url + "&t=3" } }),
    );
    const [doughSeen] = await store.occurrencesOf("en:dough");
    const [phraseSeen] = await store.occurrencesOf("en:figure out");
    expect(phraseSeen!.sourceId).toBe(doughSeen!.sourceId);
    expect(phraseSeen!.source.firstSeen).toBe(time - 1000);
    expect(phraseSeen!.source.lastSeen).toBe(time);
  });
});

describe("setStatus", () => {
  it("changes the status and the update time", async () => {
    await store.saveTerm(dough());
    tick();
    const term = await store.setStatus("en:dough", "known");
    expect(term).toMatchObject({ status: "known", updatedAt: time });
    expect((await store.termIndex("en")).get("dough")).toBe("known");
  });

  it("refuses an unknown term", async () => {
    await expect(store.setStatus("en:nothing", "known")).rejects.toThrow(
      /en:nothing/,
    );
  });
});

describe("removeTerm", () => {
  it("leaves a tombstone with the time of removal", async () => {
    await store.saveTerm(dough());
    tick();
    await store.removeTerm("en:dough");
    const all = await store.listTerms("en", { includeRemoved: true });
    expect(all).toEqual([
      expect.objectContaining({
        id: "en:dough",
        status: "removed",
        updatedAt: time,
      }),
    ]);
  });

  it("drops the term from the live list and the term index", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    expect(await store.listTerms("en")).toEqual([]);
    expect((await store.termIndex("en")).has("dough")).toBe(false);
  });

  it("leaves the tombstone out of the counts", async () => {
    await store.saveTerm(dough());
    await store.saveTerm(figureOut());
    await store.removeTerm("en:dough");
    await store.removeTerm("en:figure out");
    expect(await store.counts("en")).toEqual({
      learning: 0,
      known: 0,
      phrases: 0,
    });
  });

  it("deletes the term's occurrences", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    expect(await store.occurrencesOf("en:dough")).toEqual([]);
  });

  it("saves a removed term again as a new term", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    tick();
    const term = await store.saveTerm(dough());
    expect(term).toMatchObject({
      status: "learning",
      createdAt: time,
      updatedAt: time,
    });
  });
});

describe("recordEncounters", () => {
  it("records a saved term seen in another sentence", async () => {
    await store.saveTerm(dough());
    tick();
    const added = await store.recordEncounters(ARTICLE, [
      {
        termId: "en:dough",
        sentence: "The dough rises.",
        pos: { textQuote: "dough rises" },
      },
    ]);
    expect(added).toBe(1);
    const [newest] = await store.occurrencesOf("en:dough");
    expect(newest).toMatchObject({
      sentence: "The dough rises.",
      pos: { textQuote: "dough rises" },
      seenAt: time,
      origin: "encountered",
    });
    expect(newest!.source.url).toBe("https://example.com/bread");
  });

  it("ignores terms that are not saved", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    const added = await store.recordEncounters(ARTICLE, [
      { termId: "en:bread", sentence: "Bread.", pos: { textQuote: "Bread" } },
      { termId: "en:dough", sentence: "Dough.", pos: { textQuote: "Dough" } },
    ]);
    expect(added).toBe(0);
    expect(await store.occurrencesOf("en:bread")).toEqual([]);
    expect(await store.occurrencesOf("en:dough")).toEqual([]);
  });

  it("records the same sentence in the same source once", async () => {
    await store.saveTerm(dough());
    const item = {
      termId: "en:dough",
      sentence: "The dough rises.",
      pos: { textQuote: "dough rises" },
    };
    await store.recordEncounters(ARTICLE, [item]);
    tick();
    const added = await store.recordEncounters(ARTICLE, [item, item]);
    expect(added).toBe(0);
    expect(await store.occurrencesOf("en:dough")).toHaveLength(2);
  });

  it("does not record the sentence the term was saved from again", async () => {
    await store.saveTerm(dough());
    const added = await store.recordEncounters(VIDEO, [
      {
        termId: "en:dough",
        sentence: "Knead the dough.",
        pos: { timeMs: 12_000 },
      },
    ]);
    expect(added).toBe(0);
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences.map((o) => o.origin)).toEqual(["saved"]);
  });

  const encounter = (i: number) =>
    store.recordEncounters(ARTICLE, [
      {
        termId: "en:dough",
        sentence: `Sentence ${i}.`,
        pos: { textQuote: `${i}` },
      },
    ]);

  it("keeps the newest 50 occurrences of a term", async () => {
    await store.saveTerm(dough());
    for (let i = 1; i <= 55; i++) {
      tick();
      await encounter(i);
    }
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences).toHaveLength(50);
    expect(occurrences[0]!.sentence).toBe("Sentence 55.");
    expect(occurrences[48]!.sentence).toBe("Sentence 7.");
  });

  it("never drops the sentence a term was saved from to make room", async () => {
    await store.saveTerm(dough());
    for (let i = 1; i <= 55; i++) {
      tick();
      await encounter(i);
    }
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences).toHaveLength(50);
    expect(occurrences.at(-1)).toMatchObject({
      sentence: "Knead the dough.",
      origin: "saved",
    });
    expect(occurrences.filter((o) => o.origin === "encountered")).toHaveLength(
      49,
    );
  });

  it("keeps every saved sentence even when they fill the 50", async () => {
    for (let i = 1; i <= 51; i++) {
      tick();
      await store.saveTerm(dough({ sentence: `Saved ${i}.` }));
    }
    tick();
    await encounter(1);
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences).toHaveLength(51);
    expect(occurrences.every((o) => o.origin === "saved")).toBe(true);
  });
});

describe("occurrencesOf", () => {
  it("lists the newest first, each with its source", async () => {
    await store.saveTerm(dough());
    tick();
    await store.recordEncounters(ARTICLE, [
      { termId: "en:dough", sentence: "Later.", pos: { textQuote: "Later" } },
    ]);
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences.map((o) => [o.sentence, o.source.title])).toEqual([
      ["Later.", "Bread"],
      ["Knead the dough.", "A video"],
    ]);
  });
});

describe("saveAll", () => {
  it("creates bulk terms with the chosen status and counts them", async () => {
    const result = await store.saveAll(
      "en",
      ["dough", "loaf"],
      "known",
      ARTICLE,
    );
    expect(result).toEqual({ batchId: "batch-1", count: 2 });
    expect(await store.listTerms("en")).toEqual([
      expect.objectContaining({
        id: "en:dough",
        display: "dough",
        kind: "word",
        status: "known",
        bulk: true,
      }),
      expect.objectContaining({ id: "en:loaf", status: "known", bulk: true }),
    ]);
  });

  it("leaves terms that are already saved as they are", async () => {
    const saved = await store.saveTerm(dough());
    tick();
    const result = await store.saveAll(
      "en",
      ["dough", "loaf"],
      "known",
      ARTICLE,
    );
    expect(result.count).toBe(1);
    const [term] = await store.listTerms("en");
    expect(term).toEqual(saved);
  });

  it("makes a bulk term an ordinary one when it is saved by hand", async () => {
    await store.saveAll("en", ["dough"], "known", ARTICLE);
    tick();
    const term = await store.saveTerm(dough());
    expect(term.bulk).toBeUndefined();
  });

  it("counts a key given twice once", async () => {
    const result = await store.saveAll(
      "en",
      ["loaf", "loaf"],
      "learning",
      ARTICLE,
    );
    expect(result.count).toBe(1);
  });
});

describe("undoSaveAll", () => {
  it("removes the terms the batch created", async () => {
    const { batchId } = await store.saveAll(
      "en",
      ["loaf", "yeast"],
      "known",
      ARTICLE,
    );
    tick();
    expect(await store.undoSaveAll(batchId)).toBe(2);
    expect(await store.listTerms("en")).toEqual([]);
    expect(await store.counts("en")).toEqual({
      learning: 0,
      known: 0,
      phrases: 0,
    });
  });

  it("leaves terms saved before the batch alone", async () => {
    await store.saveTerm(dough());
    const { batchId } = await store.saveAll(
      "en",
      ["dough", "loaf"],
      "known",
      ARTICLE,
    );
    await store.undoSaveAll(batchId);
    expect((await store.listTerms("en")).map((t) => t.id)).toEqual([
      "en:dough",
    ]);
    expect((await store.termIndex("en")).get("dough")).toBe("learning");
  });

  it("leaves terms changed since the batch alone", async () => {
    const { batchId } = await store.saveAll(
      "en",
      ["loaf", "yeast"],
      "known",
      ARTICLE,
    );
    tick();
    await store.setStatus("en:loaf", "learning");
    expect(await store.undoSaveAll(batchId)).toBe(1);
    expect((await store.listTerms("en")).map((t) => t.id)).toEqual(["en:loaf"]);
  });

  it("leaves another batch's terms alone", async () => {
    const first = await store.saveAll("en", ["loaf"], "known", ARTICLE);
    await store.saveAll("en", ["yeast"], "known", ARTICLE);
    await store.undoSaveAll(first.batchId);
    expect((await store.listTerms("en")).map((t) => t.id)).toEqual([
      "en:yeast",
    ]);
  });
});

describe("counts", () => {
  it("counts learning and known words and phrases of either status", async () => {
    await store.saveTerm(dough());
    await store.saveTerm(
      dough({ key: "loaf", display: "loaf", status: "known" }),
    );
    await store.saveTerm(
      dough({ key: "yeast", display: "yeast", status: "known" }),
    );
    await store.saveTerm(figureOut());
    await store.saveTerm(figureOut({ key: "look up", status: "known" }));
    await store.saveTerm(dough({ lang: "fr", key: "pain", display: "pain" }));
    expect(await store.counts("en")).toEqual({
      learning: 1,
      known: 2,
      phrases: 2,
    });
  });
});

describe("termIndex", () => {
  it("maps the keys of live terms of one language to their status", async () => {
    await store.saveTerm(dough());
    await store.saveTerm(figureOut({ status: "known" }));
    await store.saveTerm(dough({ lang: "fr", key: "pain" }));
    expect(await store.termIndex("en")).toEqual(
      new Map([
        ["dough", "learning"],
        ["figure out", "known"],
      ]),
    );
  });

  it("gives the same map while nothing changes", async () => {
    await store.saveTerm(dough());
    const first = await store.termIndex("en");
    expect(await store.termIndex("en")).toBe(first);
  });

  it("gives a new map after a change", async () => {
    await store.saveTerm(dough());
    const before = await store.termIndex("en");
    await store.setStatus("en:dough", "known");
    const after = await store.termIndex("en");
    expect(after).not.toBe(before);
    expect(after.get("dough")).toBe("known");
  });
});

describe("onChange", () => {
  it("tells listeners which language changed after each change", async () => {
    const listener = vi.fn();
    store.onChange(listener);
    await store.saveTerm(dough());
    await store.setStatus("en:dough", "known");
    await store.saveAll("fr", ["pain"], "known", { ...ARTICLE, lang: "fr" });
    await store.removeTerm("en:dough");
    expect(listener.mock.calls).toEqual([
      ["en", "terms"],
      ["en", "terms"],
      ["fr", "terms"],
      ["en", "terms"],
    ]);
  });

  it("tells listeners when only occurrences changed", async () => {
    await store.saveTerm(dough());
    const listener = vi.fn();
    store.onChange(listener);
    await store.recordEncounters(ARTICLE, [
      { termId: "en:dough", sentence: "New.", pos: { textQuote: "New" } },
    ]);
    expect(listener.mock.calls).toEqual([["en", "occurrences"]]);
  });

  it("stays quiet when nothing changed", async () => {
    await store.saveTerm(dough());
    const listener = vi.fn();
    store.onChange(listener);
    await store.setStatus("en:dough", "learning");
    await store.saveAll("en", ["dough"], "known", ARTICLE);
    await store.recordEncounters(ARTICLE, [
      { termId: "en:bread", sentence: "Bread.", pos: { textQuote: "Bread" } },
    ]);
    await store.removeTerm("en:nothing");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops telling a listener once it unsubscribes", async () => {
    const listener = vi.fn();
    const unsubscribe = store.onChange(listener);
    unsubscribe();
    await store.saveTerm(dough());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("meta", () => {
  it("stores and reads back a value", async () => {
    expect(await store.getMeta("lastSavedAt")).toBeUndefined();
    await store.setMeta("lastSavedAt", 1234);
    expect(await store.getMeta("lastSavedAt")).toBe(1234);
  });
});

describe("exportJson", () => {
  it("writes every term, source and occurrence in the versioned format", async () => {
    await store.saveTerm(dough());
    const data = JSON.parse(await store.exportJson()) as LingoExport;
    expect(data).toMatchObject({
      format: "lingo-export",
      version: 1,
      exportedAt: time,
    });
    expect(data.terms.map((t) => t.id)).toEqual(["en:dough"]);
    expect(data.sources.map((s) => s.url)).toEqual([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]);
    expect(data.occurrences).toEqual([
      expect.objectContaining({ termId: "en:dough", origin: "saved" }),
    ]);
  });

  it("includes tombstones", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    const data = JSON.parse(await store.exportJson()) as LingoExport;
    expect(data.terms).toEqual([
      expect.objectContaining({ id: "en:dough", status: "removed" }),
    ]);
  });

  it("records the time of the export", async () => {
    await store.exportJson();
    expect(await store.getMeta("lastExportAt")).toBe(time);
  });
});

describe("importJson", () => {
  it("brings every term, source and occurrence into an empty store", async () => {
    await store.saveTerm(dough());
    await store.saveTerm(
      figureOut({ source: ARTICLE, pos: { textQuote: "x" } }),
    );
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      expect(await other.importJson(json)).toEqual({
        terms: 2,
        sources: 2,
        occurrences: 2,
      });
      expect(await other.listTerms("en")).toEqual(await store.listTerms("en"));
      expect(await other.occurrencesOf("en:dough")).toEqual(
        (await store.occurrencesOf("en:dough")).map((o) => ({
          ...o,
          id: expect.any(Number),
        })),
      );
    });
  });

  it("takes a term that is newer in the file", async () => {
    await withOtherStore(async (other) => {
      await other.saveTerm(dough());
      tick();
      await store.saveTerm(dough({ status: "known" }));
      await other.importJson(await store.exportJson());
      expect((await other.termIndex("en")).get("dough")).toBe("known");
    });
  });

  it("keeps a term that is newer here", async () => {
    await store.saveTerm(dough({ status: "known" }));
    const json = await store.exportJson();
    tick();
    await withOtherStore(async (other) => {
      await other.saveTerm(dough());
      expect((await other.importJson(json)).terms).toBe(0);
      expect((await other.termIndex("en")).get("dough")).toBe("learning");
    });
  });

  it("takes a newer removal from the file", async () => {
    await withOtherStore(async (other) => {
      await other.saveTerm(dough());
      await store.saveTerm(dough());
      tick();
      await store.removeTerm("en:dough");
      await other.importJson(await store.exportJson());
      expect(await other.listTerms("en")).toEqual([]);
      expect(await other.occurrencesOf("en:dough")).toEqual([]);
    });
  });

  it("does not bring back a term removed here after the file's version", async () => {
    await store.saveTerm(dough());
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      await other.saveTerm(dough());
      tick();
      await other.removeTerm("en:dough");
      await other.importJson(json);
      expect(await other.listTerms("en")).toEqual([]);
      expect(await other.occurrencesOf("en:dough")).toEqual([]);
    });
  });

  it("adds occurrences only once when the same file is imported twice", async () => {
    await store.saveTerm(dough());
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      await other.importJson(json);
      expect(await other.importJson(json)).toEqual({
        terms: 0,
        sources: 0,
        occurrences: 0,
      });
      expect(await other.occurrencesOf("en:dough")).toHaveLength(1);
    });
  });

  it("joins the occurrences of both copies of a term", async () => {
    await store.saveTerm(dough());
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      await other.saveTerm(dough({ source: ARTICLE, sentence: "Other." }));
      await other.importJson(json);
      const sentences = (await other.occurrencesOf("en:dough")).map(
        (o) => o.sentence,
      );
      expect(sentences.sort()).toEqual(["Knead the dough.", "Other."]);
    });
  });

  it("does not record an export", async () => {
    await store.saveTerm(dough());
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      await other.importJson(json);
      expect(await other.getMeta("lastExportAt")).toBeUndefined();
    });
  });

  it("tells listeners about each language it changed", async () => {
    await store.saveTerm(dough());
    await store.saveTerm(dough({ lang: "fr", key: "pain" }));
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      const listener = vi.fn();
      other.onChange(listener);
      await other.importJson(json);
      expect(listener.mock.calls.sort()).toEqual([
        ["en", "terms"],
        ["fr", "terms"],
      ]);
    });
  });

  it("rejects a file that is not a Lingo export", async () => {
    await expect(store.importJson('{"format":"other"}')).rejects.toThrow(
      /Lingo export/,
    );
  });

  it("rejects a damaged file", async () => {
    const json = JSON.stringify({
      format: "lingo-export",
      version: 1,
      exportedAt: 0,
      terms: [{ id: "en:x", lang: "en", key: "y" }],
      sources: [],
      occurrences: [],
    });
    await expect(store.importJson(json)).rejects.toThrow(/damaged/);
  });

  it("rejects a newer export version", async () => {
    const json = JSON.stringify({
      format: "lingo-export",
      version: 2,
      exportedAt: 0,
      terms: [],
      sources: [],
      occurrences: [],
    });
    await expect(store.importJson(json)).rejects.toThrow(/version/);
  });
});
