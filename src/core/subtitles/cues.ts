import type { Cue } from "./types";

type Timed = Pick<Cue, "startMs" | "endMs">;

/**
 * Index of the last cue (sorted by start time) that started at or before `ms`, or -1
 * before the first one.
 */
export const lastStartedIndex = (cues: readonly Timed[], ms: number) =>
  lowerBound(cues.length, (i) => cues[i]!.startMs <= ms) - 1;

/** The first index in `0…length` where `before` is false; `before` holds for a prefix of them. */
export function lowerBound(
  length: number,
  before: (i: number) => boolean,
): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Index of the cue playing at `ms` in cues sorted by start time, or -1.
 * A cue covers [startMs, endMs). When cues overlap, the one that started last wins.
 */
export function cueIndexAt(cues: readonly Timed[], ms: number): number {
  const found = lastStartedIndex(cues, ms);
  if (found < 0) return -1;
  return ms < (cues[found] as Timed).endMs ? found : -1;
}

export function cueAt(cues: readonly Cue[], ms: number): Cue | undefined {
  const index = cueIndexAt(cues, ms);
  return index < 0 ? undefined : cues[index];
}

/** Text that ends a sentence: . ! ? … ♪ (or their CJK forms), maybe before closing quotes. */
export const SENTENCE_END = /[.!?。！？…♪][”"'’)\]」』]*$/;
const SOUND_LABEL = /^[[(（].*[\])）]$/;

/** A sound label such as "[Music]", "(LAUGHS)" or "（拍手）". */
export function isSoundLabel(text: string): boolean {
  return SOUND_LABEL.test(text.trim());
}

/** One subtitle line shown in the video: a part of a transcript card's text. */
export interface SubtitleLine {
  startMs: number;
  endMs: number;
  /** The card (sentence) the line is part of. */
  card: number;
  /** Where the line's text is in the card's text: [start, end). */
  start: number;
  end: number;
}

/** Transcript cards and the subtitle lines they are made of. */
export interface SentenceCards {
  cards: Cue[];
  /** Sorted by start time, like the cues they come from. */
  lines: SubtitleLine[];
}
