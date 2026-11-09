import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { createBrowserEnv } from "../core/browser-env";
import type { TermIndex } from "../core/classify";
import type { SyncStatus } from "../core/sync/backend";
import type {
  Reply,
  Request,
  RequestOf,
  RequestType,
  ResponseOf,
} from "../messaging/protocol";
import type { OccurrenceRecord, SourceRecord, TermRecord } from "./db";
import { createHandlers, type Handle } from "./handlers";
import { createLanguageResources } from "./language-resources";
import { getSettings, setSettings } from "./settings-store";
import type {
  OccurrenceWithSource,
  SourceInput,
  TermStore,
} from "./term-store";
import { stubPackLoader } from "./test-packs";

type FakeStore = { [K in keyof TermStore]: Mock<TermStore[K]> };

/** A TermStore whose methods record their calls; tests give the answers they need. */
function fakeStore(): FakeStore {
  const fail = (name: string) => async () => {
    throw new Error(`unexpected call to ${name}`);
  };
  return {
    saveTerm: vi.fn(fail("saveTerm")),
    setStatus: vi.fn(fail("setStatus")),
    removeTerm: vi.fn(fail("removeTerm")),
    recordEncounters: vi.fn(fail("recordEncounters")),
    saveAll: vi.fn(fail("saveAll")),
    undoSaveAll: vi.fn(fail("undoSaveAll")),
    counts: vi.fn(fail("counts")),
    termIndex: vi.fn(async (): Promise<TermIndex> => new Map()),
    listTerms: vi.fn(fail("listTerms")),
    occurrencesOf: vi.fn(async (): Promise<OccurrenceWithSource[]> => []),
    exportJson: vi.fn(fail("exportJson")),
    importJson: vi.fn(fail("importJson")),
    applySynced: vi.fn(fail("applySynced")),
    languages: vi.fn(fail("languages")),
    getMeta: vi.fn(fail("getMeta")),
    setMeta: vi.fn(fail("setMeta")),
    onChange: vi.fn(() => () => {}),
  };
}

const SYNC_STATUS: SyncStatus = {
  enabled: true,
  bytesUsed: 120,
  quotaBytes: 102_400,
  syncedCount: 3,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

const LOAF: TermRecord = {
  id: "en:loaf",
  lang: "en",
  key: "loaf",
  display: "loaves",
  kind: "word",
  status: "learning",
  createdAt: 1_000,
  updatedAt: 1_000,
};

const SOURCE: SourceInput = {
  platform: "web",
  url: "https://example.com/bread",
  title: "Bread",
  lang: "en",
};

let store: FakeStore;
let sync: { status: Mock<() => Promise<SyncStatus>> };
let handle: Handle;

beforeEach(() => {
  fakeBrowser.reset();
  store = fakeStore();
  sync = { status: vi.fn(async () => SYNC_STATUS) };
  handle = createHandlers({
    store,
    settings: { get: getSettings, set: setSettings },
    resources: createLanguageResources(stubPackLoader()),
    sync,
    env: () => createBrowserEnv("chrome", {}),
  });
});

/** Sends a request and returns the value, failing the test on an error reply. */
async function value<T extends RequestType>(
  request: { type: T } & RequestOf<T>,
): Promise<ResponseOf<T>> {
  const reply = await handle(request);
  if (!reply.ok) throw new Error(`error reply: ${reply.error}`);
  // Replies cross runtime.sendMessage, which keeps only what JSON keeps.
  expect(JSON.parse(JSON.stringify(reply))).toEqual(reply);
  return reply.value as ResponseOf<T>;
}

describe("handlers: routing", () => {
  it("answers getSettings and setSettings from the settings store", async () => {
    expect(await value({ type: "getSettings" })).toMatchObject({
      knownLevel: 3000,
    });
    expect(
      await value({ type: "setSettings", patch: { knownLevel: 5000 } }),
    ).toMatchObject({ knownLevel: 5000 });
    expect(await getSettings()).toMatchObject({ knownLevel: 5000 });
  });

  it("answers getBrowserEnv with the environment", async () => {
    expect(await value({ type: "getBrowserEnv" })).toMatchObject({
      syncName: "Chrome sync",
      extensionsPage: "chrome://extensions",
    });
  });

  it("answers syncStatus from the sync backend", async () => {
    expect(await value({ type: "syncStatus" })).toEqual(SYNC_STATUS);
  });

  it("passes saveTerm's input to the store", async () => {
    store.saveTerm.mockResolvedValue(LOAF);
    const input = {
      lang: "en",
      key: "loaf",
      display: "loaves",
      kind: "word",
      status: "learning",
      source: SOURCE,
      sentence: "Two loaves of bread.",
      pos: { textQuote: "Two loaves of bread." },
    } as const;
    expect(await value({ type: "saveTerm", ...input })).toEqual(LOAF);
    expect(store.saveTerm).toHaveBeenCalledWith(input);
  });

  it.each<{
    request: Request;
    method: keyof TermStore;
    args: unknown[];
    result: unknown;
    expected?: unknown;
  }>([
    {
      request: { type: "setStatus", id: "en:loaf", status: "known" },
      method: "setStatus",
      args: ["en:loaf", "known"],
      result: { ...LOAF, status: "known" },
    },
    {
      request: { type: "removeTerm", id: "en:loaf" },
      method: "removeTerm",
      args: ["en:loaf"],
      result: undefined,
      expected: null,
    },
    {
      request: {
        type: "recordEncounters",
        source: SOURCE,
        items: [
          {
            termId: "en:loaf",
            sentence: "A loaf.",
            pos: { textQuote: "A loaf." },
          },
        ],
      },
      method: "recordEncounters",
      args: [
        SOURCE,
        [
          {
            termId: "en:loaf",
            sentence: "A loaf.",
            pos: { textQuote: "A loaf." },
          },
        ],
      ],
      result: 1,
    },
    {
      request: {
        type: "saveAll",
        lang: "en",
        keys: ["yeast", "crust"],
        status: "learning",
        source: SOURCE,
      },
      method: "saveAll",
      args: ["en", ["yeast", "crust"], "learning", SOURCE],
      result: { batchId: "b1", count: 2 },
    },
    {
      request: { type: "undoSaveAll", batchId: "b1" },
      method: "undoSaveAll",
      args: ["b1"],
      result: 2,
    },
    {
      request: { type: "counts", lang: "en" },
      method: "counts",
      args: ["en"],
      result: { learning: 1, known: 2, phrases: 0 },
    },
    {
      request: { type: "exportJson" },
      method: "exportJson",
      args: [],
      result: '{"format":"lingo-export"}',
    },
    {
      request: { type: "importJson", json: "{}" },
      method: "importJson",
      args: ["{}"],
      result: { terms: 1, sources: 0, occurrences: 0 },
    },
    {
      request: { type: "listTerms", lang: "en" },
      method: "listTerms",
      args: ["en"],
      result: [LOAF],
    },
  ])("routes $request.type to the store", async (c) => {
    const method = store[c.method] as Mock;
    method.mockResolvedValue(c.result);
    expect(await value(c.request)).toEqual(
      "expected" in c ? c.expected : c.result,
    );
    expect(method).toHaveBeenCalledWith(...c.args);
  });
});

describe("handlers: errors", () => {
  it("answers an error for unknown requests", async () => {
    expect(await handle({ type: "nope" })).toEqual({
      ok: false,
      error: "Unknown request: nope",
    });
    for (const request of [undefined, null, "counts", 3, {}, { type: 3 }])
      expect(await handle(request)).toEqual({
        ok: false,
        error: "Unknown request",
      });
  });

  it("does not treat inherited object properties as request types", async () => {
    expect(await handle({ type: "toString" })).toEqual({
      ok: false,
      error: "Unknown request: toString",
    });
  });

  it("turns a failure into an error reply", async () => {
    store.setStatus.mockRejectedValue(new Error("No saved term en:dough"));
    const reply: Reply = await handle({
      type: "setStatus",
      id: "en:dough",
      status: "known",
    });
    expect(reply).toEqual({ ok: false, error: "No saved term en:dough" });
  });

  it("answers an error for languages without packs", async () => {
    expect(
      await handle({ type: "analyze", lang: "fr", blocks: ["Bonjour"] }),
    ).toEqual({ ok: false, error: "No language pack for fr" });
  });
});

describe("handlers: analyze", () => {
  it("classifies each block and lists the distinct unsaved keys", async () => {
    store.termIndex.mockResolvedValue(new Map([["crust", "learning"]]));
    const blocks = ["The loaves ferments.", "Yeast ferments the crust."];
    const result = await value({ type: "analyze", lang: "en", blocks });
    expect(store.termIndex).toHaveBeenCalledWith("en");
    const brief = result.spans.map((spans, i) =>
      spans.map(
        (s) => `${blocks[i]!.slice(s.start, s.end)}=${s.key}:${s.category}`,
      ),
    );
    expect(brief).toEqual([
      ["The=the:known", "loaves=loaf:known", "ferments=ferment:new"],
      [
        "Yeast=yeast:known",
        "ferments=ferment:new",
        "the=the:known",
        "crust=crust:learning",
      ],
    ]);
    expect(result.unsaved).toEqual(["ferment"]);
  });

  it("uses the known level from the settings", async () => {
    await setSettings({ knownLevel: 2000 });
    expect(
      await value({ type: "analyze", lang: "en", blocks: ["Yeast", ""] }),
    ).toEqual({
      spans: [
        [{ start: 0, end: 5, key: "yeast", kind: "word", category: "new" }],
        [],
      ],
      unsaved: ["yeast"],
    });
  });
});

const OCCURRENCE_BASE: Omit<OccurrenceRecord, "sourceId" | "sentence" | "pos"> =
  {
    termId: "en:loaf",
    seenAt: 0,
    origin: "encountered",
  };

function occurrence(
  id: number,
  source: SourceRecord,
  sentence: string,
  pos: OccurrenceRecord["pos"],
): OccurrenceWithSource {
  return {
    ...OCCURRENCE_BASE,
    id,
    sourceId: source.id,
    sentence,
    pos,
    seenAt: id,
    source,
  };
}

const BREAD: SourceRecord = {
  id: "s-bread",
  platform: "web",
  url: "https://example.com/bread",
  title: "Bread",
  lang: "en",
  firstSeen: 0,
  lastSeen: 0,
};
const VIDEO: SourceRecord = {
  id: "s-video",
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=abc",
  title: "Baking video",
  lang: "en",
  firstSeen: 0,
  lastSeen: 0,
};

describe("handlers: lookup", () => {
  beforeEach(() => {
    store.termIndex.mockResolvedValue(new Map([["loaf", "learning"]]));
    store.occurrencesOf.mockResolvedValue([
      occurrence(3, BREAD, "A warm loaf.", { textQuote: "A warm loaf." }),
      occurrence(2, VIDEO, "Shape the loaf.", { timeMs: 12_500 }),
      occurrence(1, BREAD, "Two loaves.", { textQuote: "Two loaves." }),
    ]);
  });

  it("gives the entry, the saved status and the occurrences here and elsewhere", async () => {
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      kind: "word",
      sourceUrl: "https://example.com/bread?utm_source=feed#top",
    });
    expect(store.occurrencesOf).toHaveBeenCalledWith("en:loaf");
    expect(result).toEqual({
      entry: {
        head: "loaf",
        kind: "word",
        ipa: "/loʊf/",
        short: "パンのひと塊",
        senses: [{ pos: "noun", text: "パンのひと塊" }],
      },
      status: "learning",
      termId: "en:loaf",
      here: [
        {
          sentence: "A warm loaf.",
          pos: { textQuote: "A warm loaf." },
          seenAt: 3,
          origin: "encountered",
          source: { title: "Bread", platform: "web", url: BREAD.url },
          link: BREAD.url,
        },
        {
          sentence: "Two loaves.",
          pos: { textQuote: "Two loaves." },
          seenAt: 1,
          origin: "encountered",
          source: { title: "Bread", platform: "web", url: BREAD.url },
          link: BREAD.url,
        },
      ],
      elsewhere: [
        {
          sentence: "Shape the loaf.",
          pos: { timeMs: 12_500 },
          seenAt: 2,
          origin: "encountered",
          source: {
            title: "Baking video",
            platform: "youtube",
            url: VIDEO.url,
          },
          link: "https://www.youtube.com/watch?v=abc&t=12s",
        },
      ],
    });
  });

  it("matches the video here whatever form its URL takes", async () => {
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      kind: "word",
      sourceUrl: "https://youtu.be/abc?t=30",
    });
    expect(result).toMatchObject({
      here: [{ sentence: "Shape the loaf." }],
      elsewhere: [{ sentence: "A warm loaf." }, { sentence: "Two loaves." }],
    });
  });

  it("puts every occurrence elsewhere without a usable source URL", async () => {
    for (const sourceUrl of [undefined, "not a url"]) {
      const result = await value({
        type: "lookup",
        lang: "en",
        key: "loaf",
        kind: "word",
        ...(sourceUrl !== undefined && { sourceUrl }),
      });
      expect(result).toMatchObject({ here: [] });
      expect((result as { elsewhere: unknown[] }).elsewhere).toHaveLength(3);
    }
  });

  it("calls an unsaved term new and leaves out a missing entry", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    expect(
      await value({
        type: "lookup",
        lang: "en",
        key: "sourdough",
        kind: "word",
      }),
    ).toEqual({
      status: "new",
      termId: "en:sourdough",
      here: [],
      elsewhere: [],
    });
  });

  it("looks up in the dictionary of the native language from the settings", async () => {
    await setSettings({ nativeLang: "fr" });
    expect(
      await handle({ type: "lookup", lang: "en", key: "loaf", kind: "word" }),
    ).toEqual({ ok: false, error: "No dictionary from en to fr" });
  });
});
