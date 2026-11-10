import { describe, expect, it } from "vitest";
import {
  CHUNK_CHARS,
  decode,
  encode,
  fromMinutes,
  merge,
  toMinutes,
  type SyncRecord,
} from "./codec";

/** Reverses base64 + gzip by hand, to check the stored text itself. */
async function unpack(chunks: string[]): Promise<string> {
  const bytes = Uint8Array.from(atob(chunks.join("")), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Base64 + gzip of any text, to feed `decode` hand-made data. */
async function pack(text: string): Promise<string> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes));
}

const rec = (
  key: string,
  status: SyncRecord["status"],
  updatedMinutes: number,
): SyncRecord => ({ key, status, updatedMinutes });

describe("encode", () => {
  it("writes one line per record: key, status code, base36 minutes", async () => {
    const chunks = await encode([
      rec("dough", "learning", 35),
      rec("bread", "known", 1_000_000),
      rec("crust", "removed", 0),
    ]);
    expect(await unpack(chunks)).toBe(
      "bread\tk\tlfls\ncrust\tx\t0\ndough\tl\tz",
    );
  });

  it("sorts keys by code point", async () => {
    const chunks = await encode([
      rec("\u{1F35E}", "known", 1),
      rec("Ａ", "known", 1),
      rec("z", "known", 1),
      rec("a", "known", 1),
    ]);
    const keys = (await unpack(chunks))
      .split("\n")
      .map((l) => l.split("\t")[0]);
    expect(keys).toEqual(["a", "z", "Ａ", "\u{1F35E}"]);
  });

  it("gives no chunks for no records", async () => {
    expect(await encode([])).toEqual([]);
  });

  it("splits the base64 text into chunks of at most 7,000 characters", async () => {
    const records = Array.from({ length: 3000 }, (_, i) =>
      rec(`word${(i * 7919).toString(36)}x${i}`, "learning", i * 37),
    );
    const chunks = await encode(records);
    expect(CHUNK_CHARS).toBe(7000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.slice(0, -1).every((c) => c.length === 7000)).toBe(true);
    expect(chunks.at(-1)!.length).toBeLessThanOrEqual(7000);
    expect(chunks.join("")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("takes a smaller chunk size", async () => {
    const records = Array.from({ length: 200 }, (_, i) =>
      rec(`w${i}`, "known", i),
    );
    const chunks = await encode(records, { chunkChars: 100 });
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(await decode(chunks)).toHaveLength(200);
  });

  it("rejects a time that is not a whole number of minutes from 0", async () => {
    await expect(encode([rec("a", "known", -1)])).rejects.toThrow(/minutes/);
    await expect(encode([rec("a", "known", 1.5)])).rejects.toThrow(/minutes/);
  });
});

describe("decode", () => {
  it("reads back what encode wrote, sorted by key", async () => {
    const records = [
      rec("look up", "learning", 29_000_000),
      rec("don't", "known", 5),
      rec("café", "removed", 1234),
      rec("a", "known", 0),
    ];
    expect(await decode(await encode(records))).toEqual([
      rec("a", "known", 0),
      rec("café", "removed", 1234),
      rec("don't", "known", 5),
      rec("look up", "learning", 29_000_000),
    ]);
  });

  it("keeps tabs, newlines and backslashes in keys", async () => {
    const records = [
      rec("tab\there", "known", 1),
      rec("line\nbreak", "learning", 2),
      rec("back\\slash\\t", "removed", 3),
      rec("cr\rkey", "known", 4),
    ];
    const decoded = await decode(await encode(records));
    expect(decoded).toEqual(
      expect.arrayContaining(records.map((r) => expect.objectContaining(r))),
    );
    expect(decoded).toHaveLength(4);
  });

  it("gives no records for no chunks", async () => {
    expect(await decode([])).toEqual([]);
  });

  it("rejects chunks that are missing a part", async () => {
    const records = Array.from({ length: 3000 }, (_, i) =>
      rec(`word${(i * 7919).toString(36)}x${i}`, "learning", i * 37),
    );
    const chunks = await encode(records);
    await expect(decode(chunks.slice(0, -1))).rejects.toThrow();
  });

  it("rejects text that is not base64 gzip", async () => {
    await expect(decode(["not base64!"])).rejects.toThrow();
    await expect(decode([btoa("plain text")])).rejects.toThrow();
  });

  it("rejects lines it does not understand", async () => {
    await expect(decode([await pack("a\tq\t1")])).rejects.toThrow(/damaged/);
    await expect(decode([await pack("a\tk")])).rejects.toThrow(/damaged/);
    await expect(decode([await pack("a\tk\t-1")])).rejects.toThrow(/damaged/);
    await expect(decode([await pack("a\tk\t1.5")])).rejects.toThrow(/damaged/);
  });
});

describe("minutes", () => {
  it("turns milliseconds into whole minutes and back", () => {
    expect(toMinutes(0)).toBe(0);
    expect(toMinutes(59_999)).toBe(0);
    expect(toMinutes(60_000)).toBe(1);
    expect(fromMinutes(3)).toBe(180_000);
  });
});

describe("merge", () => {
  it("takes the remote version when it is newer", () => {
    const { merged, changedLocal } = merge(
      [rec("dough", "learning", 10)],
      [rec("dough", "known", 11)],
    );
    expect(merged).toEqual([rec("dough", "known", 11)]);
    expect(changedLocal).toEqual([rec("dough", "known", 11)]);
  });

  it("keeps the local version when it is newer", () => {
    const { merged, changedLocal } = merge(
      [rec("dough", "known", 12)],
      [rec("dough", "learning", 11)],
    );
    expect(merged).toEqual([rec("dough", "known", 12)]);
    expect(changedLocal).toEqual([]);
  });

  it("keeps the local version when both have the same time", () => {
    const { merged, changedLocal } = merge(
      [rec("dough", "learning", 11)],
      [rec("dough", "known", 11)],
    );
    expect(merged).toEqual([rec("dough", "learning", 11)]);
    expect(changedLocal).toEqual([]);
  });

  it("takes a removal only when it is strictly newer", () => {
    expect(
      merge([rec("dough", "known", 11)], [rec("dough", "removed", 11)]),
    ).toEqual({ merged: [rec("dough", "known", 11)], changedLocal: [] });
    expect(
      merge([rec("dough", "known", 11)], [rec("dough", "removed", 12)]),
    ).toEqual({
      merged: [rec("dough", "removed", 12)],
      changedLocal: [rec("dough", "removed", 12)],
    });
  });

  it("keeps a local removal over an older remote version", () => {
    expect(
      merge([rec("dough", "removed", 12)], [rec("dough", "known", 11)]),
    ).toEqual({ merged: [rec("dough", "removed", 12)], changedLocal: [] });
  });

  it("joins keys found on one side only, sorted by key", () => {
    const { merged, changedLocal } = merge(
      [rec("crust", "known", 1)],
      [rec("bread", "learning", 2), rec("dough", "removed", 3)],
    );
    expect(merged).toEqual([
      rec("bread", "learning", 2),
      rec("crust", "known", 1),
      rec("dough", "removed", 3),
    ]);
    expect(changedLocal).toEqual([
      rec("bread", "learning", 2),
      rec("dough", "removed", 3),
    ]);
  });
});
