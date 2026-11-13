import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "../../core/lexicon/dictionary";
import type { LookupResult, Request } from "../../messaging/protocol";
import { rulesFor } from "../../core/phrases/rules";
import type { TranslationPair, TranslationPriority } from "../translate/queue";
import {
  describeTerm,
  hoverView,
  inflectionNote,
  mainWord,
  translateSenses,
  windowView,
  type TermCard,
} from "./describe";

const ENTRIES: Record<string, DictionaryEntry> = {
  loaf: {
    head: "loaf",
    kind: "word",
    ipa: "/loʊf/",
    short: "（パンの）ひと塊",
    lines: ["（パンの）ひと塊", "（食品の）塊"],
    senses: [
      { pos: "noun", text: "（パンなどの）ひと塊" },
      { pos: "noun", text: "（食品の）塊" },
    ],
  },
  figure: {
    head: "figure",
    kind: "word",
    short: "数字、姿、人物",
    lines: ["数字、姿、人物"],
    senses: [{ text: "数字；姿；人物" }],
  },
  tangy: {
    head: "tangy",
    kind: "word",
    short: "ぴりっとした",
    lines: ["ぴりっとした"],
    senses: [],
  },
  "look into": {
    head: "look into",
    kind: "phrase",
    short: "To investigate",
    lines: ["To investigate"],
    senses: [{ pos: "verb", text: "To investigate or examine." }],
    glossLang: "en",
  },
  "spill the beans": {
    head: "spill the beans",
    kind: "phrase",
    short: "(idiomatic) To reveal a secret.",
    lines: ["(idiomatic) To reveal a secret."],
    senses: [
      {
        pos: "verb",
        text: "(idiomatic, informal) To reveal secret information, especially unintentionally.",
      },
      { pos: "verb", text: "To confess." },
    ],
    glossLang: "en",
  },
  "not to mention": {
    head: "not to mention",
    kind: "phrase",
    short:
      "An apophasis used by a speaker to introduce, despite claiming not to address, a given point of discussion",
    lines: [
      "An apophasis used by a speaker to introduce, despite claiming not to address, a given point of discussion",
    ],
    senses: [
      {
        pos: "conjunction",
        text: "(idiomatic) An apophasis used by a speaker to introduce, despite claiming not to address, a given point of discussion.",
      },
    ],
    glossLang: "en",
  },
  "i mean": {
    head: "I mean",
    kind: "phrase",
    short: "A mild intensifier",
    lines: ["A mild intensifier"],
    senses: [
      { pos: "particle", text: "A mild intensifier." },
      { pos: "particle", text: "A delaying filler." },
    ],
    glossLang: "en",
  },
  "umbrella term": {
    head: "umbrella term",
    kind: "phrase",
    short: "A word used to cover a broad category of things",
    lines: ["A word used to cover a broad category of things"],
    senses: [
      {
        pos: "noun",
        text: "A word used to cover a broad category of things.",
      },
    ],
    glossLang: "en",
  },
  "spill the bean": {
    head: "spill the bean",
    kind: "phrase",
    short: "Misspelling of spill the beans.",
    lines: ["Misspelling of spill the beans."],
    senses: [{ text: "Misspelling of spill the beans." }],
    glossLang: "en",
  },
};

/** IPA the language pack has, also for terms no dictionary has. */
const IPA: Record<string, string> = { "heavy lift": "/ˈhɛvi lɪft/" };

/**
 * The background's answers: lookups from ENTRIES and IPA, with `translations` as the
 * cached translations of English definitions; `cacheTranslations` is recorded.
 */
function fakeSend(
  status: LookupResult["status"] = "new",
  translations?: Record<string, string>,
) {
  const requests: Request[] = [];
  const send = (async (request: Request) => {
    requests.push(request);
    if (request.type === "cacheTranslations") return null;
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
      ...(entry?.glossLang && translations && { translations }),
    } satisfies LookupResult;
  }) as Parameters<typeof describeTerm>[1]["send"];
  const cached = () => requests.filter((r) => r.type === "cacheTranslations");
  return { send, requests, cached };
}

const translator = { translate: async (text: string) => `訳(${text})` };

/** A translator that records what it is asked for. */
function recordingTranslator(
  answer: (text: string) => string | undefined = (text) => `訳(${text})`,
) {
  const calls: [string, TranslationPriority, TranslationPair][] = [];
  return {
    calls,
    translator: {
      translate: async (
        text: string,
        priority: TranslationPriority,
        pair: TranslationPair,
      ) => {
        calls.push([text, priority, pair]);
        return answer(text);
      },
    },
  };
}

const EN_JA = { from: "en", to: "ja" };

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
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
    );
    expect(card).toMatchObject({
      key: "loaf",
      kind: "word",
      head: "loaf",
      ipa: "/loʊf/",
      short: "（パンの）ひと塊",
      lines: ["（パンの）ひと塊", "（食品の）塊"],
      sub: "loaves → loaf",
      status: "learning",
      termId: "en:loaf",
      senses: [
        { pos: "noun", text: "（パンなどの）ひと塊" },
        { pos: "noun", text: "（食品の）塊" },
      ],
    });
    expect(hoverView(card).meanings).toEqual([
      "（パンの）ひと塊",
      "（食品の）塊",
    ]);
    expect(requests).toEqual([
      {
        type: "lookup",
        lang: "en",
        key: "loaf",
        sourceUrl: "https://example.com/a",
      },
    ]);
  });

  it("asks for the part of speech and the written case the page gives the word, and notes its base form", async () => {
    const { send, requests } = fakeSend();
    const card = await describeTerm(
      {
        key: "loaf",
        kind: "word",
        surface: "loaves",
        written: "lower",
        pos: "noun",
      },
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
    );
    expect(requests).toEqual([
      {
        type: "lookup",
        lang: "en",
        key: "loaf",
        sourceUrl: "https://example.com/a",
        written: "lower",
        pos: "noun",
      },
    ]);
    expect(card.sub).toBe("loaves → loaf");
  });

  it("translates a phrase missing from the dictionary as it is written, and notes its main word", async () => {
    const { send } = fakeSend();
    const card = await describeTerm(
      { key: "figure out", kind: "phrase", surface: "figured out" },
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
    );
    expect(card).toMatchObject({
      head: "figured out",
      kind: "phrase",
      short: "訳(figured out)",
      sub: "figure — 数字、姿、人物",
      status: "new",
      senses: [],
      machineTranslated: "literal",
    });
    expect(card.ipa).toBeUndefined();
    expect(card.lines).toEqual(["訳(figured out)"]);
    expect(hoverView(card).meanings).toEqual(["訳(figured out)"]);
  });

  it("notes the main word of a phrase with a slot, not the slot", async () => {
    const { send, requests } = fakeSend();
    await describeTerm(
      {
        key: "make up one's mind",
        kind: "phrase",
        surface: "made up her mind",
      },
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
    );
    expect(requests.map((r) => r.type === "lookup" && r.key)).toEqual([
      "make up one's mind",
      "make",
    ]);
  });

  it("shows an English definition with its language when the translator gives nothing", async () => {
    const { send, cached } = fakeSend();
    const { calls, translator } = recordingTranslator(() => undefined);
    const card = await describeTerm(
      { key: "look into", kind: "phrase", surface: "looked into" },
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
    );
    expect(card).toMatchObject({
      head: "look into",
      short: "To investigate",
      lines: ["To investigate"],
      shortLang: "en",
      glossLang: "en",
      senses: [{ pos: "verb", text: "To investigate or examine." }],
    });
    expect(card).not.toHaveProperty("machineTranslated");
    expect(card.senses[0]).not.toHaveProperty("translated");
    expect(calls).toEqual([["To investigate", "hover", EN_JA]]);
    expect(cached()).toEqual([]);
  });

  it("leaves out the language of a meaning in the native language", async () => {
    const { send } = fakeSend();
    const card = await describeTerm(
      { key: "loaf", kind: "word", surface: "loaf" },
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
    );
    expect(card).not.toHaveProperty("glossLang");
    expect(card).not.toHaveProperty("shortLang");
  });

  it("takes the IPA of a phrase no dictionary has from the lookup", async () => {
    const { send } = fakeSend();
    const card = await describeTerm(
      { key: "heavy lift", kind: "phrase", surface: "heavy lifting" },
      {
        send,
        lang: "en",
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator,
      },
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
        nativeLang: "ja",
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
        nativeLang: "ja",
        sourceUrl: "https://example.com/a",
        translator: none,
      },
    );
    expect(card.short).toBeUndefined();
    expect(card.sub).toBeUndefined();
    expect(card).not.toHaveProperty("machineTranslated");
  });
});

describe("describeTerm with an English definition", () => {
  const BEANS = {
    key: "spill the beans",
    kind: "phrase",
    surface: "spill the beans",
  } as const;
  const deps = (
    send: ReturnType<typeof fakeSend>["send"],
    translator: Parameters<typeof describeTerm>[1]["translator"],
  ) => ({
    send,
    lang: "en",
    nativeLang: "ja",
    sourceUrl: "https://example.com/a",
    translator,
  });

  it("translates the cleaned short meaning, marked as a machine translation, and keeps it", async () => {
    const { send, cached } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(BEANS, deps(send, translator));
    expect(card).toMatchObject({
      head: "spill the beans",
      short: "訳(To reveal a secret.)",
      machineTranslated: "definition",
      // The senses stay English until the window translates them.
      glossLang: "en",
      senses: [
        {
          pos: "verb",
          text: "(idiomatic, informal) To reveal secret information, especially unintentionally.",
        },
        { pos: "verb", text: "To confess." },
      ],
    });
    expect(card).not.toHaveProperty("shortLang");
    expect(card.senses[0]).not.toHaveProperty("translated");
    expect(calls).toEqual([["To reveal a secret.", "hover", EN_JA]]);
    // One line: the other senses are not translated for the hover card.
    expect(card.lines).toEqual(["訳(To reveal a secret.)"]);
    expect(hoverView(card).meanings).toEqual(["訳(To reveal a secret.)"]);
    await expect.poll(cached).toEqual([
      {
        type: "cacheTranslations",
        lang: "en",
        items: [
          {
            text: "To reveal a secret.",
            translated: "訳(To reveal a secret.)",
          },
        ],
      },
    ]);
  });

  it("shows a long translated definition as one short line, the window keeping it whole", async () => {
    const whole = "組み立て、構築、構築、または定式化。";
    const { send } = fakeSend("new", { "To reveal a secret.": whole });
    const { translator } = recordingTranslator();
    const card = await describeTerm(BEANS, deps(send, translator));
    expect(hoverView(card).meanings).toEqual(["組み立て、構築、または定式化"]);
    expect(windowView(card).short).toBe(whole);
  });

  it("translates a phrase whose definition is only a usage note as it is written", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(
      { key: "not to mention", kind: "phrase", surface: "Not to mention" },
      deps(send, translator),
    );
    expect(calls).toEqual([["Not to mention", "hover", EN_JA]]);
    expect(card).toMatchObject({
      short: "訳(Not to mention)",
      machineTranslated: "literal",
      glossLang: "en",
    });
    expect(card).not.toHaveProperty("shortLang");
    expect(hoverView(card).meanings).toEqual(["訳(Not to mention)"]);
    // The window keeps the definition, translated there.
    expect(card.senses[0]?.text).toMatch(/apophasis/);
  });

  it("translates a phrase whose definition only names its function as it is written, not an old translation of it", async () => {
    // A translation of the definition kept before it counted as a usage note.
    const { send, cached } = fakeSend("new", {
      "A mild intensifier": "マイルドなインテンシファイア",
    });
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(
      { key: "i mean", kind: "phrase", surface: "I mean" },
      deps(send, translator),
    );
    expect(calls).toEqual([["I mean", "hover", EN_JA]]);
    expect(card).toMatchObject({
      short: "訳(I mean)",
      machineTranslated: "literal",
    });
    expect(hoverView(card).meanings).toEqual(["訳(I mean)"]);
    expect(cached()).toEqual([]);
  });

  it("translates a noun's definition that names a kind of word: it is the noun's meaning", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(
      { key: "umbrella term", kind: "phrase", surface: "umbrella term" },
      deps(send, translator),
    );
    expect(calls).toEqual([
      ["A word used to cover a broad category of things", "hover", EN_JA],
    ]);
    expect(card).toMatchObject({ machineTranslated: "definition" });
  });

  it("uses the cached translations without the translator", async () => {
    const { send, cached } = fakeSend("new", {
      "To reveal a secret.": "秘密を漏らす",
      "To confess.": "白状する",
    });
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(BEANS, deps(send, translator));
    expect(card).toMatchObject({
      short: "秘密を漏らす",
      machineTranslated: "definition",
      glossLang: "en",
      senses: [
        {
          text: "(idiomatic, informal) To reveal secret information, especially unintentionally.",
        },
        { text: "To confess.", translated: "白状する" },
      ],
    });
    expect(card).not.toHaveProperty("shortLang");
    expect(card.senses[0]).not.toHaveProperty("translated");
    expect(calls).toEqual([]);
    expect(cached()).toEqual([]);
  });

  it("keeps a pointer as written", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(
      { key: "spill the bean", kind: "phrase", surface: "spill the bean" },
      deps(send, translator),
    );
    expect(card).toMatchObject({
      short: "Misspelling of spill the beans.",
      shortLang: "en",
    });
    expect(card).not.toHaveProperty("machineTranslated");
    expect(calls).toEqual([]);
  });

  it("translates nothing into English", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(BEANS, {
      ...deps(send, translator),
      nativeLang: "en",
    });
    expect(card.short).toBe("(idiomatic) To reveal a secret.");
    expect(card).not.toHaveProperty("machineTranslated");
    expect(calls).toEqual([]);
  });

  it("keeps a translation that comes after the card stopped waiting", async () => {
    const { send, cached } = fakeSend();
    let finish!: () => void;
    const late = new Promise<void>((resolve) => (finish = resolve));
    const card = await describeTerm(BEANS, {
      ...deps(send, {
        translate: async (text: string) => {
          await late;
          return `訳(${text})`;
        },
      }),
      translationWaitMs: 10,
    });
    expect(card.short).toBe("(idiomatic) To reveal a secret.");
    expect(card.shortLang).toBe("en");
    finish();
    await expect.poll(cached).toEqual([
      {
        type: "cacheTranslations",
        lang: "en",
        items: [
          {
            text: "To reveal a secret.",
            translated: "訳(To reveal a secret.)",
          },
        ],
      },
    ]);
  });

  it("does not wait for the definition in the window, which translates it after", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(BEANS, {
      ...deps(send, translator),
      translationWaitMs: 60_000,
      shownIn: "window",
    });
    expect(card.short).toBe("(idiomatic) To reveal a secret.");
    expect(card.shortLang).toBe("en");
    expect(calls).toEqual([]);
  });

  it("translates a phrase no dictionary has for the window at its priority", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const card = await describeTerm(
      { key: "rise and fall", kind: "phrase", surface: "rise and fall" },
      { ...deps(send, translator), shownIn: "window" },
    );
    expect(card).toMatchObject({
      short: "訳(rise and fall)",
      machineTranslated: "literal",
    });
    expect(calls).toEqual([["rise and fall", "window", EN_JA]]);
  });
});

describe("translateSenses", () => {
  const card: TermCard = {
    key: "figure out",
    kind: "phrase",
    head: "figure out",
    short: "To come to understand",
    shortLang: "en",
    glossLang: "en",
    status: "new",
    termId: "en:figure out",
    senses: [
      { pos: "verb", text: "To come to understand; to discover." },
      { pos: "verb", text: "(transitive, informal) To solve (a problem)." },
      { pos: "verb", text: "Synonym of work out." },
      {
        pos: "verb",
        text: "Synonym of puzzle out: to find a solution by thinking.",
      },
      { pos: "verb", text: "To calculate an amount." },
    ],
    elsewhere: [],
  };
  const deps = (
    send: ReturnType<typeof fakeSend>["send"],
    translator: Parameters<typeof translateSenses>[1]["translator"],
  ) => ({ send, lang: "en", nativeLang: "ja", translator });

  it("translates the short meaning and the first four senses, pointers left as written", async () => {
    const { send, cached } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const translated = await translateSenses(card, deps(send, translator));
    expect(translated).toMatchObject({
      short: "訳(To come to understand)",
      machineTranslated: "definition",
      glossLang: "en",
      senses: [
        {
          text: "To come to understand; to discover.",
          translated: "訳(To come to understand; to discover.)",
        },
        {
          text: "(transitive, informal) To solve (a problem).",
          translated: "訳(To solve (a problem).)",
        },
        { text: "Synonym of work out." },
        {
          text: "Synonym of puzzle out: to find a solution by thinking.",
          translated: "訳(to find a solution by thinking.)",
        },
        { text: "To calculate an amount." },
      ],
    });
    expect(translated).not.toHaveProperty("shortLang");
    expect(translated.senses[2]).not.toHaveProperty("translated");
    expect(translated.senses[4]).not.toHaveProperty("translated");
    expect(calls).toEqual([
      ["To come to understand", "window", EN_JA],
      ["To come to understand; to discover.", "window", EN_JA],
      ["To solve (a problem).", "window", EN_JA],
      ["to find a solution by thinking.", "window", EN_JA],
    ]);
    await expect.poll(cached).toEqual([
      {
        type: "cacheTranslations",
        lang: "en",
        items: [
          {
            text: "To come to understand",
            translated: "訳(To come to understand)",
          },
          {
            text: "To come to understand; to discover.",
            translated: "訳(To come to understand; to discover.)",
          },
          {
            text: "To solve (a problem).",
            translated: "訳(To solve (a problem).)",
          },
          {
            text: "to find a solution by thinking.",
            translated: "訳(to find a solution by thinking.)",
          },
        ],
      },
    ]);
  });

  it("asks only for what the card has not translated yet", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const translated = await translateSenses(
      {
        ...card,
        short: "理解するようになる",
        machineTranslated: "definition",
        shortLang: undefined,
        senses: [
          { ...card.senses[0]!, translated: "理解するようになる；発見する" },
          card.senses[1]!,
        ],
      },
      deps(send, translator),
    );
    expect(calls).toEqual([["To solve (a problem).", "window", EN_JA]]);
    expect(translated.short).toBe("理解するようになる");
    expect(translated.senses.map((s) => s.translated)).toEqual([
      "理解するようになる；発見する",
      "訳(To solve (a problem).)",
    ]);
  });

  it("leaves a short meaning that is a usage note as it is", async () => {
    const { send } = fakeSend();
    const { calls, translator } = recordingTranslator();
    const translated = await translateSenses(
      {
        ...card,
        key: "i mean",
        head: "I mean",
        short: "A mild intensifier",
        senses: [
          { pos: "particle", text: "A mild intensifier." },
          { pos: "particle", text: "A delaying filler." },
        ],
      },
      deps(send, translator),
    );
    expect(calls).toEqual([
      ["A mild intensifier.", "window", EN_JA],
      ["A delaying filler.", "window", EN_JA],
    ]);
    expect(translated).toMatchObject({
      short: "A mild intensifier",
      shortLang: "en",
    });
    expect(translated).not.toHaveProperty("machineTranslated");
  });

  it("gives the card back as it is when nothing is translated", async () => {
    const { send, cached } = fakeSend();
    const none = recordingTranslator(() => undefined);
    expect(await translateSenses(card, deps(send, none.translator))).toBe(card);
    expect(cached()).toEqual([]);

    const { calls, translator } = recordingTranslator();
    // Into English, or a dictionary in the native language: nothing to translate.
    expect(
      await translateSenses(card, {
        ...deps(send, translator),
        nativeLang: "en",
      }),
    ).toBe(card);
    const native: TermCard = { ...card };
    delete native.glossLang;
    delete native.shortLang;
    expect(await translateSenses(native, deps(send, translator))).toBe(native);
    expect(calls).toEqual([]);
  });
});

describe("hoverView and windowView", () => {
  const card: TermCard = {
    key: "spill the beans",
    kind: "phrase",
    head: "spill the beans",
    short: "秘密を漏らす",
    machineTranslated: "definition",
    glossLang: "en",
    status: "new",
    termId: "en:spill the beans",
    senses: [{ text: "To confess.", translated: "白状する" }],
    elsewhere: [],
  };

  it("marks a translated definition on the hover card, and in the window on its senses only", () => {
    expect(hoverView(card)).toMatchObject({
      meanings: ["秘密を漏らす"],
      machineTranslated: true,
      shortLang: undefined,
    });
    expect(windowView(card)).toMatchObject({
      short: "秘密を漏らす",
      machineTranslated: false,
      glossLang: "en",
      senses: [{ text: "To confess.", translated: "白状する" }],
    });
  });

  it("marks a literal translation on both", () => {
    const literal: TermCard = {
      ...card,
      short: "1時間待つ",
      machineTranslated: "literal",
      senses: [],
    };
    delete literal.glossLang;
    expect(hoverView(literal).machineTranslated).toBe(true);
    expect(windowView(literal).machineTranslated).toBe(true);
  });

  it("gives an English short meaning its language", () => {
    const english: TermCard = {
      ...card,
      short: "To reveal a secret.",
      shortLang: "en",
    };
    delete english.machineTranslated;
    expect(hoverView(english)).toMatchObject({
      shortLang: "en",
      machineTranslated: false,
    });
    expect(windowView(english)).toMatchObject({
      shortLang: "en",
      machineTranslated: false,
    });
  });

  it("shows the card's lines on the hover card, else its short meaning alone, else nothing", () => {
    const word: TermCard = {
      ...card,
      short: "（パンの）ひと塊",
      lines: ["（パンの）ひと塊", "（食品の）塊"],
    };
    delete word.machineTranslated;
    expect(hoverView(word).meanings).toEqual([
      "（パンの）ひと塊",
      "（食品の）塊",
    ]);
    // The dictionary window keeps the short meaning.
    expect(windowView(word).short).toBe("（パンの）ひと塊");
    delete word.lines;
    expect(hoverView(word).meanings).toEqual(["（パンの）ひと塊"]);
    delete word.short;
    expect(hoverView(word).meanings).toEqual([]);
  });
});
