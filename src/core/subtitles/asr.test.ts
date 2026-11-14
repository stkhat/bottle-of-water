import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alignAsrSentences,
  asrSentenceCards,
  type TranslatedCards,
} from "./asr";
import type { SentenceCards } from "./cues";
import type { Cue } from "./types";
import { parseYouTubeJson3 } from "./youtube-json3";

const fixture = (name: string) =>
  parseYouTubeJson3(
    readFileSync(
      new URL(`./fixtures/youtube/${name}.json3`, import.meta.url),
      "utf8",
    ),
  );

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

/** A cue with word timings, like YouTube's ASR events. */
const words = (
  startMs: number,
  endMs: number,
  list: [number, string][],
): Cue => ({
  startMs,
  endMs,
  text: list
    .map(([, t]) => t)
    .join("")
    .trim(),
  words: list.map(([offset, text]) => ({ startMs: startMs + offset, text })),
});

const texts = (result: SentenceCards) => result.cards.map((c) => c.text);
const allWords = (cues: readonly Cue[]) =>
  cues.flatMap((c) => c.text.split(/\s+/)).filter(Boolean);
const lineTexts = (result: SentenceCards, card: number) =>
  result.lines
    .filter((line) => line.card === card)
    .map((line) => result.cards[card]!.text.slice(line.start, line.end));

/** What every result must hold: lines tile their cards in order, in time, short. */
function expectWellFormed(result: SentenceCards, maxLineChars = 60) {
  result.cards.forEach((card, i) => {
    const lines = result.lines.filter((line) => line.card === i);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((l) => card.text.slice(l.start, l.end)).join(" ")).toBe(
      card.text,
    );
    expect(lines[0]!.startMs).toBe(card.startMs);
    expect(lines.at(-1)!.endMs).toBe(card.endMs);
    for (const line of lines) {
      const text = card.text.slice(line.start, line.end);
      if (text.split(" ").length >= 4)
        expect(text.length).toBeLessThanOrEqual(maxLineChars);
    }
    const next = result.cards[i + 1];
    if (next) expect(card.endMs).toBeLessThanOrEqual(next.startMs);
  });
  result.lines.forEach((line, i) => {
    expect(line.endMs).toBeGreaterThan(line.startMs);
    const next = result.lines[i + 1];
    if (next) expect(line.endMs).toBeLessThanOrEqual(next.startMs);
  });
}

describe("asrSentenceCards", () => {
  it("ends a sentence after sentence punctuation", () => {
    const result = asrSentenceCards([
      words(0, 3000, [
        [0, "Hello"],
        [300, " there."],
        [600, " How"],
        [900, " are"],
      ]),
      words(1200, 4000, [
        [0, "you?"],
        [300, " Fine"],
      ]),
    ]);
    expect(texts(result)).toEqual(["Hello there.", "How are you?", "Fine"]);
    expect(result.cards.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 600],
      [600, 1500],
      [1500, 4000],
    ]);
  });

  it("ends a sentence at a pause in a track without punctuation", () => {
    const result = asrSentenceCards([
      words(0, 6000, [
        [0, "so"],
        [200, " we"],
        [400, " went"],
        [3000, " then"],
        [3200, " it"],
        [3400, " rained"],
      ]),
    ]);
    expect(texts(result)).toEqual(["so we went", "then it rained"]);
  });

  it("keeps a sentence together across a pause in a punctuated track", () => {
    const result = asrSentenceCards([
      words(0, 3000, [
        [0, "Take"],
        [200, " a"],
        [400, " look."],
        [1000, " We"],
        [1200, " are"],
        [1400, " crossing"],
        [1800, " the"],
      ]),
      words(4200, 6000, [[0, "bridge."]]),
    ]);
    expect(texts(result)).toEqual([
      "Take a look.",
      "We are crossing the bridge.",
    ]);
  });

  it("starts a sentence where the speaker changes", () => {
    const result = asrSentenceCards([
      words(0, 3000, [
        [0, "could"],
        [200, " you"],
        [400, " introduce"],
        [600, " yourself"],
        [800, " >> sure"],
        [1000, " I'm"],
        [1200, " Chris"],
      ]),
    ]);
    expect(texts(result)).toEqual([
      "could you introduce yourself",
      ">> sure I'm Chris",
    ]);
  });

  it("does not leave a single word alone because of a pause", () => {
    const result = asrSentenceCards([
      words(0, 6000, [
        [0, "um"],
        [2500, " there"],
        [2700, " were"],
        [2900, " three"],
      ]),
    ]);
    expect(texts(result)).toEqual(["um there were three"]);
  });

  it("splits long runs without punctuation at the largest gap", () => {
    const list: [number, string][] = Array.from({ length: 30 }, (_, i) => [
      i * 200 + (i >= 12 ? 500 : 0),
      `${i === 0 ? "" : " "}w${i}`,
    ]);
    const result = asrSentenceCards([words(0, 10000, list)], { maxWords: 20 });
    expect(result.cards.map((c) => c.text.split(" ").length)).toEqual([12, 18]);
    expect(result.cards[1]?.text.startsWith("w12 ")).toBe(true);
  });

  it("keeps sound labels such as [Music] on their own", () => {
    const result = asrSentenceCards([
      cue(0, 2000, "[Music]"),
      words(2100, 4000, [
        [0, "hi"],
        [200, " all"],
      ]),
    ]);
    expect(texts(result)).toEqual(["[Music]", "hi all"]);
  });

  it("joins cues without spaces for languages written without them", () => {
    const result = asrSentenceCards(
      [
        cue(0, 900, "今日は"),
        cue(900, 2000, "いい天気です。"),
        cue(2100, 3000, "散歩"),
      ],
      { joiner: "" },
    );
    expect(texts(result)).toEqual(["今日はいい天気です。", "散歩"]);
  });

  it("shows a long sentence as short lines, split at a pause or punctuation", () => {
    const list: [number, string][] = [
      [0, "When"],
      [200, " I"],
      [400, " was"],
      [600, " younger,"],
      [1500, " I"],
      [1700, " would"],
      [1900, " always"],
      [2100, " ask"],
      [2300, " for"],
      [2500, " an"],
      [2700, " orange"],
      [2900, " without"],
      [3100, " any"],
      [3300, " pips"],
      [3500, " in"],
      [3700, " it."],
    ];
    const result = asrSentenceCards([words(0, 5000, list)]);
    expect(texts(result)).toHaveLength(1);
    expect(lineTexts(result, 0)).toEqual([
      "When I was younger,",
      "I would always ask for an orange without any pips in it.",
    ]);
    expect(result.lines.map((l) => [l.startMs, l.endMs])).toEqual([
      [0, 1500],
      [1500, 5000],
    ]);
  });

  describe("on a real track without punctuation", () => {
    const asr = fixture("en-asr");
    const result = asrSentenceCards(asr);

    it("starts with the sound label and short sentences", () => {
      expect(texts(result).slice(0, 4)).toEqual([
        "[Music]",
        "good morning",
        "how are you",
        "it's been great hasn't it",
      ]);
    });

    it("splits a long run before the incoming word when that is the largest gap", () => {
      expect(texts(result)).toContain(
        "the second is that it's put us in a place where we have no idea what's going to happen",
      );
    });

    it("keeps every word in order", () => {
      expect(allWords(result.cards)).toEqual(allWords(asr));
    });

    it("makes cards of at most 20 words shown as lines of at most 60 characters", () => {
      for (const card of result.cards)
        expect(card.text.split(" ").length).toBeLessThanOrEqual(20);
      expectWellFormed(result);
      expect(result.cards.length).toBeLessThan(asr.length);
    });
  });
});

describe("alignAsrSentences", () => {
  const align = (name: string) => {
    const result = alignAsrSentences(
      fixture(`${name}-en`),
      fixture(`${name}-tlang-ja`),
      { joiner: " ", translationJoiner: "", lang: "en" },
    );
    expect(result).toBeDefined();
    return result as TranslatedCards;
  };
  const pairs = (result: TranslatedCards) =>
    result.cards.map((card, i) => [card.text, result.translations[i]]);

  it("pairs each sentence of a punctuated track with its translation", () => {
    expect(pairs(align("asr-punctuated")).slice(0, 9)).toEqual([
      ["Hi everyone.", "やあみんな。"],
      [
        "Welcome to a new episode of Bose's Slow English.",
        "Boseのスローイングリッシュの新しいエピソードへようこそ。",
      ],
      [
        "In today's episode, we are exploring Boston, Massachusetts.",
        "今回のエピソードでは、マサチューセッツ州ボストンを探訪します。",
      ],
      ["Take a look.", "見てみてください。"],
      ["We are crossing the bridge.", "私たちは橋を渡っています。"],
      [
        "The hotel that we are staying at is over here.",
        "私たちが泊まっているホテルはあちらです。",
      ],
      [
        "I've never been to this city before, so I am excited to explore with you.",
        "私はこの街に来たことがないので、あなたと一緒に探索できるのが楽しみです。",
      ],
      [
        "If we haven't met before, my name is B.",
        "もし以前お会いしたことがなければ、私の名前はBです。",
      ],
      ["Hi.", "こんにちは。"],
    ]);
  });

  it("keeps the pairs after a long silence", () => {
    const result = pairs(align("asr-interview"));
    expect(result).toContainEqual([
      "It was like you know having five agent sessions running at all times.",
      "まるで、常に5つのエージェントセッションが稼働しているような状態でした。",
    ]);
    expect(result).toContainEqual([
      "I think I've never been more excited, but I've also never been more tired.",
      "これまでにないほど興奮しているけれど、同時にこれまでにないほど疲れている。",
    ]);
    expect(result).toContainEqual([
      "engineering [music] director.",
      "エンジニアリング（音楽）ディレクター。",
    ]);
  });

  it("finds sentences in a track without punctuation from the translation", () => {
    const result = pairs(align("asr-plain"));
    expect(result[0]).toEqual([
      "a strong confident voice will completely change the way people react to you",
      "力強く自信に満ちた声は、人々のあなたへの反応を完全に変えます。",
    ]);
    expect(result).toContainEqual([
      "we post new videos every Saturday so feel free to subscribe also",
      "毎週土曜日に新しい動画を投稿しているので、ぜひ登録してください。",
    ]);
  });

  for (const name of ["asr-punctuated", "asr-interview", "asr-plain"]) {
    it(`keeps every word and every translated sentence once (${name})`, () => {
      const result = align(name);
      expect(allWords(result.cards)).toEqual(allWords(fixture(`${name}-en`)));
      const squash = (list: readonly string[]) =>
        list.join("").replace(/\s/g, "");
      expect(squash(result.translations)).toBe(
        squash(fixture(`${name}-tlang-ja`).map((c) => c.text)),
      );
      expect(result.translations.every((t) => t !== "")).toBe(true);
      expectWellFormed(result);
    });
  }

  it("does not end a sentence at a mark inside brackets", () => {
    const result = alignAsrSentences(
      [
        words(0, 4000, [
          [0, "please"],
          [300, " give"],
          [600, " me"],
          [900, " a"],
          [1200, " like."],
          [2000, " Thanks"],
          [2300, " a"],
          [2600, " lot."],
        ]),
      ],
      [
        words(0, 4000, [
          [0, "「いいね！」"],
          [600, "を押してください。"],
          [2000, "ありがとう。"],
        ]),
      ],
      { translationJoiner: "" },
    );
    expect(result && pairs(result)).toEqual([
      ["please give me a like.", "「いいね！」を押してください。"],
      ["Thanks a lot.", "ありがとう。"],
    ]);
  });

  it("ends sentences inside a long quotation and after a bracket that never closes", () => {
    // YouTube's translation often loses a closing bracket: it must not hide every later end.
    const said = [
      [0, "he"],
      [300, " said"],
      [600, " I"],
      [900, " worked"],
      [1200, " for"],
      [1500, " years."],
      [3000, " and"],
      [3300, " then"],
      [3600, " I"],
      [3900, " quit."],
      [6000, " Wow."],
    ] as [number, string][];
    const result = alignAsrSentences(
      [words(0, 7000, said)],
      [
        words(0, 7000, [
          [0, "彼は言った。「私は何年も働いた。"],
          [3000, "そして辞めた。"],
          [6000, "すごい。"],
        ]),
      ],
      { translationJoiner: "" },
    );
    expect(result && pairs(result)).toEqual([
      ["he said I worked for years.", "彼は言った。「私は何年も働いた。"],
      ["and then I quit.", "そして辞めた。"],
      ["Wow.", "すごい。"],
    ]);
  });

  describe("a sentence longer than MAX_CARD_WORDS", () => {
    /** `count` words a quarter second apart, from `startMs`. */
    const run = (startMs: number, count: number, word = "word") =>
      Array.from(
        { length: count },
        (_, i) =>
          [startMs + i * 250, `${i ? " " : ""}${word}${i}`] as [number, string],
      );

    it("is split into even cards, its translation at the clause end said there", () => {
      const english = [...run(0, 25, "a"), ...run(6250, 25, "b")];
      const result = alignAsrSentences(
        [words(0, 13000, english), words(13000, 14000, [[0, "Next."]])],
        [
          words(0, 13000, [
            [0, "前半の訳、"],
            [6300, "後半の"],
            [12400, "訳。"],
          ]),
          words(13000, 14000, [[0, "次。"]]),
        ],
        { translationJoiner: "", lang: "en" },
      );
      const cards = result!.cards.map((c) => c.text.split(" ").length);
      expect(cards).toEqual([25, 25, 1]);
      expect(result!.translations).toEqual([
        "前半の訳、",
        "後半の訳。",
        "次。",
      ]);
      expectWellFormed(result!);
    });

    it("keeps the whole translation on each part when it has no clause end there", () => {
      const result = alignAsrSentences(
        // No period in the English: a track without punctuation.
        [words(0, 13000, run(0, 40)), words(13000, 14000, [[0, "next"]])],
        [
          words(0, 13000, [
            [0, "長い訳"],
            [12000, "です。"],
          ]),
          words(13000, 14000, [[0, "次"]]),
        ],
        { translationJoiner: "", lang: "en" },
      );
      expect(result!.cards).toHaveLength(3);
      expect(result!.translations).toEqual([
        "長い訳です。",
        "長い訳です。",
        "次",
      ]);
    });
  });

  it("ends a translated sentence at a period only before a space", () => {
    const result = alignAsrSentences(
      [
        words(0, 6000, [
          [0, "cuesta"],
          [400, " 3.5"],
          [800, " euros"],
          [3000, " gracias"],
        ]),
      ],
      [
        words(0, 6000, [
          [0, "It costs 3.5"],
          [800, " euros."],
          [3000, " Thanks."],
        ]),
      ],
    );
    expect(result && pairs(result)).toEqual([
      ["cuesta 3.5 euros", "It costs 3.5 euros."],
      ["gracias", "Thanks."],
    ]);
  });

  it("gives up when the translation has no sentence ends to follow", () => {
    expect(
      alignAsrSentences(
        [
          words(0, 2000, [
            [0, "hello"],
            [300, " there"],
          ]),
        ],
        [cue(0, 2000, "こんにちは")],
      ),
    ).toBeUndefined();
  });
});
