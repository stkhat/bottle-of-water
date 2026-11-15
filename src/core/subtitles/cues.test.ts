import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cueAt, cueIndexAt, lastStartedIndex } from "./cues";
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
