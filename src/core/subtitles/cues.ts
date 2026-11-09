import { normalizeCueText } from "./text";
import type { Cue } from "./types";

/**
 * Index of the last cue (sorted by start time) that started at or before `ms`, or -1
 * before the first one.
 */
export function lastStartedIndex(cues: readonly Cue[], ms: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((cues[mid] as Cue).startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Index of the cue playing at `ms` in cues sorted by start time, or -1.
 * A cue covers [startMs, endMs). When cues overlap, the one that started last wins.
 */
export function cueIndexAt(cues: readonly Cue[], ms: number): number {
  const found = lastStartedIndex(cues, ms);
  if (found < 0) return -1;
  return ms < (cues[found] as Cue).endMs ? found : -1;
}

/** The cue playing at `ms`, if any. See {@link cueIndexAt}. */
export function cueAt(cues: readonly Cue[], ms: number): Cue | undefined {
  const index = cueIndexAt(cues, ms);
  return index < 0 ? undefined : cues[index];
}

export interface MergeOptions {
  /** A silence at least this long ends a sentence (ms). */
  pauseMs?: number;
  /** A sentence longer than this is split at its largest gap. */
  maxWords?: number;
  /** A pause does not end a sentence shorter than this. */
  minWords?: number;
  /** Put between words of different cues when the next word has no leading space ("" for Japanese). */
  joiner?: string;
}

interface Token {
  startMs: number;
  text: string;
  /** End of the cue the word came from. */
  cueEndMs: number;
}

/** Rough time to say a word, so the gap between two word starts can approximate a silence. */
const MS_PER_CHAR = 70;
const SENTENCE_END = /[.!?。！？…][”"'’)\]」』]*$/;
const SOUND_LABEL = /^[[(（].*[\])）]$/;

function isSoundLabel(token: Token): boolean {
  return SOUND_LABEL.test(token.text.trim());
}

function gapBefore(tokens: readonly Token[], i: number): number {
  const previous = tokens[i - 1] as Token;
  const current = tokens[i] as Token;
  return (
    current.startMs -
    previous.startMs -
    previous.text.trim().length * MS_PER_CHAR
  );
}

/**
 * Turns YouTube's rolling ASR fragments (a few words per cue, overlapping, often without
 * punctuation) into sentence-sized cues for the transcript. A sentence ends after
 * sentence punctuation, at a pause, around a sound label such as "[Music]", or, when it
 * grows past `maxWords`, at its largest gap. The result is sorted and does not overlap.
 */
export function mergeAsrFragments(
  cues: readonly Cue[],
  options: MergeOptions = {},
): Cue[] {
  const { pauseMs = 800, maxWords = 20, minWords = 2, joiner = " " } = options;

  const tokens: Token[] = [];
  for (const cue of cues) {
    const words = cue.words?.length
      ? cue.words
      : [{ startMs: cue.startMs, text: cue.text }];
    words.forEach((word, i) => {
      if (word.text.trim() === "") return;
      const text =
        i === 0 && !/^\s/.test(word.text) ? joiner + word.text : word.text;
      tokens.push({ startMs: word.startMs, text, cueEndMs: cue.endMs });
    });
  }

  const sentences: Token[][] = [];
  let current: Token[] = [];
  tokens.forEach((token, i) => {
    const previous = current[current.length - 1];
    if (previous) {
      const boundary =
        SENTENCE_END.test(previous.text.trim()) ||
        isSoundLabel(previous) ||
        isSoundLabel(token) ||
        (current.length >= minWords && gapBefore(tokens, i) >= pauseMs);
      if (boundary) {
        sentences.push(current);
        current = [];
      } else if (current.length >= maxWords) {
        const split = largestGap([...current, token], minWords);
        sentences.push(current.slice(0, split));
        current = current.slice(split);
      }
    }
    current.push(token);
  });
  if (current.length) sentences.push(current);

  return sentences.map((sentence, i) => {
    const first = sentence[0] as Token;
    const last = sentence[sentence.length - 1] as Token;
    const nextStart = sentences[i + 1]?.[0]?.startMs;
    return {
      startMs: first.startMs,
      endMs:
        nextStart === undefined
          ? last.cueEndMs
          : Math.min(last.cueEndMs, nextStart),
      text: normalizeCueText(sentence.map((t) => t.text).join("")),
    };
  });
}

/**
 * Where to split `run` (the sentence so far plus the incoming word): the largest gap that
 * leaves at least `minWords` before it. Splitting right before the incoming word is allowed.
 */
function largestGap(run: readonly Token[], minWords: number): number {
  let best = run.length - 1;
  let bestGap = -Infinity;
  for (let k = Math.max(1, minWords); k < run.length; k++) {
    const gap = gapBefore(run, k);
    if (gap > bestGap) {
      bestGap = gap;
      best = k;
    }
  }
  return best;
}
