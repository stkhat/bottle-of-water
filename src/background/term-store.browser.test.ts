import { beforeEach, describe, expect, it, vi } from "vitest";
import { meaningKey, type Meaning } from "../core/meanings";
import type { SyncRecord } from "../core/sync/codec";
import { omit } from "../core/util";
import type {
  ChooseMeaningInput,
  SaveTermInput,
  SourceInput,
} from "../messaging/protocol";
import type { LangleDb } from "./db";
import {
  createTermStore,
  type LangleExport,
  type TermStore,
} from "./term-store";
import { fakeClock } from "../testing/clock";
import { freshDb } from "../testing/db";
import { ARTICLE as BREAD, VIDEO } from "../testing/sources";

const ARTICLE: SourceInput = { ...BREAD, url: "https://example.com/bread#top" };

/** A file of export version 2: occurrences without `deviceId` and `addedAt`. */
type ExportV2 = Omit<LangleExport, "version" | "occurrences"> & {
  version: 2;
  occurrences: Omit<
    LangleExport["occurrences"][number],
    "deviceId" | "addedAt"
  >[];
};

/** A file of export version 1: no meanings and no meaning choices either. */
type ExportV1 = Omit<ExportV2, "version" | "meanings" | "meaningChoices"> & {
  version: 1;
};

/** `data` as an older version wrote it. */
function asVersion(data: LangleExport, version: 1): ExportV1;
function asVersion(data: LangleExport, version: 2): ExportV2;
function asVersion(data: LangleExport, version: 1 | 2): ExportV1 | ExportV2 {
  const occurrences = data.occurrences.map((o) =>
    omit(o, "deviceId", "addedAt"),
  );
  const terms = data.terms.map((t) => omit(t, "clearedAt"));
  return version === 2
    ? { ...data, version, terms, occurrences }
    : {
        ...omit(data, "meanings", "meaningChoices"),
        version,
        terms,
        occurrences,
      };
}

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

let db: LangleDb;
let store: TermStore;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  clock = fakeClock();
  db = freshDb();
  let batch = 0;
  store = createTermStore(db, {
    now: clock.now,
    newBatchId: () => `batch-${++batch}`,
    deviceId: () => Promise.resolve("this-device"),
  });
});

/** A second store on its own database, for import tests. */
async function withOtherStore(fn: (other: TermStore) => Promise<void>) {
  await fn(
    createTermStore(freshDb(), {
      now: clock.now,
      deviceId: () => Promise.resolve("other-device"),
    }),
  );
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
      createdAt: clock.time,
      updatedAt: clock.time,
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
      firstSeen: clock.time,
      lastSeen: clock.time,
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
      seenAt: clock.time,
      origin: "saved",
    });
  });

  it("updates an existing term and keeps its creation time", async () => {
    const created = clock.time;
    await store.saveTerm(dough());
    clock.tick();
    const term = await store.saveTerm(dough({ status: "known" }));
    expect(term).toMatchObject({
      status: "known",
      createdAt: created,
      updatedAt: clock.time,
    });
  });

  it("keeps one source per page and updates when it was last seen", async () => {
    await store.saveTerm(dough());
    clock.tick();
    await store.saveTerm(
      figureOut({ source: { ...VIDEO, url: VIDEO.url + "&t=3" } }),
    );
    const [doughSeen] = await store.occurrencesOf("en:dough");
    const [phraseSeen] = await store.occurrencesOf("en:figure out");
    expect(phraseSeen!.sourceId).toBe(doughSeen!.sourceId);
    expect(phraseSeen!.source.firstSeen).toBe(clock.time - 1000);
    expect(phraseSeen!.source.lastSeen).toBe(clock.time);
  });
});

describe("setStatus", () => {
  it("changes the status and the update time", async () => {
    await store.saveTerm(dough());
    clock.tick();
    const term = await store.setStatus("en:dough", "known");
    expect(term).toMatchObject({ status: "known", updatedAt: clock.time });
    expect((await store.termIndex("en")).get("dough")).toBe("known");
  });

  it("refuses an unknown term", async () => {
    await expect(store.setStatus("en:nothing", "known")).rejects.toThrow(
      /en:nothing/,
    );
  });
});

describe("learnedAt", () => {
  const learnedAt = async () => (await store.listTerms("en"))[0]?.learnedAt;

  it("is set when a learning term becomes known, by status or by saving", async () => {
    await store.saveTerm(dough());
    clock.tick();
    await store.setStatus("en:dough", "known");
    expect(await learnedAt()).toBe(clock.time);

    await store.saveTerm(figureOut());
    clock.tick();
    await store.saveTerm(figureOut({ status: "known" }));
    expect((await store.listTerms("en"))[1]!.learnedAt).toBe(clock.time);
  });

  it("is not set for a term known from the start, by hand or by save all", async () => {
    await store.saveTerm(dough({ status: "known" }));
    await store.saveAll("en", ["bread"], "known", ARTICLE);
    expect((await store.listTerms("en")).map((t) => t.learnedAt)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("stays when a learned term is saved as known again", async () => {
    await store.saveTerm(dough());
    clock.tick();
    await store.setStatus("en:dough", "known");
    const learned = clock.time;
    clock.tick();
    await store.saveTerm(dough({ status: "known", sentence: "More dough." }));
    expect(await learnedAt()).toBe(learned);
  });

  it("goes when the term goes back to learning, and comes back with the new date", async () => {
    await store.saveTerm(dough());
    await store.setStatus("en:dough", "known");
    clock.tick();
    await store.setStatus("en:dough", "learning");
    expect(await learnedAt()).toBeUndefined();
    clock.tick();
    await store.setStatus("en:dough", "known");
    expect(await learnedAt()).toBe(clock.time);
  });

  it("comes for a term known from the start once it goes through learning", async () => {
    await store.saveTerm(dough({ status: "known" }));
    await store.setStatus("en:dough", "learning");
    clock.tick();
    await store.setStatus("en:dough", "known");
    expect(await learnedAt()).toBe(clock.time);
  });

  it("goes with a removal, and a term saved again as known is not learned", async () => {
    await store.saveTerm(dough());
    await store.setStatus("en:dough", "known");
    await store.removeTerm("en:dough");
    const [tombstone] = await store.listTerms("en", { includeRemoved: true });
    expect(tombstone!.learnedAt).toBeUndefined();
    await store.saveTerm(dough({ status: "known" }));
    expect(await learnedAt()).toBeUndefined();
  });
});

describe("removeTerm", () => {
  it("leaves a tombstone with the time of removal", async () => {
    await store.saveTerm(dough());
    clock.tick();
    await store.removeTerm("en:dough");
    const all = await store.listTerms("en", { includeRemoved: true });
    expect(all).toEqual([
      expect.objectContaining({
        id: "en:dough",
        status: "removed",
        updatedAt: clock.time,
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
    clock.tick();
    const term = await store.saveTerm(dough());
    expect(term).toMatchObject({
      status: "learning",
      createdAt: clock.time,
      updatedAt: clock.time,
    });
  });
});

describe("recordEncounters", () => {
  it("records a saved term seen in another sentence", async () => {
    await store.saveTerm(dough());
    clock.tick();
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
      seenAt: clock.time,
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
    clock.tick();
    const added = await store.recordEncounters(ARTICLE, [item, item]);
    expect(added).toBe(0);
    expect(await store.occurrencesOf("en:dough")).toHaveLength(2);
  });

  it("records a sentence given twice in one batch once, among other terms", async () => {
    await store.saveTerm(dough());
    await store.saveTerm(figureOut());
    const item = {
      termId: "en:dough",
      sentence: "The dough rises.",
      pos: { textQuote: "dough rises" },
    };
    const added = await store.recordEncounters(ARTICLE, [
      item,
      { termId: "en:bread", sentence: "Bread.", pos: { textQuote: "Bread" } },
      {
        termId: "en:figure out",
        sentence: "The dough rises.",
        pos: { textQuote: "rises" },
      },
      item,
    ]);
    expect(added).toBe(2);
    expect(await store.occurrencesOf("en:dough")).toHaveLength(2);
    expect(await store.occurrencesOf("en:figure out")).toHaveLength(2);
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
      clock.tick();
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
      clock.tick();
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
      clock.tick();
      await store.saveTerm(dough({ sentence: `Saved ${i}.` }));
    }
    clock.tick();
    await encounter(1);
    const occurrences = await store.occurrencesOf("en:dough");
    expect(occurrences).toHaveLength(51);
    expect(occurrences.every((o) => o.origin === "saved")).toBe(true);
  });
});

describe("importOccurrences", () => {
  const row = (title: string, sentence: string, seenAt: number) => ({
    source: { ...ARTICLE, title },
    sentence,
    pos: { textQuote: sentence },
    seenAt,
  });

  it("brings rows of one source in turn: its times widen, the newest title wins", async () => {
    await store.saveTerm(dough());
    const at = clock.time;
    const added = await store.importOccurrences("en:dough", [
      row("Old title", "First.", at - 5000),
      row("Newer title", "Second.", at - 1000),
      row("", "Third.", at - 3000),
      row("Oldest title", "First.", at - 9000),
    ]);
    expect(added).toBe(3);
    const [source] = await db.sources
      .filter((s) => s.platform === "web")
      .toArray();
    expect(source).toMatchObject({
      title: "Newer title",
      firstSeen: at - 9000,
      lastSeen: at - 1000,
    });
    expect(
      (await store.occurrencesOf("en:dough")).map((o) => o.sentence),
    ).toEqual(["Knead the dough.", "Second.", "Third.", "First."]);
  });
});

describe("occurrencesOf", () => {
  it("lists the newest first, each with its source", async () => {
    await store.saveTerm(dough());
    clock.tick();
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

describe("occurrenceStats", () => {
  it("counts each term's occurrences of a language and when it was last seen", async () => {
    await store.saveTerm(dough());
    const savedAt = clock.time;
    await store.saveTerm(figureOut());
    clock.tick();
    await store.recordEncounters(ARTICLE, [
      { termId: "en:dough", sentence: "Later.", pos: { textQuote: "Later" } },
    ]);
    await store.saveTerm(
      dough({ lang: "fr", key: "pâte", display: "pâte", sentence: "La pâte." }),
    );
    const stats = await store.occurrenceStats("en");
    expect(stats).toEqual(
      new Map([
        ["en:dough", { count: 2, lastSeen: clock.time }],
        ["en:figure out", { count: 1, lastSeen: savedAt }],
      ]),
    );
  });

  it("leaves out terms without occurrences", async () => {
    await store.saveAll("en", ["loaf"], "learning", ARTICLE);
    expect(await store.occurrenceStats("en")).toEqual(new Map());
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
    clock.tick();
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
    clock.tick();
    const term = await store.saveTerm(dough());
    expect(term.bulk).toBeUndefined();
  });

  it("saves a removed term again as a bulk term", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    clock.tick();
    const { count } = await store.saveAll(
      "en",
      ["dough", "crust"],
      "known",
      ARTICLE,
    );
    expect(count).toBe(2);
    expect(await store.listTerms("en")).toMatchObject([
      { key: "crust", status: "known", bulk: true, createdAt: clock.time },
      { key: "dough", status: "known", bulk: true, createdAt: clock.time },
    ]);
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
    clock.tick();
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
    clock.tick();
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
      ["en", "terms", "local"],
      ["en", "terms", "local"],
      ["fr", "terms", "local"],
      ["en", "terms", "local"],
    ]);
  });

  it("tells listeners when only occurrences changed", async () => {
    await store.saveTerm(dough());
    const listener = vi.fn();
    store.onChange(listener);
    await store.recordEncounters(ARTICLE, [
      { termId: "en:dough", sentence: "New.", pos: { textQuote: "New" } },
    ]);
    expect(listener.mock.calls).toEqual([["en", "occurrences", "local"]]);
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

describe("applySynced", () => {
  const MIN = 60_000;
  const synced = (
    key: string,
    status: SyncRecord["status"],
    updatedMinutes: number,
  ): SyncRecord => ({ key, status, updatedMinutes });

  it("creates terms it does not have, with no source", async () => {
    const count = await store.applySynced("en", [
      synced("dough", "learning", 100),
      synced("figure out", "known", 101),
    ]);
    expect(count).toBe(2);
    expect(await store.listTerms("en")).toEqual([
      {
        id: "en:dough",
        lang: "en",
        key: "dough",
        display: "dough",
        kind: "word",
        status: "learning",
        createdAt: 100 * MIN,
        updatedAt: 100 * MIN,
      },
      {
        id: "en:figure out",
        lang: "en",
        key: "figure out",
        display: "figure out",
        kind: "phrase",
        status: "known",
        createdAt: 101 * MIN,
        updatedAt: 101 * MIN,
      },
    ]);
    expect(await store.occurrencesOf("en:dough")).toEqual([]);
  });

  it("changes the status of an older local term and keeps the rest", async () => {
    clock.time = 100 * MIN;
    await store.saveTerm(figureOut());
    await store.applySynced("en", [synced("figure out", "known", 101)]);
    const [term] = await store.listTerms("en");
    expect(term).toMatchObject({
      display: "figured out",
      status: "known",
      createdAt: 100 * MIN,
      updatedAt: 101 * MIN,
    });
    expect(await store.occurrencesOf("en:figure out")).toHaveLength(1);
  });

  it("leaves a local term that is as new or newer alone", async () => {
    clock.time = 100 * MIN + 30_000;
    await store.saveTerm(dough());
    const count = await store.applySynced("en", [
      synced("dough", "known", 100),
    ]);
    expect(count).toBe(0);
    expect((await store.listTerms("en"))[0]).toMatchObject({
      status: "learning",
      updatedAt: clock.time,
    });
  });

  it("removes a term, its occurrences and its bulk mark", async () => {
    clock.time = 100 * MIN;
    await store.saveTerm(dough());
    await store.saveAll("en", ["bread"], "known", ARTICLE);
    await store.applySynced("en", [
      synced("dough", "removed", 101),
      synced("bread", "removed", 101),
    ]);
    expect(await store.listTerms("en")).toEqual([]);
    const tombstones = await store.listTerms("en", { includeRemoved: true });
    expect(tombstones.map((t) => [t.key, t.status, t.updatedAt])).toEqual([
      ["bread", "removed", 101 * MIN],
      ["dough", "removed", 101 * MIN],
    ]);
    expect(tombstones[0]).not.toHaveProperty("bulk");
    expect(await store.occurrencesOf("en:dough")).toEqual([]);
  });

  it("keeps a removal it did not know as a tombstone", async () => {
    await store.applySynced("en", [synced("crust", "removed", 50)]);
    expect(await store.listTerms("en")).toEqual([]);
    expect(await store.listTerms("en", { includeRemoved: true })).toMatchObject(
      [{ key: "crust", status: "removed", updatedAt: 50 * MIN }],
    );
  });

  it("brings a removed term back when the synced version is newer", async () => {
    clock.time = 100 * MIN;
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    await store.applySynced("en", [synced("dough", "known", 101)]);
    expect(await store.listTerms("en")).toMatchObject([
      { key: "dough", status: "known", createdAt: 101 * MIN },
    ]);
  });

  it("makes a synced change to a bulk term an ordinary one", async () => {
    clock.time = 100 * MIN;
    await store.saveAll("en", ["bread"], "learning", ARTICLE);
    await store.applySynced("en", [synced("bread", "known", 101)]);
    const [term] = await store.listTerms("en");
    expect(term).not.toHaveProperty("bulk");
    expect(term).not.toHaveProperty("batchId");
  });

  it("applies several records of one key in turn", async () => {
    clock.time = 100 * MIN;
    await store.saveTerm(dough());
    const count = await store.applySynced("en", [
      synced("dough", "removed", 101),
      synced("dough", "learning", 103),
      synced("dough", "known", 102),
    ]);
    expect(count).toBe(2);
    expect(await store.listTerms("en")).toEqual([
      {
        id: "en:dough",
        lang: "en",
        key: "dough",
        display: "dough",
        kind: "word",
        status: "learning",
        createdAt: 103 * MIN,
        updatedAt: 103 * MIN,
        // The removal in between: its occurrences never come back.
        clearedAt: 101 * MIN,
      },
    ]);
    expect(await store.occurrencesOf("en:dough")).toEqual([]);
  });

  it("marks a term learned from the record, at the record's time", async () => {
    await store.applySynced("en", [
      { ...synced("dough", "known", 100), learned: true },
    ]);
    expect((await store.listTerms("en"))[0]!.learnedAt).toBe(100 * MIN);
  });

  it("keeps the local learned time when the term is learned here already", async () => {
    clock.time = 99 * MIN;
    await store.saveTerm(dough());
    clock.time = 100 * MIN;
    await store.setStatus("en:dough", "known");
    await store.applySynced("en", [
      { ...synced("dough", "known", 105), learned: true },
    ]);
    expect((await store.listTerms("en"))[0]).toMatchObject({
      learnedAt: 100 * MIN,
      updatedAt: 105 * MIN,
    });
  });

  it("drops the learned mark when the record has none", async () => {
    clock.time = 100 * MIN;
    await store.saveTerm(dough());
    await store.setStatus("en:dough", "known");
    await store.applySynced("en", [synced("dough", "known", 105)]);
    expect((await store.listTerms("en"))[0]!.learnedAt).toBeUndefined();
  });

  it("tells listeners the change came from sync", async () => {
    const listener = vi.fn();
    store.onChange(listener);
    await store.applySynced("en", [synced("dough", "known", 1)]);
    await store.applySynced("en", [synced("dough", "known", 1)]);
    expect(listener.mock.calls).toEqual([["en", "terms", "sync"]]);
  });
});

describe("languages", () => {
  it("lists the languages that have terms or tombstones", async () => {
    expect(await store.languages()).toEqual([]);
    await store.saveTerm(dough());
    await store.saveTerm(dough({ lang: "fr", key: "pain" }));
    await store.removeTerm("fr:pain");
    expect(await store.languages()).toEqual(["en", "fr"]);
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
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    expect(data).toMatchObject({
      format: "langle-export",
      version: 3,
      exportedAt: clock.time,
      meanings: [],
      meaningChoices: [],
    });
    expect(data.terms.map((t) => t.id)).toEqual(["en:dough"]);
    expect(data.sources.map((s) => s.url)).toEqual([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]);
    expect(data.occurrences).toEqual([
      expect.objectContaining({
        termId: "en:dough",
        origin: "saved",
        deviceId: "this-device",
        addedAt: expect.any(Number),
      }),
    ]);
  });

  it("includes tombstones with the time they were cleared", async () => {
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    expect(data.terms).toEqual([
      expect.objectContaining({
        id: "en:dough",
        status: "removed",
        clearedAt: expect.any(Number),
      }),
    ]);
  });

  it("records the time of the export", async () => {
    await store.exportJson();
    expect(await store.getMeta("lastExportAt")).toBe(clock.time);
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

  it("carries the learned time", async () => {
    await store.saveTerm(dough());
    clock.tick();
    await store.setStatus("en:dough", "known");
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      await other.importJson(json);
      expect((await other.listTerms("en"))[0]!.learnedAt).toBe(clock.time);
    });
  });

  it("drops a learned time on a term that is not known", async () => {
    await store.saveTerm(dough());
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    data.terms[0]!.learnedAt = clock.time;
    await withOtherStore(async (other) => {
      await other.importJson(JSON.stringify(data));
      expect((await other.listTerms("en"))[0]!.learnedAt).toBeUndefined();
    });
  });

  it("rejects a learned time that is not a number", async () => {
    await store.saveTerm(dough({ status: "known" }));
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    (data.terms[0] as unknown as Record<string, unknown>).learnedAt = "soon";
    await expect(store.importJson(JSON.stringify(data))).rejects.toThrow();
  });

  it("takes a term that is newer in the file", async () => {
    await withOtherStore(async (other) => {
      await other.saveTerm(dough());
      clock.tick();
      await store.saveTerm(dough({ status: "known" }));
      await other.importJson(await store.exportJson());
      expect((await other.termIndex("en")).get("dough")).toBe("known");
    });
  });

  it("keeps a term that is newer here", async () => {
    await store.saveTerm(dough({ status: "known" }));
    const json = await store.exportJson();
    clock.tick();
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
      clock.tick();
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
      clock.tick();
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

  it("takes the terms and sources of a file in turn when one comes twice", async () => {
    clock.time = 100;
    await store.saveTerm(dough());
    const source = (await db.sources.toArray())[0]!;
    const term = (await store.listTerms("en"))[0]!;
    // Version 1: no meanings.
    const file: ExportV1 = {
      format: "langle-export",
      version: 1,
      exportedAt: 1000,
      terms: [
        { ...term, status: "removed", updatedAt: 200 },
        { ...term, status: "known", updatedAt: 300 },
        { ...term, status: "learning", updatedAt: 250 },
        { ...term, id: "en:crust", key: "crust", display: "crust" },
      ],
      sources: [
        { ...source, id: "web:x", title: "Old", firstSeen: 50, lastSeen: 60 },
        { ...source, id: "web:x", title: "New", firstSeen: 40, lastSeen: 90 },
        { ...source, id: "web:x", title: "Older", firstSeen: 70, lastSeen: 80 },
        { ...source, title: "Renamed", lastSeen: 500 },
      ],
      occurrences: [
        {
          termId: "en:dough",
          sourceId: "web:x",
          sentence: "From the file.",
          pos: { textQuote: "file" },
          seenAt: 400,
          origin: "encountered",
        },
        {
          termId: "en:dough",
          sourceId: "web:x",
          sentence: "From the file.",
          pos: { textQuote: "file" },
          seenAt: 450,
          origin: "encountered",
        },
        {
          termId: "en:crust",
          sourceId: "web:missing",
          sentence: "No source.",
          pos: { textQuote: "x" },
          seenAt: 400,
          origin: "encountered",
        },
      ],
    };
    expect(await store.importJson(JSON.stringify(file))).toEqual({
      terms: 3,
      sources: 1,
      occurrences: 1,
    });
    expect(
      (await store.listTerms("en")).map((t) => [t.key, t.status, t.updatedAt]),
    ).toEqual([
      ["crust", "learning", 100],
      ["dough", "known", 300],
    ]);
    expect(await db.sources.get("web:x")).toMatchObject({
      title: "New",
      firstSeen: 40,
      lastSeen: 90,
    });
    expect(await db.sources.get(source.id)).toMatchObject({
      title: "Renamed",
      lastSeen: 500,
    });
    // The removal in between took the term's occurrences.
    expect(
      (await store.occurrencesOf("en:dough")).map((o) => o.sentence),
    ).toEqual(["From the file."]);
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
        ["en", "terms", "local"],
        ["fr", "terms", "local"],
      ]);
    });
  });

  it("rejects a file that is not a Langle export", async () => {
    await expect(store.importJson('{"format":"other"}')).rejects.toThrow(
      /Langle export/,
    );
  });

  it("imports a file exported before the rename to Langle", async () => {
    await store.saveTerm(dough());
    const term = (await store.listTerms("en"))[0]!;
    const json = JSON.stringify({
      format: "lingo-export",
      version: 1,
      exportedAt: 0,
      terms: [{ ...term, id: "en:crust", key: "crust", display: "crust" }],
      sources: [],
      occurrences: [],
    });
    await store.importJson(json);
    expect((await store.listTerms("en")).map((t) => t.key).sort()).toEqual([
      "crust",
      "dough",
    ]);
  });

  it("rejects a damaged file", async () => {
    const json = JSON.stringify({
      format: "langle-export",
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
      format: "langle-export",
      version: 4,
      exportedAt: 0,
      terms: [],
      sources: [],
      occurrences: [],
      meanings: [],
      meaningChoices: [],
    });
    await expect(store.importJson(json)).rejects.toThrow(/version/);
  });

  it("rejects a version 2 file without its meanings, or with damaged ones", async () => {
    await store.saveTerm(dough());
    await store.chooseMeaning(choose(PIECE));
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    const damaged = [
      { ...data, meanings: undefined },
      { ...data, meaningChoices: [{ ...data.meaningChoices[0], at: "now" }] },
      { ...data, meanings: [{ ...data.meanings[0], from: "web" }] },
      // A key that is not the meaning's hash.
      { ...data, meanings: [{ ...data.meanings[0], text: "別の意味" }] },
    ];
    for (const file of damaged)
      await expect(store.importJson(JSON.stringify(file))).rejects.toThrow(
        /damaged/,
      );
  });
});

/** The dictionary's meanings of "dough" for the tests below. */
const PIECE = { from: "dictionary", text: "パン生地", pos: "noun" } as const;
const MASS = { from: "dictionary", text: "練り粉", pos: "noun" } as const;
const MONEY = {
  from: "dictionary",
  text: "Money.",
  pos: "noun",
  glossLang: "en",
} as const;
const AI = {
  from: "ai",
  text: "（パン作りの）生地",
  explanation: "パン作りで、粉と水を練ったもの。",
} as const;

/** Chooses `meaning` for a sentence of dough (by default the one `dough()` saves). */
const choose = (
  meaning: Meaning | null,
  overrides: Partial<SaveTermInput> = {},
): ChooseMeaningInput => {
  const term = omit(dough(overrides), "status");
  return { term, meaning };
};

describe("chooseMeaning", () => {
  it("chooses a meaning for a saved term's sentence", async () => {
    await store.saveTerm(dough());
    clock.tick();
    const term = await store.chooseMeaning(choose(PIECE));
    expect(term).toMatchObject({ id: "en:dough", status: "learning" });
    const { meanings, choices } = await store.meaningsOf("en:dough");
    expect(meanings).toEqual([
      {
        ...PIECE,
        key: await meaningKey("en:dough", "dictionary", "パン生地"),
        termId: "en:dough",
        createdAt: clock.time,
      },
    ]);
    expect(choices).toEqual([
      {
        termId: "en:dough",
        sourceId: (await db.sources.toArray())[0]!.id,
        sentence: "Knead the dough.",
        meaningKey: meanings[0]!.key,
        at: clock.time,
        deviceId: expect.any(String),
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ]);
  });

  it("reads the meanings of several terms at once, leaving out terms without one", async () => {
    await store.saveTerm(dough());
    await store.chooseMeaning(choose(PIECE));
    const found = await store.meaningsOfTerms(["en:dough", "en:loaf"]);
    expect([...found.keys()]).toEqual(["en:dough"]);
    expect(found.get("en:dough")).toEqual(await store.meaningsOf("en:dough"));
    expect(await store.meaningsOfTerms([])).toEqual(new Map());
  });

  it("marks the choices with this device's id", async () => {
    const own = createTermStore(freshDb(), {
      now: clock.now,
      deviceId: async () => "device-a",
    });
    await own.chooseMeaning(choose(PIECE));
    expect((await own.meaningsOf("en:dough")).choices[0]!.deviceId).toBe(
      "device-a",
    );
  });

  it("saves an unsaved term as Learning, with this sentence as saved", async () => {
    const term = await store.chooseMeaning(choose(PIECE));
    expect(term).toMatchObject({ status: "learning", createdAt: clock.time });
    expect((await store.termIndex("en")).get("dough")).toBe("learning");
    expect(
      (await store.occurrencesOf("en:dough")).map((o) => [
        o.sentence,
        o.origin,
      ]),
    ).toEqual([["Knead the dough.", "saved"]]);
  });

  it("adds the sentence to a saved term that does not have it, as an encounter", async () => {
    await store.saveTerm(dough({ status: "known" }));
    clock.tick();
    const term = await store.chooseMeaning(
      choose(PIECE, { source: ARTICLE, sentence: "The dough rose." }),
    );
    expect(term).toMatchObject({ status: "known" });
    expect(
      (await store.occurrencesOf("en:dough")).map((o) => [
        o.sentence,
        o.origin,
      ]),
    ).toEqual([
      ["The dough rose.", "encountered"],
      ["Knead the dough.", "saved"],
    ]);
  });

  it("replaces the meaning chosen for the sentence: one per sentence", async () => {
    await store.chooseMeaning(choose(PIECE));
    clock.tick();
    await store.chooseMeaning(choose(MASS));
    const { meanings, choices } = await store.meaningsOf("en:dough");
    // The meaning no choice names is dropped.
    expect(meanings.map((m) => m.text)).toEqual(["練り粉"]);
    expect(choices.map((c) => c.meaningKey)).toEqual([meanings[0]!.key]);
  });

  it("keeps a replaced meaning that another sentence still names", async () => {
    await store.chooseMeaning(choose(PIECE));
    await store.chooseMeaning(choose(PIECE, { sentence: "More dough." }));
    await store.chooseMeaning(choose(MASS));
    const { meanings, choices } = await store.meaningsOf("en:dough");
    expect(meanings.map((m) => m.text).sort()).toEqual(["パン生地", "練り粉"]);
    expect(choices).toHaveLength(2);
  });

  it("undoes a choice and leaves the term saved, even when choosing saved it", async () => {
    await store.chooseMeaning(choose(PIECE));
    clock.tick();
    const term = await store.chooseMeaning(choose(null));
    expect(term).toMatchObject({ status: "learning" });
    expect(await store.meaningsOf("en:dough")).toEqual({
      meanings: [],
      choices: [],
    });
    // The undo is kept: it wins over older choices of the sentence elsewhere.
    expect(await db.meaningChoices.toArray()).toEqual([
      expect.objectContaining({ meaningKey: null, at: clock.time }),
    ]);
    expect(await store.occurrencesOf("en:dough")).toHaveLength(1);
  });

  it("does nothing for an undo with nothing chosen, and saves nothing", async () => {
    expect(await store.chooseMeaning(choose(null))).toBeNull();
    expect(await store.listTerms("en")).toEqual([]);
    await store.saveTerm(dough());
    const listener = vi.fn();
    store.onChange(listener);
    expect(await store.chooseMeaning(choose(null))).toMatchObject({
      id: "en:dough",
    });
    expect(await db.meaningChoices.count()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps a meaning made twice as one row", async () => {
    await store.chooseMeaning(choose(AI));
    await store.chooseMeaning(choose(AI, { sentence: "Other dough." }));
    const { meanings, choices } = await store.meaningsOf("en:dough");
    expect(meanings).toEqual([expect.objectContaining(AI)]);
    expect(choices).toHaveLength(2);
  });

  it("keeps a meaning's English definition as the pack has it, with its language", async () => {
    await store.chooseMeaning(choose(MONEY));
    expect((await store.meaningsOf("en:dough")).meanings).toEqual([
      expect.objectContaining({ text: "Money.", glossLang: "en" }),
    ]);
  });

  it("stores only a meaning's own fields, and refuses one that is not a meaning", async () => {
    await store.chooseMeaning(
      choose({ ...PIECE, extra: 1 } as unknown as Meaning),
    );
    expect(
      Object.keys((await store.meaningsOf("en:dough")).meanings[0]!).sort(),
    ).toEqual(["createdAt", "from", "key", "pos", "termId", "text"]);
    for (const bad of [
      { from: "web", text: "x" },
      { from: "ai", text: "" },
    ])
      await expect(
        store.chooseMeaning(choose(bad as unknown as Meaning)),
      ).rejects.toThrow(/meaning/);
  });

  it("tells listeners: terms when it saved the term, else occurrences", async () => {
    const listener = vi.fn();
    store.onChange(listener);
    await store.chooseMeaning(choose(PIECE));
    await store.chooseMeaning(choose(MASS));
    expect(listener.mock.calls).toEqual([
      ["en", "terms", "local"],
      ["en", "occurrences", "local"],
    ]);
  });

  it("keeps the choice when the term is saved again from the same sentence", async () => {
    await store.chooseMeaning(choose(PIECE));
    clock.tick();
    await store.saveTerm(dough({ status: "known" }));
    expect((await store.meaningsOf("en:dough")).choices).toHaveLength(1);
  });

  it("keeps the occurrences with a meaning chosen when encounters are trimmed", async () => {
    await store.saveTerm(dough());
    for (let i = 1; i <= 3; i++) {
      clock.tick();
      await store.recordEncounters(ARTICLE, [
        {
          termId: "en:dough",
          sentence: `Sentence ${i}.`,
          pos: { textQuote: `${i}` },
        },
      ]);
    }
    await store.chooseMeaning(
      choose(PIECE, {
        source: ARTICLE,
        sentence: "Sentence 1.",
        pos: { textQuote: "1" },
      }),
    );
    for (let i = 4; i <= 60; i++) {
      clock.tick();
      await store.recordEncounters(ARTICLE, [
        {
          termId: "en:dough",
          sentence: `Sentence ${i}.`,
          pos: { textQuote: `${i}` },
        },
      ]);
    }
    const sentences = (await store.occurrencesOf("en:dough")).map(
      (o) => o.sentence,
    );
    expect(sentences).toHaveLength(50);
    expect(sentences).toContain("Sentence 1.");
    expect(sentences).toContain("Knead the dough.");
    expect(sentences).not.toContain("Sentence 2.");
  });

  it("can keep more than 50 occurrences: the chosen ones all stay", async () => {
    await store.saveTerm(dough());
    for (let i = 1; i <= 51; i++) {
      clock.tick();
      await store.chooseMeaning(
        choose(PIECE, {
          source: ARTICLE,
          sentence: `Chosen ${i}.`,
          pos: { textQuote: `${i}` },
        }),
      );
    }
    expect(await store.occurrencesOf("en:dough")).toHaveLength(52);
  });
});

describe("removing a term deletes its choices and meanings", () => {
  beforeEach(async () => {
    await store.chooseMeaning(choose(PIECE));
    await store.chooseMeaning(choose(null, { sentence: "Undone." }));
  });

  const expectNone = async (on = db) => {
    expect(await on.meanings.count()).toBe(0);
    expect(await on.meaningChoices.count()).toBe(0);
  };

  it("by removeTerm", async () => {
    await store.removeTerm("en:dough");
    await expectNone();
  });

  it("by undoSaveAll", async () => {
    await store.removeTerm("en:dough");
    const { batchId } = await store.saveAll("en", ["dough"], "known", ARTICLE);
    await store.chooseMeaning(choose(PIECE));
    await store.undoSaveAll(batchId);
    // The choice changed nothing of the term: the batch still owns it.
    await expectNone();
  });

  it("by a removal taken in by importJson", async () => {
    const json = await withRemoval();
    await store.importJson(json);
    await expectNone();
  });

  it("by a removal taken in by applySynced", async () => {
    clock.tick(120_000);
    await store.applySynced("en", [
      {
        key: "dough",
        status: "removed",
        updatedMinutes: Math.floor(clock.time / 60_000),
      },
    ]);
    await expectNone();
  });

  it("and saving it again brings none of them back", async () => {
    await store.removeTerm("en:dough");
    await store.saveTerm(dough());
    expect(await store.meaningsOf("en:dough")).toEqual({
      meanings: [],
      choices: [],
    });
  });

  /** An export of a store where dough was removed after this one's version. */
  async function withRemoval() {
    let json = "";
    await withOtherStore(async (other) => {
      clock.tick();
      await other.saveTerm(dough());
      clock.tick();
      await other.removeTerm("en:dough");
      json = await other.exportJson();
    });
    return json;
  }
});

describe("export and import of your meanings", () => {
  /** A second store with its own device id. */
  const otherDevice = (deviceId: string) =>
    createTermStore(freshDb(), {
      now: clock.now,
      deviceId: async () => deviceId,
    });

  it("carries the meanings and the choices, undone ones included", async () => {
    await store.chooseMeaning(choose(PIECE));
    await store.chooseMeaning(choose(AI, { sentence: "Other." }));
    await store.chooseMeaning(choose(PIECE, { sentence: "Undone." }));
    await store.chooseMeaning(choose(null, { sentence: "Undone." }));
    const json = await store.exportJson();
    const data = JSON.parse(json) as LangleExport;
    expect(data.meanings).toHaveLength(2);
    expect(data.meaningChoices).toHaveLength(3);
    await withOtherStore(async (other) => {
      await other.importJson(json);
      expect(await other.meaningsOf("en:dough")).toEqual(
        await store.meaningsOf("en:dough"),
      );
    });
  });

  it("reads a version 1 file: no meanings", async () => {
    await store.saveTerm(dough());
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    const v1 = asVersion(data, 1);
    await withOtherStore(async (other) => {
      expect(await other.importJson(JSON.stringify(v1))).toEqual({
        terms: 1,
        sources: 1,
        occurrences: 1,
      });
      expect(await other.meaningsOf("en:dough")).toEqual({
        meanings: [],
        choices: [],
      });
    });
  });

  it("takes the later choice of a sentence; the replaced meaning goes", async () => {
    const a = otherDevice("a");
    await a.chooseMeaning(choose(PIECE));
    clock.tick();
    await store.chooseMeaning(choose(MASS));
    const newer = await store.exportJson();
    await a.importJson(newer);
    const { meanings, choices } = await a.meaningsOf("en:dough");
    expect(meanings.map((m) => m.text)).toEqual(["練り粉"]);
    expect(choices.map((c) => c.at)).toEqual([clock.time]);
  });

  it("keeps the later choice made here over an older one in the file", async () => {
    await store.chooseMeaning(choose(PIECE));
    const older = await store.exportJson();
    clock.tick();
    const a = otherDevice("a");
    await a.chooseMeaning(choose(MASS));
    await a.importJson(older);
    expect(
      (await a.meaningsOf("en:dough")).meanings.map((m) => m.text),
    ).toEqual(["練り粉"]);
  });

  it("takes a later undo from the file", async () => {
    const a = otherDevice("a");
    await a.chooseMeaning(choose(PIECE));
    await store.chooseMeaning(choose(PIECE));
    clock.tick();
    await store.chooseMeaning(choose(null));
    await a.importJson(await store.exportJson());
    expect(await a.meaningsOf("en:dough")).toEqual({
      meanings: [],
      choices: [],
    });
  });

  it("settles choices made at the same time by the smaller device id", async () => {
    const a = otherDevice("a");
    const b = otherDevice("b");
    await a.chooseMeaning(choose(PIECE));
    await b.chooseMeaning(choose(MASS));
    const fromA = await a.exportJson();
    const fromB = await b.exportJson();
    await a.importJson(fromB);
    await b.importJson(fromA);
    for (const device of [a, b])
      expect(
        (await device.meaningsOf("en:dough")).meanings.map((m) => m.text),
      ).toEqual(["パン生地"]);
  });

  it("joins the same meaning chosen on two devices as one row", async () => {
    const a = otherDevice("a");
    await a.chooseMeaning(choose(AI));
    clock.tick();
    await store.chooseMeaning(choose(AI, { sentence: "Other." }));
    await a.importJson(await store.exportJson());
    const { meanings, choices } = await a.meaningsOf("en:dough");
    expect(meanings).toHaveLength(1);
    expect(choices).toHaveLength(2);
  });

  it("takes in no choice for a term that is not live here", async () => {
    await store.chooseMeaning(choose(PIECE));
    const json = await store.exportJson();
    await withOtherStore(async (other) => {
      clock.tick();
      await other.saveTerm(dough());
      clock.tick();
      await other.removeTerm("en:dough");
      await other.importJson(json);
      expect(await other.listTerms("en")).toEqual([]);
      expect(await other.meaningsOf("en:dough")).toEqual({
        meanings: [],
        choices: [],
      });
    });
  });

  it("keeps the imported occurrences with a meaning chosen through the trim", async () => {
    await store.saveTerm(dough());
    for (let i = 1; i <= 55; i++) {
      clock.tick();
      await store.recordEncounters(ARTICLE, [
        {
          termId: "en:dough",
          sentence: `Sentence ${i}.`,
          pos: { textQuote: `${i}` },
        },
      ]);
    }
    const data = JSON.parse(await store.exportJson()) as LangleExport;
    // The oldest encounter of the file, chosen on another device.
    const a = otherDevice("a");
    await a.chooseMeaning(
      choose(PIECE, {
        source: ARTICLE,
        sentence: "Sentence 2.",
        pos: { textQuote: "2" },
      }),
    );
    const theirs = JSON.parse(await a.exportJson()) as LangleExport;
    const file: LangleExport = {
      ...data,
      occurrences: [
        ...data.occurrences,
        ...theirs.occurrences.filter((o) => o.sentence === "Sentence 2."),
      ],
      meanings: theirs.meanings,
      meaningChoices: theirs.meaningChoices,
    };
    await withOtherStore(async (other) => {
      await other.importJson(JSON.stringify(file));
      const sentences = (await other.occurrencesOf("en:dough")).map(
        (o) => o.sentence,
      );
      expect(sentences).toHaveLength(50);
      expect(sentences).toContain("Sentence 2.");
    });
  });
});
describe("the times cloud files merge by", () => {
  const MIN = 60_000;
  const brief = async () =>
    (await store.occurrencesOf("en:dough")).map(
      (o) => `${o.sentence}|${o.deviceId}|${o.addedAt}`,
    );

  it("marks each new row with this device and the time it was added", async () => {
    const start = clock.time;
    await store.saveTerm(dough());
    clock.tick();
    await store.recordEncounters(ARTICLE, [
      {
        termId: "en:dough",
        sentence: "The dough rises.",
        pos: { textQuote: "dough rises" },
      },
    ]);
    clock.tick();
    await store.importOccurrences("en:dough", [
      {
        source: ARTICLE,
        sentence: "Old dough.",
        pos: { textQuote: "Old dough." },
        seenAt: 5,
      },
    ]);
    // A row brought in from the history is added now, whenever it was seen.
    expect(await brief()).toEqual([
      `The dough rises.|this-device|${start + 1000}`,
      `Knead the dough.|this-device|${start}`,
      `Old dough.|this-device|${start + 2000}`,
    ]);
  });

  it("times a change after the one it replaces, even with the clock behind", async () => {
    const start = clock.time;
    await store.saveTerm(dough());
    clock.time -= 5000;
    await store.setStatus("en:dough", "known");
    expect(await db.terms.get("en:dough")).toMatchObject({
      status: "known",
      updatedAt: start + 1,
    });
    await store.saveTerm(dough({ status: "learning" }));
    expect((await db.terms.get("en:dough"))?.updatedAt).toBe(start + 2);
  });

  it("clears a removed term after its rows, and keeps the time when it is saved again", async () => {
    const start = clock.time;
    await store.saveTerm(dough());
    await store.removeTerm("en:dough");
    expect(await db.terms.get("en:dough")).toMatchObject({
      status: "removed",
      updatedAt: start + 1,
      clearedAt: start + 1,
    });
    await store.saveTerm(dough({ sentence: "Fresh dough." }));
    expect(await db.terms.get("en:dough")).toMatchObject({
      status: "learning",
      updatedAt: start + 2,
      clearedAt: start + 1,
    });
    // A new row is never older than the removal, so a copy elsewhere keeps it.
    expect(await brief()).toEqual([`Fresh dough.|this-device|${start + 2}`]);
  });

  it("keeps the cleared time when a bulk save brings the term back", async () => {
    await store.saveTerm(dough());
    clock.tick();
    await store.removeTerm("en:dough");
    const { clearedAt } = (await db.terms.get("en:dough"))!;
    clock.tick();
    await store.saveAll("en", ["dough"], "known", ARTICLE);
    expect(await db.terms.get("en:dough")).toMatchObject({
      status: "known",
      clearedAt,
    });
  });

  it("records the time of a removal browser sync brings, and keeps it after", async () => {
    const synced = (status: SyncRecord["status"], updatedMinutes: number) => ({
      key: "dough",
      status,
      updatedMinutes,
    });
    await store.applySynced("en", [synced("learning", 100)]);
    await store.applySynced("en", [synced("removed", 101)]);
    expect(await db.terms.get("en:dough")).toMatchObject({
      status: "removed",
      clearedAt: 101 * MIN,
    });
    await store.applySynced("en", [synced("known", 102)]);
    expect(await db.terms.get("en:dough")).toMatchObject({
      status: "known",
      clearedAt: 101 * MIN,
    });
  });

  describe("importJson", () => {
    it("reads a version 2 file: its rows become this device's, added when seen", async () => {
      await store.saveTerm(dough());
      const seenAt = clock.time;
      clock.tick();
      const data = JSON.parse(await store.exportJson()) as LangleExport;
      await withOtherStore(async (other) => {
        await other.importJson(JSON.stringify(asVersion(data, 2)));
        expect(
          (await other.occurrencesOf("en:dough")).map(
            (o) => `${o.deviceId}|${o.addedAt}|${o.seenAt}`,
          ),
        ).toEqual([`other-device|${seenAt}|${seenAt}`]);
      });
    });

    it("rejects a version 3 row without its device or added time", async () => {
      await store.saveTerm(dough());
      const data = JSON.parse(await store.exportJson()) as LangleExport;
      for (const field of ["deviceId", "addedAt"] as const) {
        const damaged = {
          ...data,
          occurrences: data.occurrences.map((o) => omit(o, field)),
        };
        await expect(store.importJson(JSON.stringify(damaged))).rejects.toThrow(
          /damaged/,
        );
      }
    });

    it.each([2, 3] as const)(
      "leaves out a version %i file's rows from before a removal here",
      async (version) => {
        await store.saveTerm(dough());
        const data = JSON.parse(await store.exportJson()) as LangleExport;
        clock.tick();
        await store.removeTerm("en:dough");
        clock.tick();
        await store.saveTerm(dough({ sentence: "Fresh dough." }));
        const file = version === 2 ? asVersion(data, 2) : data;
        await store.importJson(JSON.stringify(file));
        expect(
          (await store.occurrencesOf("en:dough")).map((o) => o.sentence),
        ).toEqual(["Fresh dough."]);
      },
    );

    it("takes a removal from the file and drops the rows here from before it", async () => {
      await store.saveTerm(dough());
      const json = await store.exportJson();
      let clearedAt = 0;
      await withOtherStore(async (other) => {
        await other.importJson(json);
        clock.tick();
        await other.removeTerm("en:dough");
        clearedAt = clock.time;
        clock.tick();
        await other.saveTerm(dough({ sentence: "Fresh dough." }));
        await store.importJson(await other.exportJson());
      });
      expect(await db.terms.get("en:dough")).toMatchObject({
        status: "learning",
        clearedAt,
      });
      expect(
        (await store.occurrencesOf("en:dough")).map((o) => o.sentence),
      ).toEqual(["Fresh dough."]);
    });
  });
});
