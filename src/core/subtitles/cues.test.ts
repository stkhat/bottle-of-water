import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cueAt, cueIndexAt, lastStartedIndex, mergeAsrFragments } from "./cues";
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
