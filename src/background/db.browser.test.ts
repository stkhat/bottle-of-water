// Upgrading a database that an earlier version of Langle made.
import Dexie from "dexie";
import { describe, expect, it, onTestFinished } from "vitest";
import { openLangleDb } from "./db";

/** The database as version 6 left it: the schemas frozen as they were. */
function openVersion6(name: string): Dexie {
  const db = new Dexie(name);
  db.version(4).stores({
    terms: "id, lang, status, updatedAt, batchId, [lang+status]",
    sources: "id",
    occurrences:
      "++id, termId, &[termId+sourceId+sentence], [termId+seenAt], seenAt",
    meta: "key",
    historyPages: "id, lastSeen, host",
    historySentences: "++id, pageId, &[pageId+text], *keys",
    mtCache: "key, usedAt, pair",
    packFiles: "sha256",
    packVersions: "pack",
  });
  db.version(5).stores({
    meanings: "key, termId",
    meaningChoices: "[termId+sourceId+sentence], termId, meaningKey",
  });
  db.version(6).stores({ explanations: "key, usedAt, pair" });
  return db;
}

describe("openLangleDb", () => {
  it("gives the rows of a version 6 database this device and the upgrade time", async () => {
    const name = `langle-test-${crypto.randomUUID()}`;
    const old = openVersion6(name);
    await old.table("occurrences").bulkAdd([
      { termId: "en:dough", sourceId: "s", sentence: "A.", seenAt: 5 },
      { termId: "en:dough", sourceId: "s", sentence: "B.", seenAt: 6 },
    ]);
    await old.table("historySentences").add({
      pageId: "p",
      text: "C.",
      keys: ["en:dough"],
    });
    await old.table("terms").add({ id: "en:dough", status: "removed" });
    old.close();

    const db = openLangleDb(name, {
      // storage.local answers after a while: the upgrade waits for it.
      deviceId: () =>
        new Promise((resolve) => setTimeout(() => resolve("old-device"), 50)),
      now: () => 7000,
    });
    onTestFinished(async () => {
      db.close();
      await db.delete();
    });

    expect(
      (await db.occurrences.toArray()).map(
        (o) => `${o.sentence}|${o.deviceId}|${o.addedAt}`,
      ),
    ).toEqual(["A.|old-device|7000", "B.|old-device|7000"]);
    expect(await db.historySentences.toArray()).toEqual([
      expect.objectContaining({ deviceId: "old-device", addedAt: 7000 }),
    ]);
    // A tombstone keeps no `clearedAt`: it counts as cleared at its `updatedAt`.
    expect(await db.terms.get("en:dough")).toEqual({
      id: "en:dough",
      status: "removed",
    });
    expect(await db.historyForgotten.count()).toBe(0);
  });
});
