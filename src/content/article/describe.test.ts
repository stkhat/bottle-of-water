import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "../../core/dictionary";
import type { LookupResult, Request } from "../../messaging/protocol";
import { describeTerm, inflectionNote, mainWord } from "./describe";

const ENTRIES: Record<string, DictionaryEntry> = {
  loaf: {
    head: "loaf",
    kind: "word",
    ipa: "/loʊf/",
    short: "（パンの）ひと塊",
    senses: [{ pos: "noun", text: "（パンなどの）ひと塊" }],
  },
  figure: {
    head: "figure",
    kind: "word",
    short: "数字、姿、人物",
    senses: [{ text: "数字；姿；人物" }],
  },
  tangy: { head: "tangy", kind: "word", short: "ぴりっとした", senses: [] },
};

function fakeSend(status: LookupResult["status"] = "new") {
  const requests: Request[] = [];
  const send = (async (request: Request) => {
    requests.push(request);
    if (request.type !== "lookup") throw new Error(request.type);
    const entry = ENTRIES[request.key];
    return {
      ...(entry && { entry }),
      status,
      termId: `${request.lang}:${request.key}`,
      here: [],
      elsewhere: [],
    } satisfies LookupResult;
  }) as Parameters<typeof describeTerm>[1]["send"];
  return { send, requests };
}

const translator = { translate: async (text: string) => `訳(${text})` };

describe("mainWord", () => {
  it("takes the phrase's longest word, the first one on a tie", () => {
    expect(mainWord("figure out")).toBe("figure");
    expect(mainWord("from scratch")).toBe("scratch");
    expect(mainWord("rise and fall")).toBe("rise");
  });
});

describe("inflectionNote", () => {
  it("shows an inflected form and its base", () => {
    expect(inflectionNote("loaves", "loaf")).toBe("loaves → loaf");
    expect(inflectionNote("Ferments", "ferment")).toBe("ferments → ferment");
  });
  it("is empty when the form is the base", () => {
    expect(inflectionNote("Tedious", "tedious")).toBeUndefined();
    expect(inflectionNote("don’t", "don't")).toBeUndefined();
  });
});

describe("describeTerm", () => {
  it("describes a word from the dictionary, with its base form", async () => {
    const { send, requests } = fakeSend("learning");
    const card = await describeTerm(
      { key: "loaf", kind: "word", surface: "loaves" },
      { send, lang: "en", sourceUrl: "https://example.com/a", translator },
    );
    expect(card).toMatchObject({
      key: "loaf",
      kind: "word",
      head: "loaf",
      ipa: "/loʊf/",
      short: "（パンの）ひと塊",
      sub: "loaves → loaf",
      status: "learning",
      termId: "en:loaf",
      senses: [{ pos: "noun", text: "（パンなどの）ひと塊" }],
    });
    expect(requests).toEqual([
      {
        type: "lookup",
        lang: "en",
        key: "loaf",
        kind: "word",
        sourceUrl: "https://example.com/a",
      },
    ]);
  });

  it("translates a phrase missing from the dictionary as it is written, and notes its main word", async () => {
    const { send } = fakeSend();
    const card = await describeTerm(
      { key: "figure out", kind: "phrase", surface: "figured out" },
      { send, lang: "en", sourceUrl: "https://example.com/a", translator },
    );
    expect(card).toMatchObject({
      head: "figured out",
      kind: "phrase",
      short: "訳(figured out)",
      sub: "figure — 数字、姿、人物",
      status: "new",
      senses: [],
    });
    expect(card.ipa).toBeUndefined();
  });

  it("leaves out what is not known", async () => {
    const { send } = fakeSend();
    const none = { translate: async () => undefined };
    const card = await describeTerm(
      { key: "rise and fall", kind: "phrase", surface: "rise and fall" },
      {
        send,
        lang: "en",
        sourceUrl: "https://example.com/a",
        translator: none,
      },
    );
    expect(card.short).toBeUndefined();
    expect(card.sub).toBeUndefined();
  });
});
