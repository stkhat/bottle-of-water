import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "../../core/dictionary";
import type { LookupResult, Request } from "../../messaging/protocol";
import { rulesFor } from "../../core/phrases/rules";
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
  "look into": {
    head: "look into",
    kind: "phrase",
    short: "To investigate",
    senses: [{ pos: "verb", text: "To investigate or examine." }],
    glossLang: "en",
  },
};

/** IPA the language pack has, also for terms no dictionary has. */
const IPA: Record<string, string> = { "heavy lift": "/ˈhɛvi lɪft/" };

function fakeSend(status: LookupResult["status"] = "new") {
  const requests: Request[] = [];
  const send = (async (request: Request) => {
    requests.push(request);
    if (request.type !== "lookup") throw new Error(request.type);
    const entry = ENTRIES[request.key];
    const ipa = IPA[request.key];
    return {
      ...(entry && { entry }),
      ...(ipa && { ipa }),
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
  it("passes over the language's slot words", () => {
    const en = rulesFor("en");
    expect(mainWord("make up one's mind", en)).toBe("make");
    expect(mainWord("pull someone's leg", en)).toBe("pull");
    expect(mainWord("one's", en)).toBe("one's");
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
      machineTranslated: true,
    });
    expect(card.ipa).toBeUndefined();
  });

  it("notes the main word of a phrase with a slot, not the slot", async () => {
    const { send, requests } = fakeSend();
    await describeTerm(
      {
        key: "make up one's mind",
        kind: "phrase",
        surface: "made up her mind",
      },
      { send, lang: "en", sourceUrl: "https://example.com/a", translator },
    );
    expect(requests.map((r) => r.type === "lookup" && r.key)).toEqual([
      "make up one's mind",
      "make",
    ]);
  });

  it("shows a phrase's English definition with its language, without translating it", async () => {
    const { send } = fakeSend();
    const calls: string[] = [];
    const recording = {
      translate: async (text: string) => {
        calls.push(text);
        return `訳(${text})`;
      },
    };
    const card = await describeTerm(
      { key: "look into", kind: "phrase", surface: "looked into" },
      {
        send,
        lang: "en",
        sourceUrl: "https://example.com/a",
        translator: recording,
      },
    );
    expect(card).toMatchObject({
      head: "look into",
      short: "To investigate",
      glossLang: "en",
      senses: [{ pos: "verb", text: "To investigate or examine." }],
    });
    expect(card).not.toHaveProperty("machineTranslated");
    expect(calls).toEqual([]);
  });

  it("leaves out the language of a meaning in the native language", async () => {
    const { send } = fakeSend();
    const card = await describeTerm(
      { key: "loaf", kind: "word", surface: "loaf" },
      { send, lang: "en", sourceUrl: "https://example.com/a", translator },
    );
    expect(card).not.toHaveProperty("glossLang");
  });

  it("takes the IPA of a phrase no dictionary has from the lookup", async () => {
    const { send } = fakeSend();
    const card = await describeTerm(
      { key: "heavy lift", kind: "phrase", surface: "heavy lifting" },
      { send, lang: "en", sourceUrl: "https://example.com/a", translator },
    );
    expect(card).toMatchObject({
      head: "heavy lifting",
      ipa: "/ˈhɛvi lɪft/",
      short: "訳(heavy lifting)",
    });
  });

  it("does not wait long for a translator whose model is still downloading", async () => {
    const { send } = fakeSend();
    const pending = { translate: () => new Promise<undefined>(() => {}) };
    const card = await describeTerm(
      { key: "rise and fall", kind: "phrase", surface: "rise and fall" },
      {
        send,
        lang: "en",
        sourceUrl: "https://example.com/a",
        translator: pending,
        translationWaitMs: 20,
      },
    );
    expect(card.short).toBeUndefined();
    expect(card).not.toHaveProperty("machineTranslated");
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
    expect(card).not.toHaveProperty("machineTranslated");
  });
});
