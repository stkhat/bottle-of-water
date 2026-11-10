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
  TermSummary,
} from "../messaging/protocol";
import type { OccurrenceRecord, SourceRecord, TermRecord } from "./db";
import { createHandlers, type Handle } from "./handlers";
import type {
  HistoryItem,
  HistorySentence,
  HistorySource,
  HistoryStore,
} from "./history-store";
import { createLanguageResources } from "./language-resources";
import { getSettings, setSettings } from "./settings-store";
import type {
  OccurrenceWithSource,
  SourceInput,
  TermStore,
} from "./term-store";
import { filesRead, stubPackLoader } from "./test-packs";

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
    occurrenceStats: vi.fn(fail("occurrenceStats")),
    exportJson: vi.fn(fail("exportJson")),
    importJson: vi.fn(fail("importJson")),
    applySynced: vi.fn(fail("applySynced")),
    languages: vi.fn(fail("languages")),
    getMeta: vi.fn(fail("getMeta")),
    setMeta: vi.fn(fail("setMeta")),
    onChange: vi.fn(() => () => {}),
    importOccurrences: vi.fn(fail("importOccurrences")),
  };
}

type FakeHistory = { [K in keyof HistoryStore]: Mock<HistoryStore[K]> };

/** A HistoryStore like `fakeStore()`: nothing kept unless a test says so. */
function fakeHistory(): FakeHistory {
  const fail = (name: string) => async () => {
    throw new Error(`unexpected call to ${name}`);
  };
  return {
    record: vi.fn(fail("record")),
    find: vi.fn(async (): Promise<HistorySentence[]> => []),
    status: vi.fn(fail("status")),
    clear: vi.fn(fail("clear")),
    forgetHost: vi.fn(fail("forgetHost")),
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
let history: FakeHistory;
let sync: { status: Mock<() => Promise<SyncStatus>> };
let handle: Handle;
let openOptionsPage: Mock<() => Promise<void>>;
let loadPack: ReturnType<typeof stubPackLoader>;

beforeEach(() => {
  fakeBrowser.reset();
  store = fakeStore();
  history = fakeHistory();
  sync = { status: vi.fn(async () => SYNC_STATUS) };
  loadPack = stubPackLoader();
  openOptionsPage = vi.fn(async () => {});
  handle = createHandlers({
    store,
    history,
    settings: { get: getSettings, set: setSettings },
    resources: createLanguageResources(loadPack),
    sync,
    env: () => createBrowserEnv("chrome", {}),
    openOptionsPage,
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

  it("opens the options page for openOptions (content scripts cannot)", async () => {
    expect(await value({ type: "openOptions" })).toBeNull();
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it("answers syncStatus from the sync backend", async () => {
    expect(await value({ type: "syncStatus" })).toEqual(SYNC_STATUS);
  });

  it("answers lastExport with when the data was last exported, or null", async () => {
    store.getMeta.mockResolvedValueOnce(undefined);
    expect(await value({ type: "lastExport" })).toBeNull();
    store.getMeta.mockResolvedValueOnce(5_000);
    expect(await value({ type: "lastExport" })).toBe(5_000);
    expect(store.getMeta).toHaveBeenCalledWith("lastExportAt");
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
  it("classifies each block and lists the distinct unsaved and saved keys", async () => {
    store.termIndex.mockResolvedValue(
      new Map([
        ["crust", "learning"],
        ["the", "known"],
      ]),
    );
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
    // "loaf" is known by its rank, not saved.
    expect(result.saved).toEqual(["the", "crust"]);
  });

  it("does not load the dictionary", async () => {
    await value({ type: "analyze", lang: "en", blocks: ["The loaf."] });
    expect(
      filesRead(loadPack).filter((p) => !p.startsWith("/packs/en/")),
    ).toEqual([]);
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
      saved: [],
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

describe("handlers: listTermsWithStats", () => {
  it("gives each saved term with its short meaning, how often and when it was last seen", async () => {
    const lookUp: TermRecord = {
      id: "en:look up",
      lang: "en",
      key: "look up",
      display: "looked up",
      kind: "phrase",
      status: "known",
      createdAt: 500,
      updatedAt: 700,
    };
    store.listTerms.mockResolvedValue([lookUp, LOAF]);
    store.occurrenceStats.mockResolvedValue(
      new Map([["en:loaf", { count: 3, lastSeen: 9_000 }]]),
    );
    expect(await value({ type: "listTermsWithStats", lang: "en" })).toEqual([
      {
        id: "en:look up",
        key: "look up",
        display: "looked up",
        kind: "phrase",
        status: "known",
        // No dictionary entry: no short meaning. No occurrences: seen when saved.
        seen: 0,
        lastSeen: 500,
        createdAt: 500,
      },
      {
        id: "en:loaf",
        key: "loaf",
        display: "loaves",
        kind: "word",
        status: "learning",
        short: "パンのひと塊",
        seen: 3,
        lastSeen: 9_000,
        createdAt: 1_000,
      },
    ]);
    expect(store.listTerms).toHaveBeenCalledWith("en");
    expect(store.occurrenceStats).toHaveBeenCalledWith("en");
  });
  it("gives the language of a short meaning that is not in the native language", async () => {
    const term = (key: string): TermRecord => ({
      id: `en:${key}`,
      lang: "en",
      key,
      display: key,
      kind: "phrase",
      status: "learning",
      createdAt: 1,
      updatedAt: 1,
    });
    store.listTerms.mockResolvedValue([term("figure out"), term("give up")]);
    store.occurrenceStats.mockResolvedValue(new Map());
    const [figureOut, giveUp] = (await value({
      type: "listTermsWithStats",
      lang: "en",
    })) as TermSummary[];
    expect(figureOut).toMatchObject({
      short: "To come to understand",
      glossLang: "en",
    });
    expect(giveUp).toMatchObject({ short: "諦める" });
    expect(giveUp).not.toHaveProperty("glossLang");
  });
});

describe("handlers: warmDictionary", () => {
  it("loads the dictionary of the native language before any lookup", async () => {
    expect(filesRead(loadPack)).toEqual([]);
    expect(await value({ type: "warmDictionary", lang: "en" })).toBeNull();
    expect(filesRead(loadPack)).toContain("/packs/en-ja/index.json");
  });
});

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
      ipa: "/loʊf/",
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

  it("gives the IPA of a phrase no dictionary has", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    expect(
      await value({
        type: "lookup",
        lang: "en",
        key: "yeast loaf",
        kind: "phrase",
      }),
    ).toEqual({
      ipa: "/jist loʊf/",
      status: "new",
      termId: "en:yeast loaf",
      here: [],
      elsewhere: [],
    });
  });

  it("gives an English definition with its language", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    expect(
      await value({
        type: "lookup",
        lang: "en",
        key: "figure out",
        kind: "phrase",
      }),
    ).toMatchObject({
      entry: { short: "To come to understand", glossLang: "en" },
    });
  });

  it("loads the dictionary on the first lookup", async () => {
    expect(filesRead(loadPack)).toEqual([]);
    await value({ type: "lookup", lang: "en", key: "loaf", kind: "word" });
    expect(filesRead(loadPack)).toContain("/packs/en-ja/index.json");
  });

  it("looks up in the dictionary of the native language from the settings", async () => {
    await setSettings({ nativeLang: "fr" });
    expect(
      await handle({ type: "lookup", lang: "en", key: "loaf", kind: "word" }),
    ).toEqual({ ok: false, error: "No dictionary from en to fr" });
  });
});

const PAGE: HistorySource = {
  platform: "web",
  url: "https://news.example.com/bread",
  title: "Bread news",
  lang: "en",
};

/** Sends recordHistory with one sentence per text and returns the items kept. */
async function recordedKeys(
  texts: string[],
  source: HistorySource = PAGE,
): Promise<string[][]> {
  history.record.mockImplementation(async (_source, items) => items.length);
  await value({
    type: "recordHistory",
    source,
    sentences: texts.map((text) => ({ text, pos: { textQuote: text } })),
  });
  const items = history.record.mock.calls.at(-1)![1];
  return items.map((item) => [...item.keys]);
}

describe("handlers: recordHistory", () => {
  it("keeps the sentences with their keys and says how many were kept", async () => {
    history.record.mockResolvedValue(1);
    const sentences = [
      {
        text: "The loaves ferments.",
        translation: "パンが発酵する。",
        pos: { timeMs: 3_000 },
      },
    ];
    expect(
      await value({ type: "recordHistory", source: PAGE, sentences }),
    ).toEqual({ kept: 1 });
    const expected: HistoryItem[] = [
      { ...sentences[0]!, keys: ["en:ferment"] },
    ];
    expect(history.record).toHaveBeenCalledWith(PAGE, expected);
  });

  it("leaves out the 300 most common base forms", async () => {
    // "the" and "loaf" are ranked 1 and 2; "yeast" 2,500; "ferment" is not ranked.
    expect(await recordedKeys(["The loaves ferments the yeast."])).toEqual([
      ["en:ferment", "en:yeast"],
    ]);
    expect(await recordedKeys(["The loaf."])).toEqual([[]]);
  });

  it("indexes every base form of a word", async () => {
    expect(await recordedKeys(["A rose."])).toEqual([["en:rose", "en:rise"]]);
    // "casa" is ranked 5 in the Spanish test pack, "casar" not at all.
    expect(await recordedKeys(["Dos casas."], { ...PAGE, lang: "es" })).toEqual(
      [["es:casar"]],
    );
  });

  it("indexes the dictionary phrases the classifier finds", async () => {
    expect(await recordedKeys(["They gave up."])).toEqual([
      ["en:give", "en:up", "en:give up"],
    ]);
  });

  it("indexes saved phrases of the source's language only", async () => {
    store.termIndex.mockImplementation(async (lang) =>
      lang === "en" ? new Map([["yeast loaf", "learning"]]) : new Map(),
    );
    expect(await recordedKeys(["Yeast loaf."])).toEqual([
      ["en:yeast", "en:yeast loaf"],
    ]);

    store.termIndex.mockImplementation(async (lang) =>
      lang === "es" ? new Map([["yeast loaf", "learning"]]) : new Map(),
    );
    expect(await recordedKeys(["Yeast loaf."])).toEqual([["en:yeast"]]);
    expect(store.termIndex).toHaveBeenLastCalledWith("en");
  });

  it("gives each key once per sentence", async () => {
    expect(await recordedKeys(["Yeast, yeast and more yeast."])).toEqual([
      ["en:yeast"],
    ]);
  });

  it("keeps nothing when sentence history is off", async () => {
    await setSettings({ sentenceHistory: false });
    expect(
      await value({
        type: "recordHistory",
        source: PAGE,
        sentences: [{ text: "Yeast.", pos: { textQuote: "Yeast." } }],
      }),
    ).toEqual({ kept: 0 });
    expect(history.record).not.toHaveBeenCalled();
  });

  it.each([
    { neverRunOn: ["news.example.com"] },
    { neverRunOn: ["Example.com"] },
    { disabledSites: ["example.com"] },
  ])(
    "keeps nothing from a blocked host ($neverRunOn $disabledSites)",
    async (patch) => {
      await setSettings(patch);
      expect(
        await value({
          type: "recordHistory",
          source: PAGE,
          sentences: [{ text: "Yeast.", pos: { textQuote: "Yeast." } }],
        }),
      ).toEqual({ kept: 0 });
      expect(history.record).not.toHaveBeenCalled();
    },
  );

  it("still keeps sentences from other hosts", async () => {
    await setSettings({ disabledSites: ["example.org", "ws.example.com"] });
    expect(await recordedKeys(["Yeast."])).toEqual([["en:yeast"]]);
  });

  it("keeps nothing for a language without a pack, or a source without a URL", async () => {
    for (const source of [
      { ...PAGE, lang: "fr" },
      { ...PAGE, url: "not a url" },
    ]) {
      expect(
        await value({
          type: "recordHistory",
          source,
          sentences: [{ text: "Levure.", pos: { textQuote: "Levure." } }],
        }),
      ).toEqual({ kept: 0 });
    }
    expect(history.record).not.toHaveBeenCalled();
    expect(filesRead(loadPack)).toEqual([]);
  });
});

describe("handlers: historyStatus and clearHistory", () => {
  it("answers historyStatus from the history store", async () => {
    history.status.mockResolvedValue({ bytes: 2_048, cap: 50, pages: 3 });
    expect(await value({ type: "historyStatus" })).toEqual({
      bytes: 2_048,
      cap: 50,
      pages: 3,
    });
  });

  it("clears the history for clearHistory", async () => {
    history.clear.mockResolvedValue();
    expect(await value({ type: "clearHistory" })).toBeNull();
    expect(history.clear).toHaveBeenCalledTimes(1);
  });
});

const KEPT: HistorySentence[] = [
  {
    text: "Shape the loaf.",
    translation: "パンを成形する。",
    pos: { timeMs: 12_500 },
    seenAt: 9_000,
    page: {
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=abc",
      title: "Baking video",
      lang: "en",
    },
  },
  {
    text: "A warm loaf.",
    pos: { textQuote: "A warm loaf." },
    seenAt: 8_000,
    page: {
      platform: "web",
      url: "https://example.org/cake",
      title: "Cake",
      lang: "en",
    },
  },
];

describe("handlers: lookup from the sentence history", () => {
  it("gives an unsaved term's kept sentences from other sources as elsewhere", async () => {
    history.find.mockResolvedValue(KEPT);
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      kind: "word",
      sourceUrl: "https://example.com/bread",
    });
    expect(history.find).toHaveBeenCalledWith("en:loaf", {
      excludeUrl: "https://example.com/bread",
    });
    expect(result).toMatchObject({ status: "new", here: [] });
    expect(result.elsewhere).toEqual([
      {
        sentence: "Shape the loaf.",
        translation: "パンを成形する。",
        pos: { timeMs: 12_500 },
        seenAt: 9_000,
        origin: "encountered",
        source: {
          title: "Baking video",
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=abc",
        },
        link: "https://www.youtube.com/watch?v=abc&t=12s",
      },
      {
        sentence: "A warm loaf.",
        pos: { textQuote: "A warm loaf." },
        seenAt: 8_000,
        origin: "encountered",
        source: {
          title: "Cake",
          platform: "web",
          url: "https://example.org/cake",
        },
        link: "https://example.org/cake",
      },
    ]);
  });

  it("gives a saved term's occurrences, not the history", async () => {
    store.termIndex.mockResolvedValue(new Map([["loaf", "learning"]]));
    history.find.mockResolvedValue(KEPT);
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      kind: "word",
    });
    expect(result.elsewhere).toEqual([]);
    expect(history.find).not.toHaveBeenCalled();
  });
});

describe("handlers: saving brings the kept sentences in", () => {
  const input = {
    lang: "en",
    key: "loaf",
    display: "loaf",
    kind: "word",
    status: "learning",
    source: SOURCE,
    sentence: "A loaf.",
    pos: { textQuote: "A loaf." },
  } as const;

  it("imports a newly saved term's kept sentences as its occurrences", async () => {
    const order: string[] = [];
    store.saveTerm.mockImplementation(async () => {
      order.push("save");
      return LOAF;
    });
    history.find.mockImplementation(async () => {
      order.push("find");
      return KEPT;
    });
    store.importOccurrences.mockImplementation(async () => {
      order.push("import");
      return 2;
    });
    expect(await value({ type: "saveTerm", ...input })).toEqual(LOAF);
    expect(order).toEqual(["save", "find", "import"]);
    expect(history.find).toHaveBeenCalledWith("en:loaf", { limit: 50 });
    expect(store.importOccurrences).toHaveBeenCalledWith("en:loaf", [
      {
        source: {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=abc",
          title: "Baking video",
          lang: "en",
        },
        sentence: "Shape the loaf.",
        translation: "パンを成形する。",
        pos: { timeMs: 12_500 },
        seenAt: 9_000,
      },
      {
        source: {
          platform: "web",
          url: "https://example.org/cake",
          title: "Cake",
          lang: "en",
        },
        sentence: "A warm loaf.",
        pos: { textQuote: "A warm loaf." },
        seenAt: 8_000,
      },
    ]);
  });

  it("imports nothing when nothing is kept", async () => {
    store.saveTerm.mockResolvedValue(LOAF);
    await value({ type: "saveTerm", ...input });
    expect(history.find).toHaveBeenCalledTimes(1);
    expect(store.importOccurrences).not.toHaveBeenCalled();
  });

  it("does not import again for a term that was already saved", async () => {
    store.termIndex.mockResolvedValue(new Map([["loaf", "known"]]));
    store.saveTerm.mockResolvedValue(LOAF);
    history.find.mockResolvedValue(KEPT);
    await value({ type: "saveTerm", ...input });
    expect(history.find).not.toHaveBeenCalled();
    expect(store.importOccurrences).not.toHaveBeenCalled();
  });

  it.each([
    ["finding the kept sentences", "find"],
    ["importing them", "import"],
  ] as const)(
    "still answers with the saved term when %s fails",
    async (_, failing) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      store.saveTerm.mockResolvedValue(LOAF);
      if (failing === "find")
        history.find.mockRejectedValue(new Error("history gone"));
      else {
        history.find.mockResolvedValue(KEPT);
        store.importOccurrences.mockRejectedValue(new Error("quota"));
      }
      expect(await value({ type: "saveTerm", ...input })).toEqual(LOAF);
      expect(error).toHaveBeenCalledTimes(1);
      error.mockRestore();
    },
  );

  it("does not import for save all", async () => {
    store.saveAll.mockResolvedValue({ batchId: "b1", count: 1 });
    history.find.mockResolvedValue(KEPT);
    await value({
      type: "saveAll",
      lang: "en",
      keys: ["loaf"],
      status: "learning",
      source: SOURCE,
    });
    expect(history.find).not.toHaveBeenCalled();
    expect(store.importOccurrences).not.toHaveBeenCalled();
  });
});
