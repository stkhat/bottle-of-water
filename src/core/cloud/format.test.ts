import { describe, expect, it } from "vitest";
import { meaningKey } from "../meanings";
import { DEFAULT_SETTINGS } from "../settings";
import { gzip } from "../sync/codec";
import {
  CLOUD_VERSION,
  decodeFile,
  encodeFile,
  filePath,
  monthOf,
  parseFilePath,
  type HistoryFile,
  type MainFile,
  type OccurrencesFile,
} from "./format";

const header = {
  format: "langle-cloud",
  v: CLOUD_VERSION,
  deviceId: "dev-1",
  writtenAt: Date.UTC(2026, 10, 21),
} as const;

const NOV = Date.UTC(2026, 10, 3);

async function main(): Promise<MainFile> {
  return {
    ...header,
    kind: "main",
    terms: [
      {
        id: "en:bank",
        lang: "en",
        key: "bank",
        display: "Bank",
        kind: "word",
        status: "known",
        learnedAt: 5,
        createdAt: 1,
        updatedAt: 5,
        clearedAt: 3,
      },
      {
        id: "en:look up",
        lang: "en",
        key: "look up",
        display: "look up",
        kind: "phrase",
        status: "removed",
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    sources: [
      {
        id: "s1",
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=x",
        title: "Talk",
        lang: "en",
        firstSeen: 1,
        lastSeen: 4,
      },
    ],
    meanings: [
      {
        key: await meaningKey("en:bank", "ai", "土手"),
        termId: "en:bank",
        from: "ai",
        text: "土手",
        createdAt: 4,
      },
    ],
    meaningChoices: [
      {
        termId: "en:bank",
        sourceId: "s1",
        sentence: "By the bank.",
        meaningKey: await meaningKey("en:bank", "ai", "土手"),
        at: 4,
        deviceId: "dev-1",
      },
      {
        termId: "en:bank",
        sourceId: "s1",
        sentence: "At the bank.",
        meaningKey: null,
        at: 5,
        deviceId: "dev-1",
      },
    ],
    settings: { values: DEFAULT_SETTINGS, times: { knownLevel: 3 } },
    historyClearedAt: 0,
    historyForgotten: { "example.com": 2 },
  };
}

const occurrences: OccurrencesFile = {
  ...header,
  kind: "occurrences",
  month: "2026-11",
  sources: [],
  occurrences: [
    {
      termId: "en:bank",
      sourceId: "s1",
      sentence: "By the bank.",
      translation: "土手のそばで。",
      pos: { timeMs: 1200 },
      seenAt: NOV,
      origin: "saved",
      deviceId: "dev-1",
      addedAt: NOV,
    },
  ],
};

const history: HistoryFile = {
  ...header,
  kind: "history",
  month: "2026-11",
  pages: [
    {
      id: "p1",
      platform: "web",
      url: "https://example.com/a",
      host: "example.com",
      title: "A",
      lang: "en",
      firstSeen: NOV,
      lastSeen: NOV,
    },
  ],
  sentences: [
    {
      pageId: "p1",
      text: "A sentence.",
      pos: { textQuote: "A sentence." },
      keys: ["en:sentence"],
      seenAt: NOV,
      deviceId: "dev-1",
      addedAt: NOV,
    },
  ],
};

const bytesOf = (data: unknown) => gzip(JSON.stringify(data));

describe("encodeFile and decodeFile", () => {
  it("round-trip each kind of file", async () => {
    for (const file of [await main(), occurrences, history])
      expect(await decodeFile(await encodeFile(file))).toEqual({
        status: "ok",
        file,
      });
  });

  it("write gzipped JSON with the format, version, kind and device", async () => {
    const bytes = await encodeFile(occurrences);
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    const text = await new Response(
      new Blob([new Uint8Array(bytes)])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
    ).text();
    expect(JSON.parse(text)).toMatchObject({
      format: "langle-cloud",
      v: 1,
      kind: "occurrences",
      deviceId: "dev-1",
      month: "2026-11",
    });
  });

  it("tell a newer version apart, whatever its content", async () => {
    expect(
      await decodeFile(
        await bytesOf({ format: "langle-cloud", v: 2, kind: "main", x: 1 }),
      ),
    ).toEqual({ status: "newer", v: 2 });
  });

  it("call a file of another format other", async () => {
    expect(
      await decodeFile(await bytesOf({ format: "langle-export" })),
    ).toEqual({ status: "other" });
    expect(await decodeFile(await bytesOf([1, 2]))).toEqual({
      status: "other",
    });
  });

  it("call bytes that are not gzipped JSON broken", async () => {
    expect(await decodeFile(new Uint8Array([1, 2, 3]))).toEqual({
      status: "broken",
    });
    expect(await decodeFile(await gzip("{not json"))).toEqual({
      status: "broken",
    });
  });

  it("call a file of this version with a damaged record broken", async () => {
    const file = await main();
    const cases: unknown[] = [
      { ...file, v: 0 },
      { ...file, v: 1.5 },
      { ...file, kind: "notes" },
      { ...file, deviceId: "a/b" },
      { ...file, terms: [{ ...file.terms[0], id: "en:other" }] },
      { ...file, terms: [{ ...file.terms[0], status: "deleted" }] },
      { ...file, settings: { values: {}, times: { knownLevel: "x" } } },
      { ...file, historyClearedAt: -1 },
      {
        ...file,
        meanings: [{ ...file.meanings[0], text: "something else" }],
      },
      {
        ...occurrences,
        occurrences: [{ ...occurrences.occurrences[0], pos: { line: 3 } }],
      },
      { ...occurrences, month: "2026-13" },
      { ...history, sentences: [{ ...history.sentences[0], keys: [1] }] },
    ];
    for (const data of cases)
      expect(
        await decodeFile(await bytesOf(data)),
        JSON.stringify(data),
      ).toEqual({ status: "broken" });
  });

  it("call a month file holding another device's rows, or rows of another month, broken", async () => {
    const row = occurrences.occurrences[0]!;
    for (const changed of [
      { ...row, deviceId: "dev-2" },
      { ...row, addedAt: Date.UTC(2026, 9, 31) },
    ])
      expect(
        await decodeFile(
          await bytesOf({ ...occurrences, occurrences: [changed] }),
        ),
      ).toEqual({ status: "broken" });
  });

  it("drop fields this version does not know", async () => {
    const decoded = await decodeFile(
      await bytesOf({
        ...occurrences,
        extra: true,
        occurrences: [{ ...occurrences.occurrences[0], id: 7, mood: "x" }],
      }),
    );
    expect(decoded).toEqual({ status: "ok", file: occurrences });
  });
});

describe("monthOf", () => {
  it("is the UTC month of a time", () => {
    expect(monthOf(Date.UTC(2026, 0, 31, 23, 59, 59, 999))).toBe("2026-01");
    expect(monthOf(Date.UTC(2026, 1, 1))).toBe("2026-02");
    expect(monthOf(Date.UTC(2026, 11, 31, 12))).toBe("2026-12");
  });
});

describe("filePath and parseFilePath", () => {
  it("put each device's files in its own folder", () => {
    expect(filePath("dev-1", "main")).toBe("devices/dev-1/main.json.gz");
    expect(filePath("dev-1", "occurrences", "2026-11")).toBe(
      "devices/dev-1/occurrences-2026-11.json.gz",
    );
    expect(filePath("dev-1", "history", "2026-02")).toBe(
      "devices/dev-1/history-2026-02.json.gz",
    );
  });

  it("read back what filePath makes, and nothing else", () => {
    expect(parseFilePath("devices/dev-1/main.json.gz")).toEqual({
      deviceId: "dev-1",
      kind: "main",
    });
    expect(parseFilePath("devices/dev-1/history-2026-02.json.gz")).toEqual({
      deviceId: "dev-1",
      kind: "history",
      month: "2026-02",
    });
    for (const path of [
      "devices/dev-1/notes.json.gz",
      "devices/dev-1/history-2026-13.json.gz",
      "devices/dev-1/main.json",
      "other/dev-1/main.json.gz",
    ])
      expect(parseFilePath(path)).toBeUndefined();
  });

  it("refuse a month file without a month, or a device id that is not a folder name", () => {
    expect(() => filePath("dev-1", "occurrences")).toThrow(RangeError);
    expect(() => filePath("../x", "main")).toThrow(RangeError);
  });
});
