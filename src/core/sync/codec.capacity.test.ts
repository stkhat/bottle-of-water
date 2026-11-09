// How many English terms fit in storage.sync with the codec, on the real frequency list.
// The numbers are recorded in docs/status.md ("Data"); rerun with --silent=false to print them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { encode, type SyncRecord, type SyncRecordStatus } from "./codec";
import { chunkKey, itemBytes, metaKey, type SyncMeta } from "./layout";

const packs = join(import.meta.dirname, "..", "..", "..", "public", "packs");
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(packs, path), "utf8")) as T;

/** Base forms by frequency, then the other single vocabulary words (freq.json has 19,089). */
const freq = read<string[]>("en/freq.json");
const inFreq = new Set(freq);
const pool = [
  ...freq,
  ...Object.keys(read<Record<string, unknown>>("en/pos.json")).filter(
    (w) => !inFreq.has(w) && !/\s/.test(w),
  ),
];

/** The storage.sync quota (bytes) shared by every key. */
const QUOTA = 102_400;
const END = Math.floor(Date.UTC(2026, 10, 1) / 60_000);
const YEAR = 365 * 24 * 60;

/** mulberry32: a small seeded PRNG so the data (and the numbers) are the same every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The top `n` base forms saved over a year: in sessions of 5–45 words a few minutes
 * apart, or by "save all" in batches of 20–200 with one time (3 in 10 sessions).
 * Afterwards 55% are known (half of them marked known later), 40% learning and
 * 5% removed later.
 */
function library(n: number): SyncRecord[] {
  const next = random(20261109);
  const order = pool
    .slice(0, n)
    .map((key) => ({ key, sort: next() }))
    .sort((a, b) => a.sort - b.sort)
    .map((x) => x.key);
  const saved: { key: string; at: number }[] = [];
  while (saved.length < order.length) {
    const start = END - Math.floor(next() * YEAR);
    const bulk = next() < 0.3;
    const size = bulk
      ? 20 + Math.floor(next() * 180)
      : 5 + Math.floor(next() * 40);
    let at = start;
    for (let j = 0; j < size && saved.length < order.length; j++) {
      if (!bulk) at += Math.floor(next() * 4);
      saved.push({ key: order[saved.length]!, at });
    }
  }
  return saved.map(({ key, at }) => {
    const later = () => at + Math.floor(next() * (END - at));
    const roll = next();
    let status: SyncRecordStatus = "learning";
    let updatedMinutes = at;
    if (roll < 0.05) {
      status = "removed";
      updatedMinutes = later();
    } else if (roll < 0.6) {
      status = "known";
      if (next() < 0.5) updatedMinutes = later();
    }
    return { key, status, updatedMinutes };
  });
}

/** Bytes the chunks and the meta take in storage.sync. */
async function storedBytes(records: SyncRecord[]): Promise<number> {
  const chunks = await encode(records);
  const meta: SyncMeta = {
    chunks: chunks.length,
    updatedAt: END * 60_000,
    v: 1,
  };
  return chunks.reduce(
    (sum, chunk, i) => sum + itemBytes(chunkKey("en", i), chunk),
    itemBytes(metaKey("en"), meta),
  );
}

it("measures how many English terms fit in 100 KB", async () => {
  const bytesFor20k = await storedBytes(library(20_000));

  let fits = 0;
  let tooMany = pool.length + 1;
  while (tooMany - fits > 1) {
    const n = Math.floor((fits + tooMany) / 2);
    if ((await storedBytes(library(n))) <= QUOTA) fits = n;
    else tooMany = n;
  }

  console.log(
    `sync capacity: ${fits} terms fit in ${QUOTA} bytes; 20,000 terms take ${bytesFor20k} bytes`,
  );
  // Measured on 2026-11-09: 12,402 terms; 20,000 take 170,367 bytes (docs/status.md).
  // 20,000 do not fit: the spec's estimate of 15,000–20,000 was too high.
  expect(fits).toBeGreaterThanOrEqual(12_000);
  expect(bytesFor20k).toBeGreaterThan(QUOTA);
}, 60_000);
