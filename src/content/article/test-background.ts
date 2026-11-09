// Test helper: the real background (handlers, TermStore on IndexedDB, classifier and
// dictionary) over a small stub pack, answering in-process instead of through messaging.
import { createHandlers } from "../../background/handlers";
import { createLanguageResources } from "../../background/language-resources";
import { openLingoDb } from "../../background/db";
import { createTermStore } from "../../background/term-store";
import { createBrowserEnv } from "../../core/browser-env";
import { createPackLoader, type PackFiles } from "../../core/packs/load";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../../core/settings";
import type { send } from "../../messaging/client";
import type { Request } from "../../messaging/protocol";

/** Ranked within 27: known at any level. The rare words come after rank 3,400: new. */
const COMMON = [
  "the",
  "they",
  "and",
  "a",
  "it",
  "can",
  "feel",
  "at",
  "first",
  "you",
  "is",
  "no",
  "more",
  "so",
  "each",
  "back",
  "to",
  "its",
  "once",
  "out",
  "bake",
  "of",
  "in",
  "with",
  "this",
  "page",
  "end",
];
const filler = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `filler${from + i}`);
/** Ranked 2,428: known at 3,000, new at 2,000. */
const DOUGH = ["dough"];
const RARE = [
  "knead",
  "loaf",
  "tedious",
  "figure",
  "schedule",
  "trace",
  "rise",
  "fall",
  "cause",
  "tangy",
  "crackle",
  "yeast",
  "starch",
];

const DICT: Record<string, readonly [string, readonly string[]]> = {
  knead: ["（生地を）こねる", ["（生地を）こねる；練る"]],
  loaf: ["（パンの）ひと塊", ["（パンなどの）ひと塊"]],
  tedious: ["退屈な、面倒な", ["退屈な；うんざりする；面倒な"]],
  figure: ["数字、姿、人物", ["数字；姿；人物"]],
  rise: ["上昇", ["上昇；増加"]],
  fall: ["下落", ["下落；落下"]],
  tangy: ["ぴりっとした、酸味のある", ["ぴりっとする；酸味の効いた"]],
  dough: ["パン生地", ["パン生地"]],
};

const vocab = [...new Set([...COMMON, ...DOUGH, ...RARE])].sort();
for (const word of vocab) DICT[word] ??= [`${word}の訳`, [`${word}の訳`]];

const PACKS: PackFiles = {
  en: {
    lemmas: { loaves: "loaf", crackles: "crackle", starches: "starch" },
    freq: [
      ...COMMON,
      ...filler(0, 2400),
      ...DOUGH,
      ...filler(2400, 1000),
      ...RARE,
    ],
    ipa: { tedious: "/ˈtiːdiəs/", loaf: "/loʊf/", knead: "/niːd/" },
    pos: { tedious: ["adjective"], loaf: ["noun"], knead: ["verb"] },
    vocab,
  },
  "en-ja": { dict: DICT },
};

const FILES: Readonly<Record<string, unknown>> = {
  ...Object.fromEntries(
    Object.entries(PACKS.en).map(([file, value]) => [
      `/packs/en/${file}.json`,
      value,
    ]),
  ),
  "/packs/en-ja/index.json": {
    shards: [{ file: "dict-1.json", first: vocab[0], last: vocab.at(-1) }],
  },
  "/packs/en-ja/dict-1.json": DICT,
};

let dbCount = 0;

/**
 * A background for content-script tests. `send` answers like the real one and
 * records every request; `settings` can be changed with `setSettings` requests.
 */
export function testBackground(initial: Partial<Settings> = {}) {
  let settings = mergeSettings(initial, DEFAULT_SETTINGS);
  const db = openLingoDb(`lingo-content-test-${Date.now()}-${dbCount++}`);
  const store = createTermStore(db);
  const handle = createHandlers({
    store,
    settings: {
      get: async () => settings,
      set: async (patch: SettingsPatch) => {
        settings = mergeSettings(patch, settings);
        return settings;
      },
    },
    resources: createLanguageResources(
      createPackLoader(async (path) => {
        if (!Object.hasOwn(FILES, path)) throw new Error(`not found: ${path}`);
        return FILES[path];
      }),
    ),
    sync: {
      status: async () => ({
        enabled: false,
        bytesUsed: 0,
        quotaBytes: 0,
        syncedCount: 0,
        localOnlyCount: 0,
        droppedKnownCount: 0,
      }),
    },
    env: () => createBrowserEnv(),
  });
  const requests: Request[] = [];
  const sendFn = (async (request: Request) => {
    requests.push(request);
    const reply = await handle(request);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }) as typeof send;

  return {
    send: sendFn,
    requests,
    /** Requests of one type, without their `type`. */
    sent<T extends Request["type"]>(type: T) {
      return requests.filter(
        (r): r is Extract<Request, { type: T }> => r.type === type,
      );
    },
    settings: () => settings,
    async close() {
      db.close();
      await db.delete();
    },
  };
}
