import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cueAt,
  cueIndexAt,
  lastStartedIndex,
  mergeAsrFragments,
  oneLinePerCard,
  sentenceCards,
} from "./cues";
import { parseTtml } from "./ttml";
import type { Cue } from "./types";
import { parseYouTubeJson3 } from "./youtube-json3";

const asr = parseYouTubeJson3(
  readFileSync(
    new URL("./fixtures/youtube/en-asr.json3", import.meta.url),
    "utf8",
  ),
);

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

describe("cueIndexAt / cueAt", () => {
  const cues = [
    cue(1000, 2000, "a"),
    cue(2000, 3000, "b"),
    cue(4000, 5000, "c"),
  ];

  it("finds the cue playing at a time", () => {
    expect(cueIndexAt(cues, 1000)).toBe(0);
    expect(cueIndexAt(cues, 1999)).toBe(0);
    expect(cueIndexAt(cues, 2000)).toBe(1);
    expect(cueIndexAt(cues, 4500)).toBe(2);
    expect(cueAt(cues, 4500)?.text).toBe("c");
  });

  it("returns -1 / undefined before the first cue, in gaps and after the last", () => {
    expect(cueIndexAt(cues, 999)).toBe(-1);
    expect(cueIndexAt(cues, 3500)).toBe(-1);
    expect(cueIndexAt(cues, 5000)).toBe(-1);
    expect(cueAt(cues, 3500)).toBeUndefined();
    expect(cueIndexAt([], 0)).toBe(-1);
  });

  it("prefers the cue that started last when cues overlap", () => {
    const overlapping = [cue(0, 5000, "long"), cue(1000, 2000, "short")];
    expect(cueAt(overlapping, 1500)?.text).toBe("short");
  });

  it("finds cues in a real track", () => {
    expect(cueAt(asr, 29000)?.text).toBe(
      "how are you it's been great hasn't it",
    );
  });
});

describe("lastStartedIndex", () => {
  const cues = [
    cue(1000, 2000, "a"),
    cue(2000, 3000, "b"),
    cue(4000, 5000, "c"),
  ];

  it("is the last cue that started by a time, also in gaps and after the end", () => {
    expect(lastStartedIndex(cues, 999)).toBe(-1);
    expect(lastStartedIndex(cues, 1000)).toBe(0);
    expect(lastStartedIndex(cues, 2500)).toBe(1);
    expect(lastStartedIndex(cues, 3500)).toBe(1);
    expect(lastStartedIndex(cues, 9000)).toBe(2);
    expect(lastStartedIndex([], 0)).toBe(-1);
  });
});

describe("mergeAsrFragments", () => {
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

  it("ends a sentence after sentence punctuation", () => {
    const merged = mergeAsrFragments([
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
    expect(merged.map((c) => c.text)).toEqual([
      "Hello there.",
      "How are you?",
      "Fine",
    ]);
    expect(merged.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 600],
      [600, 1500],
      [1500, 4000],
    ]);
  });

  it("ends a sentence at a pause", () => {
    const merged = mergeAsrFragments([
      words(0, 6000, [
        [0, "so"],
        [200, " we"],
        [400, " went"],
        [3000, " then"],
        [3200, " it"],
        [3400, " rained"],
      ]),
    ]);
    expect(merged.map((c) => c.text)).toEqual(["so we went", "then it rained"]);
  });

  it("does not leave a single word alone because of a pause", () => {
    const merged = mergeAsrFragments([
      words(0, 6000, [
        [0, "um"],
        [2500, " there"],
        [2700, " were"],
        [2900, " three"],
      ]),
    ]);
    expect(merged.map((c) => c.text)).toEqual(["um there were three"]);
  });

  it("splits long runs without punctuation at the largest gap", () => {
    const list: [number, string][] = Array.from({ length: 30 }, (_, i) => [
      i * 200 + (i >= 12 ? 500 : 0),
      `${i === 0 ? "" : " "}w${i}`,
    ]);
    const merged = mergeAsrFragments([words(0, 10000, list)], { maxWords: 20 });
    expect(merged.map((c) => c.text.split(" ").length)).toEqual([12, 18]);
    expect(merged[1]?.text.startsWith("w12 ")).toBe(true);
  });

  it("keeps sound labels such as [Music] on their own", () => {
    const merged = mergeAsrFragments([
      cue(0, 2000, "[Music]"),
      words(2100, 4000, [
        [0, "hi"],
        [200, " all"],
      ]),
    ]);
    expect(merged.map((c) => c.text)).toEqual(["[Music]", "hi all"]);
  });

  it("joins cues without spaces for languages written without them", () => {
    const merged = mergeAsrFragments(
      [
        cue(0, 900, "今日は"),
        cue(900, 2000, "いい天気です。"),
        cue(2100, 3000, "散歩"),
      ],
      { joiner: "" },
    );
    expect(merged.map((c) => c.text)).toEqual(["今日はいい天気です。", "散歩"]);
  });

  describe("on a real ASR track", () => {
    const merged = mergeAsrFragments(asr);

    it("starts with the sound label and short sentences", () => {
      expect(merged.slice(0, 4).map((c) => c.text)).toEqual([
        "[Music]",
        "good morning",
        "how are you",
        "it's been great hasn't it",
      ]);
    });

    it("splits a long run before the incoming word when that is the largest gap", () => {
      expect(merged.map((c) => c.text)).toContain(
        "the second is that it's put us in a place where we have no idea what's going to happen",
      );
    });

    it("keeps every word in order", () => {
      const allWords = (cues: Cue[]) =>
        cues.flatMap((c) => c.text.split(/\s+/)).filter(Boolean);
      expect(allWords(merged)).toEqual(allWords(asr));
    });

    it("makes sorted, non-overlapping cues of at most 20 words", () => {
      for (const [i, c] of merged.entries()) {
        expect(c.text.split(" ").length).toBeLessThanOrEqual(20);
        expect(c.endMs).toBeGreaterThan(c.startMs);
        const next = merged[i + 1];
        if (next) expect(c.endMs).toBeLessThanOrEqual(next.startMs);
      }
      expect(merged.length).toBeLessThan(asr.length);
    });
  });
});

describe("sentenceCards", () => {
  const texts = (cues: readonly Cue[]) =>
    sentenceCards(cues).cards.map((c) => c.text);

  it("joins a sentence that goes on in the next cue", () => {
    const { cards, lines } = sentenceCards([
      cue(1000, 3000, "DID YOU EVEN INTERVIEW THIS WOMAN"),
      cue(3100, 5000, "BEFORE YOU ASKED HER TO MOVE IN?"),
      cue(5200, 6000, "I DIDN'T KNOW THAT, EITHER."),
    ]);
    expect(cards).toEqual([
      cue(
        1000,
        5000,
        "DID YOU EVEN INTERVIEW THIS WOMAN BEFORE YOU ASKED HER TO MOVE IN?",
      ),
      cue(5200, 6000, "I DIDN'T KNOW THAT, EITHER."),
    ]);
    // Each cue stays a subtitle line: its card and where its text is in the card.
    expect(lines).toEqual([
      { startMs: 1000, endMs: 3000, card: 0, start: 0, end: 33 },
      { startMs: 3100, endMs: 5000, card: 0, start: 34, end: 66 },
      { startMs: 5200, endMs: 6000, card: 1, start: 0, end: 27 },
    ]);
    const [first, second] = lines;
    expect(cards[0]!.text.slice(first!.start, first!.end)).toBe(
      "DID YOU EVEN INTERVIEW THIS WOMAN",
    );
    expect(cards[0]!.text.slice(second!.start, second!.end)).toBe(
      "BEFORE YOU ASKED HER TO MOVE IN?",
    );
  });

  it("ends a card after . ? ! … or ♪, also before a closing quote", () => {
    expect(
      texts([
        cue(0, 1000, "Stop."),
        cue(1000, 2000, "Why?"),
        cue(2000, 3000, "Go!"),
        cue(3000, 4000, "Well…"),
        cue(4000, 5000, "♪ LA LA LA ♪"),
        cue(5000, 6000, 'He said, "Wait."'),
        cue(6000, 7000, "She said 'No!'"),
        cue(7000, 8000, "Okay"),
      ]),
    ).toEqual([
      "Stop.",
      "Why?",
      "Go!",
      "Well…",
      "♪ LA LA LA ♪",
      'He said, "Wait."',
      "She said 'No!'",
      "Okay",
    ]);
  });

  it("does not join across a pause of 1.5 s or more", () => {
    expect(
      texts([
        cue(0, 1000, "and then"),
        cue(2500, 3000, "nothing happened."),
        cue(3000, 4000, "and then"),
        cue(5490, 6000, "it rained."),
      ]),
    ).toEqual(["and then", "nothing happened.", "and then it rained."]);
  });

  it("joins at most 3 cues and about 25 words", () => {
    expect(
      texts([
        cue(0, 1000, "one"),
        cue(1000, 2000, "two"),
        cue(2000, 3000, "three"),
        cue(3000, 4000, "four"),
      ]),
    ).toEqual(["one two three", "four"]);
    const words = (n: number) =>
      Array.from({ length: n }, () => "word").join(" ");
    expect(
      texts([
        cue(0, 1000, words(12)),
        cue(1000, 2000, words(12)),
        cue(2000, 3000, words(2)),
      ]).map((t) => t.split(" ").length),
    ).toEqual([24, 2]);
  });

  it("keeps speaker-dash lines as their own sentences", () => {
    expect(
      texts([
        cue(0, 1000, "WAIT, WHERE ARE YOU"),
        cue(1000, 2000, "- GOING"),
        cue(2000, 3000, "- HOME.\n- WHY"),
        cue(3000, 4000, "WOULD YOU?"),
        cue(4000, 5000, "- WHERE ARE YOU"),
        cue(5000, 6000, "GOING?"),
      ]),
    ).toEqual([
      "WAIT, WHERE ARE YOU",
      "- GOING",
      "- HOME.\n- WHY",
      "WOULD YOU?",
      // One speaker's sentence goes on in the next cue.
      "- WHERE ARE YOU GOING?",
    ]);
  });

  it("keeps sound labels on their own", () => {
    expect(
      texts([
        cue(0, 1000, "[DOOR OPENS]"),
        cue(1000, 2000, "SO"),
        cue(2000, 3000, "(LAUGHS)"),
      ]),
    ).toEqual(["[DOOR OPENS]", "SO", "(LAUGHS)"]);
  });

  it("joins without spaces for languages written without them", () => {
    const { cards } = sentenceCards(
      [cue(0, 1000, "そうなんだ"), cue(1000, 2000, "知らなかった。")],
      { joiner: "" },
    );
    expect(cards.map((c) => c.text)).toEqual(["そうなんだ知らなかった。"]);
  });

  it("makes cards of Netflix's closed captions", () => {
    const captions = parseTtml(
      readFileSync(
        new URL("./fixtures/netflix/en.imsc.ttml", import.meta.url),
        "utf8",
      ),
    );
    const { cards, lines } = sentenceCards(captions);
    expect(cards.map((c) => c.text.replaceAll("\n", " "))).toEqual([
      "GOOD EVENING, AND WELCOME BACK TO THE WORKSHOP.",
      "TONIGHT WE TALK ABOUT CREATIVITY IN THE CLASSROOM.",
      "EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.",
      "WE SHOULD NURTURE IT, NOT STIFLE IT.",
      "[AUDIENCE APPLAUDS]",
      "MISTAKES ARE PART OF LEARNING.",
      "IF YOU ARE NOT PREPARED TO BE WRONG, YOU WILL NEVER COME UP WITH ANYTHING ORIGINAL.",
      "THAT IS THE HEART OF THE MATTER.",
      "THANK YOU. BRAVO!",
    ]);
    // Every cue is a line, its text as it was.
    expect(lines).toHaveLength(captions.length);
    lines.forEach((line, i) => {
      expect(cards[line.card]!.text.slice(line.start, line.end)).toBe(
        captions[i]!.text,
      );
      expect([line.startMs, line.endMs]).toEqual([
        captions[i]!.startMs,
        captions[i]!.endMs,
      ]);
    });
  });

  it("makes cards of a YouTube manual track", () => {
    const manual = parseYouTubeJson3(
      readFileSync(
        new URL("./fixtures/youtube/en.json3", import.meta.url),
        "utf8",
      ),
    );
    const flat = sentenceCards(manual).cards.map((c) =>
      c.text.replaceAll("\n", " "),
    );
    expect(flat).toContain(
      "There have been three themes running through the conference, which are relevant to what I want to talk about.",
    );
    expect(flat).toContain(
      "One is the extraordinary evidence of human creativity in all of the presentations that we've had and in all of the people here;",
    );
    expect(flat).toContain("just the variety of it and the range of it.");
    expect(flat).toContain("(Laughter)");
  });
});

describe("oneLinePerCard", () => {
  it("makes each card its own subtitle line", () => {
    const cards = [
      cue(0, 1000, "the yeast smells tangy."),
      cue(1000, 2000, "knead"),
    ];
    expect(oneLinePerCard(cards)).toEqual({
      cards,
      lines: [
        { startMs: 0, endMs: 1000, card: 0, start: 0, end: 23 },
        { startMs: 1000, endMs: 2000, card: 1, start: 0, end: 5 },
      ],
    });
  });
});
