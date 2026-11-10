import type { Cue } from "./types";

/** Anything with a start and an end (a cue, a subtitle line). */
type Timed = Pick<Cue, "startMs" | "endMs">;

/**
 * Index of the last cue (sorted by start time) that started at or before `ms`, or -1
 * before the first one.
 */
export function lastStartedIndex(cues: readonly Timed[], ms: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((cues[mid] as Timed).startMs <= ms) {
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
export function cueIndexAt(cues: readonly Timed[], ms: number): number {
  const found = lastStartedIndex(cues, ms);
  if (found < 0) return -1;
  return ms < (cues[found] as Timed).endMs ? found : -1;
}

/** The cue playing at `ms`, if any. See {@link cueIndexAt}. */
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

export interface SentenceOptions {
  /** A silence this long or longer ends a sentence (ms). */
  maxGapMs?: number;
  /** The most cues in one card. */
  maxCues?: number;
  /** The most words in one card, roughly (a single cue may have more). */
  maxWords?: number;
  /** Put between the texts of joined cues ("" for languages written without spaces). */
  joiner?: string;
}

/** A line spoken by one speaker of a dialogue ("- Where?"). */
const SPEAKER_DASH = /^[-–—]/;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const lastLine = (text: string) =>
  text.slice(text.lastIndexOf("\n") + 1).trim();

/**
 * Turns subtitle cues into transcript cards of whole sentences: a cue that does not end a
 * sentence (. ? ! … ♪, maybe before a closing quote) is joined with the next one when that
 * starts less than `maxGapMs` later, up to `maxCues` cues and about `maxWords` words.
 * Sound labels such as "[MUSIC]" stay alone; a cue starting with a speaker's dash starts a
 * card, and a cue with two speakers' lines ends one. Each cue stays a subtitle line: the
 * part of its card's text it shows, with its own times.
 */
export function sentenceCards(
  cues: readonly Cue[],
  options: SentenceOptions = {},
): SentenceCards {
  const { maxGapMs = 1500, maxCues = 3, maxWords = 25, joiner = " " } = options;
  const cards: Cue[] = [];
  const lines: SubtitleLine[] = [];
  let members: Cue[] = [];

  const goesOn = (previous: Cue, next: Cue) =>
    !SENTENCE_END.test(lastLine(previous.text)) &&
    !isSoundLabel(previous.text) &&
    !isSoundLabel(next.text) &&
    !SPEAKER_DASH.test(next.text.trim()) &&
    previous.text.split("\n").filter((l) => SPEAKER_DASH.test(l.trim()))
      .length < 2 &&
    next.startMs - previous.endMs < maxGapMs &&
    members.length < maxCues &&
    wordCount(members.map((c) => c.text).join(" ")) + wordCount(next.text) <=
      maxWords;

  const close = () => {
    if (members.length === 0) return;
    const card = cards.length;
    let text = "";
    for (const member of members) {
      if (text) text += joiner;
      lines.push({
        startMs: member.startMs,
        endMs: member.endMs,
        card,
        start: text.length,
        end: text.length + member.text.length,
      });
      text += member.text;
    }
    cards.push({
      startMs: members[0]!.startMs,
      endMs: Math.max(...members.map((c) => c.endMs)),
      text,
    });
    members = [];
  };

  for (const cue of cues) {
    const previous = members[members.length - 1];
    if (previous && !goesOn(previous, cue)) close();
    members.push(cue);
  }
  close();
  return { cards, lines };
}
