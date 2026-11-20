import { describe, expect, it } from "vitest";
import {
  clearedAtOf,
  compareCopies,
  historyKeeps,
  mergeChoice,
  mergeCopy,
  mergeForgotten,
  mergeMeaning,
  mergeSeen,
  mergeTerm,
  termKeeps,
  trimOccurrences,
  placeKey,
} from "./merge";
import type {
  CloudChoice,
  CloudOccurrence,
  CloudSource,
  CloudTerm,
} from "./records";

const term = (patch: Partial<CloudTerm> = {}): CloudTerm => ({
  id: "en:bank",
  lang: "en",
  key: "bank",
  display: "bank",
  kind: "word",
  status: "learning",
  createdAt: 10,
  updatedAt: 10,
  ...patch,
});

const row = (patch: Partial<CloudOccurrence> = {}): CloudOccurrence => ({
  termId: "en:bank",
  sourceId: "s1",
  sentence: "By the bank.",
  pos: { textQuote: "By the bank." },
  seenAt: 100,
  origin: "encountered",
  deviceId: "a",
  addedAt: 100,
  ...patch,
});

const choice = (patch: Partial<CloudChoice> = {}): CloudChoice => ({
  termId: "en:bank",
  sourceId: "s1",
  sentence: "By the bank.",
  meaningKey: "m1",
  at: 100,
  deviceId: "a",
  ...patch,
});

const source = (patch: Partial<CloudSource> = {}): CloudSource => ({
  id: "s1",
  platform: "web",
  url: "https://example.com/a",
  title: "A",
  lang: "en",
  firstSeen: 10,
  lastSeen: 20,
  ...patch,
});

/** Both orders give the same result. */
function commutes<T>(merge: (a: T | undefined, b: T) => T, a: T, b: T) {
  const ab = merge(merge(undefined, a), b);
  expect(merge(merge(undefined, b), a)).toEqual(ab);
  expect(merge(ab, a)).toEqual(ab);
  expect(merge(ab, b)).toEqual(ab);
  return ab;
}

describe("mergeTerm", () => {
  it("takes the newer updatedAt", () => {
    const older = term({ status: "learning", updatedAt: 10 });
    const newer = term({ status: "known", updatedAt: 20 });
    expect(commutes(mergeTerm, older, newer)).toEqual(newer);
  });

  it("counts a tombstone like any version", () => {
    const removed = term({ status: "removed", updatedAt: 30, clearedAt: 30 });
    expect(commutes(mergeTerm, term({ updatedAt: 20 }), removed)).toEqual(
      removed,
    );
    const saved = term({ updatedAt: 40 });
    expect(commutes(mergeTerm, removed, saved)).toEqual({
      ...saved,
      clearedAt: 30,
    });
  });

  it("takes the later clearedAt of the two, whichever copy wins", () => {
    const a = term({ updatedAt: 50, clearedAt: 20 });
    const b = term({ updatedAt: 40, clearedAt: 35 });
    expect(commutes(mergeTerm, a, b)).toEqual({ ...a, clearedAt: 35 });
  });

  it("counts a tombstone without clearedAt (an older file) as cleared at its time", () => {
    const tombstone = term({ status: "removed", updatedAt: 30 });
    expect(clearedAtOf(tombstone)).toBe(30);
    expect(mergeTerm(undefined, tombstone).clearedAt).toBe(30);
    expect(mergeTerm(term({ updatedAt: 40 }), tombstone).clearedAt).toBe(30);
  });

  it("breaks a tie on updatedAt the same way on every device", () => {
    const a = term({ updatedAt: 20, status: "known" });
    const b = term({ updatedAt: 20, status: "removed" });
    const merged = commutes(mergeTerm, a, b);
    expect([a.status, b.status]).toContain(merged.status);
  });
});

describe("termKeeps", () => {
  it("keeps rows added at or after the last removal only", () => {
    const resaved = term({ updatedAt: 50, clearedAt: 30 });
    expect(termKeeps(resaved, 29)).toBe(false);
    expect(termKeeps(resaved, 30)).toBe(true);
    expect(termKeeps(term(), 0)).toBe(true);
  });
});

describe("compareCopies", () => {
  it("orders saved before encountered, then earlier seenAt, addedAt, smaller deviceId", () => {
    const saved = row({ origin: "saved", seenAt: 500 });
    const early = row({ seenAt: 50 });
    const firstAdded = row({ seenAt: 50, addedAt: 60 });
    const smallerDevice = row({ seenAt: 50, addedAt: 60, deviceId: "0" });
    expect(compareCopies(saved, early)).toBeLessThan(0);
    expect(compareCopies(early, row())).toBeLessThan(0);
    expect(compareCopies(firstAdded, early)).toBeLessThan(0);
    expect(compareCopies(smallerDevice, firstAdded)).toBeLessThan(0);
    expect(commutes(mergeCopy, row(), saved)).toEqual(saved);
  });

  it("decides between copies that differ only in content", () => {
    const a = row({ translation: "銀行" });
    const b = row({ translation: "土手" });
    expect(Math.sign(compareCopies(a, b))).toBe(
      -Math.sign(compareCopies(b, a)),
    );
    commutes(mergeCopy, a, b);
  });
});

describe("trimOccurrences", () => {
  const rows = (n: number, patch: (i: number) => Partial<CloudOccurrence>) =>
    Array.from({ length: n }, (_, i) =>
      row({
        sentence: `s${i}`,
        seenAt: 100 + i,
        addedAt: 100 + i,
        ...patch(i),
      }),
    );

  it("keeps everything up to the limit", () => {
    expect(
      trimOccurrences(
        rows(3, () => ({})),
        new Set(),
        3,
      ),
    ).toHaveLength(3);
  });

  it("drops the oldest encounters first", () => {
    const kept = trimOccurrences(
      rows(5, () => ({})),
      new Set(),
      3,
    );
    expect(kept.map((o) => o.sentence)).toEqual(["s2", "s3", "s4"]);
  });

  it("keeps saved rows and rows with a meaning chosen, which count toward the limit", () => {
    const all = rows(5, (i) => (i === 0 ? { origin: "saved" } : {}));
    const chosen = new Set([placeKey(all[1]!)]);
    const kept = trimOccurrences(all, chosen, 3);
    expect(kept.map((o) => o.sentence)).toEqual(["s0", "s1", "s4"]);
  });

  it("breaks ties on seenAt by addedAt, deviceId, then place, never by input order", () => {
    const tied = [
      row({ sentence: "x", addedAt: 5, deviceId: "b" }),
      row({ sentence: "y", addedAt: 5, deviceId: "a" }),
      row({ sentence: "z", addedAt: 4, deviceId: "c" }),
      row({ sentence: "w", addedAt: 5, deviceId: "a" }),
    ];
    const kept = trimOccurrences(tied, new Set(), 2).map((o) => o.sentence);
    expect(kept).toEqual(["x", "y"]);
    expect(
      trimOccurrences([...tied].reverse(), new Set(), 2)
        .map((o) => o.sentence)
        .sort(),
    ).toEqual(["x", "y"]);
  });

  it("gives the same rows when trimmed in steps as at once", () => {
    const all = rows(8, (i) => ({ seenAt: (i * 37) % 11 }));
    const once = trimOccurrences(all, new Set(), 4);
    const steps = trimOccurrences(
      [...trimOccurrences(all.slice(0, 5), new Set(), 4), ...all.slice(5)],
      new Set(),
      4,
    );
    expect(new Set(steps)).toEqual(new Set(once));
  });
});

describe("mergeChoice", () => {
  it("takes the later choice; an undo is a choice of none", () => {
    const undo = choice({ meaningKey: null, at: 200, deviceId: "b" });
    expect(commutes(mergeChoice, choice(), undo)).toEqual(undo);
    const replaced = choice({ meaningKey: "m2", at: 300 });
    expect(commutes(mergeChoice, undo, replaced)).toEqual(replaced);
  });

  it("takes the smaller deviceId at the same time", () => {
    const a = choice({ deviceId: "a", meaningKey: "m2" });
    const b = choice({ deviceId: "b" });
    expect(commutes(mergeChoice, a, b)).toEqual(a);
  });
});

describe("mergeMeaning", () => {
  it("keeps one meaning per key, the earliest made", () => {
    const meaning = {
      key: "k",
      termId: "en:bank",
      from: "dictionary" as const,
      text: "a river's side",
      createdAt: 20,
    };
    const earlier = { ...meaning, pos: "noun", createdAt: 10 };
    expect(commutes(mergeMeaning, meaning, earlier)).toEqual(earlier);
  });
});

describe("mergeSeen", () => {
  it("widens first and last seen and takes the rest from the copy seen last", () => {
    const a = source({ title: "Old", firstSeen: 5, lastSeen: 20 });
    const b = source({ title: "New", firstSeen: 10, lastSeen: 30 });
    expect(commutes(mergeSeen, a, b)).toEqual({
      ...b,
      firstSeen: 5,
      lastSeen: 30,
    });
  });

  it("takes the lexically smaller title at the same lastSeen", () => {
    const a = source({ title: "Beta" });
    const b = source({ title: "Alpha", firstSeen: 1 });
    expect(commutes(mergeSeen, a, b)).toEqual({ ...b, firstSeen: 1 });
  });
});

describe("history rules", () => {
  it("joins forgotten hosts, the later time per host", () => {
    const merged = mergeForgotten(new Map([["example.com", 10]]), {
      "Example.com ": 20,
      "other.org": 5,
    });
    expect(merged).toEqual(
      new Map([
        ["example.com", 20],
        ["other.org", 5],
      ]),
    );
  });

  it("drops what was recorded before the last Clear", () => {
    expect(historyKeeps(99, "a.com", 100, new Map())).toBe(false);
    expect(historyKeeps(100, "a.com", 100, new Map())).toBe(true);
  });

  it("drops what was recorded on a host (or its subdomains) before it was added to Never run on", () => {
    const forgotten = new Map([["example.com", 50]]);
    expect(historyKeeps(40, "news.example.com", 0, forgotten)).toBe(false);
    expect(historyKeeps(40, "example.com", 0, forgotten)).toBe(false);
    expect(historyKeeps(60, "example.com", 0, forgotten)).toBe(true);
    expect(historyKeeps(40, "example.org", 0, forgotten)).toBe(true);
  });
});
