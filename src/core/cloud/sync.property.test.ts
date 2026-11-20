/**
 * Property test of cloud sync's merge: random devices make random changes, write their
 * files and read each other's in random orders and subsets; once every device has
 * written and read everything, they all hold the same data, and reading again changes
 * nothing. Seeded, so a failure names the seed that reproduces it.
 */
import { describe, expect, it } from "vitest";
import type { Limits } from "./state";
import {
  changeSettings,
  choose,
  clearHistory,
  encounter,
  forgetHost,
  makeDevice,
  read,
  recordHistory,
  removeTerm,
  saveTerm,
  setStatus,
  snapshot,
  write,
  type Cloud,
  type Device,
  type Place,
} from "../../testing/cloud-devices";

/** mulberry32: a small seeded generator of numbers in [0, 1). */
function generator(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const KEYS = ["bank", "run", "look up"];
const URLS = [
  "https://a.example/1",
  "https://b.example/2",
  "https://news.b.example/3",
];
const TITLES = ["", "Alpha", "Beta"];
const SENTENCES = ["One.", "Two.", "Three.", "Four.", "Five."];
const MEANINGS = ["土手", "銀行"];
const HOSTS = ["a.example", "b.example"];

async function run(seed: number, limits: Limits) {
  const random = generator(seed);
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)]!;
  const shuffle = (items: string[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  const place = (): Place => ({
    url: pick(URLS),
    title: pick(TITLES),
    sentence: pick(SENTENCES),
  });

  // Close to the turn of a month, so rows fall into several month files.
  let clock = Date.UTC(2026, 9, 30, 23, 59);
  const devices: Device[] = Array.from(
    { length: 2 + Math.floor(random() * 3) },
    (_, i) => {
      // Clocks a little apart, some ahead: ties and "later" across devices both happen.
      const skew = pick([0, 0, 1, 3, -2]);
      return makeDevice(`d${i}`, () => clock + skew, limits);
    },
  );
  const cloud: Cloud = new Map();

  const change = async (d: Device) => {
    const r = random();
    const key = pick(KEYS);
    if (r < 0.22)
      saveTerm(d, key, pick(["learning", "known"] as const), place());
    else if (r < 0.42) encounter(d, key, place());
    else if (r < 0.54) await choose(d, key, place(), pick(MEANINGS));
    else if (r < 0.58) await choose(d, key, place(), null);
    else if (r < 0.63) setStatus(d, key);
    else if (r < 0.71) removeTerm(d, key);
    else if (r < 0.86) {
      const url = pick(URLS);
      recordHistory(d, { url, title: pick(TITLES) }, pick(SENTENCES));
    } else if (r < 0.88) clearHistory(d);
    else if (r < 0.91) forgetHost(d, pick(HOSTS));
    else
      changeSettings(
        d,
        pick([
          { knownLevel: pick([3000, 5000]) },
          { theme: pick(["dark", "light"] as const) },
          { sites: { netflix: random() < 0.5 } },
          { neverRunOn: random() < 0.5 ? [] : [pick(HOSTS)] },
        ]),
      );
  };

  const steps = 30 + Math.floor(random() * 60);
  for (let step = 0; step < steps; step++) {
    clock += pick([0, 0, 1, 2, 1000, 3 * DAY]);
    const d = pick(devices);
    const r = random();
    if (r < 0.15) await write(d, cloud);
    else if (r < 0.3) {
      const paths = [...cloud.keys()].filter(() => random() < 0.5);
      await read(d, cloud, { paths, order: shuffle });
    } else await change(d);
  }

  for (let round = 0; round < 2; round++) {
    clock += 1000;
    for (const d of devices) await write(d, cloud);
    for (const d of devices) await read(d, cloud, { order: shuffle });
  }
  const states = devices.map((d) => snapshot(d.state));
  for (const [i, state] of states.entries())
    expect(state, `seed ${seed}: device d${i} differs from d0`).toEqual(
      states[0],
    );

  // Reading everything again changes nothing.
  for (const d of devices) await read(d, cloud, { order: shuffle });
  for (const [i, d] of devices.entries())
    expect(
      snapshot(d.state),
      `seed ${seed}: reading again changed d${i}`,
    ).toEqual(states[i]);
  return states[0]!;
}

/** Seeds per case; set CLOUD_SYNC_SEEDS for a longer run. */
const SEEDS = Number(process.env.CLOUD_SYNC_SEEDS ?? 60);

const occurrencesPerTerm = (state: Awaited<ReturnType<typeof run>>) => {
  const perTerm = new Map<string, number>();
  for (const o of state.occurrences)
    perTerm.set(o.termId, (perTerm.get(o.termId) ?? 0) + 1);
  return [...perTerm.values()];
};

describe(
  "cloud sync merge (property)",
  { timeout: 60_000 + SEEDS * 500 },
  () => {
    const cases: [string, Limits][] = [
      ["no limit reached", {}],
      [
        "occurrences trimmed, history over its cap",
        { maxOccurrences: 3, historyCapBytes: 1200 },
      ],
      [
        "limits reached on almost every change",
        { maxOccurrences: 1, historyCapBytes: 500 },
      ],
    ];
    it.each(cases)(
      "brings random devices to the same data, whatever the order of reading (%s)",
      async (_name, limits) => {
        let rows = 0;
        let full = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
          const state = await run(seed, limits);
          rows += state.occurrences.length;
          if (
            limits.maxOccurrences !== undefined &&
            occurrencesPerTerm(state).includes(limits.maxOccurrences)
          )
            full++;
        }
        expect(rows).toBeGreaterThan(0);
        if (limits.maxOccurrences !== undefined)
          expect(full).toBeGreaterThan(0);
      },
    );
  },
);
