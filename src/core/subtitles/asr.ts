import { primary } from "../languages";
import {
  isSoundLabel,
  lowerBound,
  SENTENCE_END,
  type SentenceCards,
  type SubtitleLine,
} from "./cues";
import { normalizeCueText } from "./text";
import type { Cue } from "./types";

/**
 * Auto-generated (ASR) tracks: YouTube sends a rolling window of a few words per cue,
 * overlapping, often without punctuation. These functions turn them into transcript cards
 * of whole sentences, each shown in the video as one or more short subtitle lines.
 */

interface Token {
  startMs: number;
  /** As the site sent it, with the space before it ("" or the joiner for a cue's first word). */
  text: string;
  cueEndMs: number;
}

export interface AsrOptions {
  /** Put between words of different cues when the next word has no leading space ("" for Japanese). */
  joiner?: string;
  /** Language of the track; sentence starters ("so", "today", "I"…) are only known for English. */
  lang?: string;
  /** A subtitle line longer than this is split (characters; default 60, 30 without spaces). */
  maxLineChars?: number;
}

export interface MergeOptions extends AsrOptions {
  /** A silence at least this long ends a sentence (ms). Ignored in punctuated tracks. */
  pauseMs?: number;
  /** A sentence longer than this is split at its largest gap (default 20, MAX_CARD_WORDS in punctuated tracks). */
  maxWords?: number;
  /** A pause does not end a sentence shorter than this. */
  minWords?: number;
}

/** Transcript cards with the translation of each, made from the same sentences. */
export interface TranslatedCards extends SentenceCards {
  translations: string[];
}

/** The most words in one transcript card of an auto-generated track. */
const MAX_CARD_WORDS = 30;
/** Rough time to say a character, to estimate where a word ends from where it starts. */
const MS_PER_CHAR = 70;
/** A track counts as punctuated when this share of its words end a sentence. */
const PUNCTUATED_SHARE = 0.02;
const SPEAKER_CHANGE = /^>>/;

const clean = (text: string) => normalizeCueText(text).replace(/\n/g, " ");

function tokensOf(cues: readonly Cue[], joiner: string): Token[] {
  const tokens: Token[] = [];
  for (const cue of cues) {
    const words = cue.words?.length
      ? cue.words
      : [{ startMs: cue.startMs, text: cue.text }];
    words.forEach((word, i) => {
      if (clean(word.text) === "") return;
      const text =
        i === 0 && !/^\s/.test(word.text) ? joiner + word.text : word.text;
      tokens.push({ startMs: word.startMs, text, cueEndMs: cue.endMs });
    });
  }
  return tokens;
}

const endsSentence = (token: Token) => SENTENCE_END.test(token.text.trim());
const startsSpeaker = (token: Token) => SPEAKER_CHANGE.test(token.text.trim());

function isPunctuated(tokens: readonly Token[]): boolean {
  if (tokens.length === 0) return false;
  return tokens.filter(endsSentence).length / tokens.length >= PUNCTUATED_SHARE;
}

/** The time between the start of `tokens[i - 1]` and `tokens[i]`, less the time to say it. */
function gapBefore(tokens: readonly Token[], i: number): number {
  const previous = tokens[i - 1] as Token;
  const current = tokens[i] as Token;
  return (
    current.startMs -
    previous.startMs -
    clean(previous.text).length * MS_PER_CHAR
  );
}

/**
 * Sentences by the track's own cues: a sentence ends after sentence punctuation, around a
 * sound label such as "[Music]", before a speaker change (">>"), at a pause (only in tracks
 * without punctuation), or, when it grows past `maxWords`, at its largest gap.
 */
function sentencesByPauses(
  tokens: readonly Token[],
  options: MergeOptions,
): Token[][] {
  const punctuated = isPunctuated(tokens);
  const pauseMs = punctuated ? Infinity : (options.pauseMs ?? 800);
  const maxWords = options.maxWords ?? (punctuated ? MAX_CARD_WORDS : 20);
  const minWords = options.minWords ?? 2;

  const sentences: Token[][] = [];
  let current: Token[] = [];
  tokens.forEach((token, i) => {
    const previous = current[current.length - 1];
    if (previous) {
      const boundary =
        endsSentence(previous) ||
        isSoundLabel(previous.text) ||
        isSoundLabel(token.text) ||
        startsSpeaker(token) ||
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
  return sentences;
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

/** Text of `tokens` as shown: cleaned, a space only where the site put one. */
function textOf(tokens: readonly Token[]): string {
  let text = "";
  for (const token of tokens) {
    const piece = clean(token.text);
    if (piece === "") continue;
    text += text !== "" && /^\s/.test(token.text) ? ` ${piece}` : piece;
  }
  return text;
}

const SPLIT_AFTER = /[,;:.!?、。！？…]["”'’)\]]*$/;

/**
 * Splits a sentence into subtitle lines of at most `maxChars` where it can: at the point that
 * best balances the two halves, preferring pauses, punctuation, sound labels and speaker changes.
 */
function splitLines(tokens: Token[], maxChars: number): Token[][] {
  if (tokens.length < 4 || textOf(tokens).length <= maxChars) return [tokens];
  const total = textOf(tokens).length;
  let best = 2;
  let bestScore = -Infinity;
  for (let k = 2; k <= tokens.length - 2; k++) {
    const left = textOf(tokens.slice(0, k)).length;
    const previous = (tokens[k - 1] as Token).text.trim();
    const next = tokens[k] as Token;
    const pause = Math.min(Math.max(gapBefore(tokens, k), 0), 1500) / 1000;
    const mark =
      SPLIT_AFTER.test(previous) ||
      startsSpeaker(next) ||
      isSoundLabel(previous) ||
      isSoundLabel(next.text)
        ? 0.3
        : 0;
    const score = -Math.abs(left / total - 0.5) + 0.2 * pause + mark;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return [
    ...splitLines(tokens.slice(0, best), maxChars),
    ...splitLines(tokens.slice(best), maxChars),
  ];
}

function cardsOf(
  sentences: readonly Token[][],
  options: AsrOptions,
): SentenceCards {
  const maxChars = options.maxLineChars ?? (options.joiner === "" ? 30 : 60);
  const cards: Cue[] = [];
  const lines: SubtitleLine[] = [];
  sentences.forEach((sentence, i) => {
    const first = sentence[0] as Token;
    const last = sentence[sentence.length - 1] as Token;
    const nextStart = sentences[i + 1]?.[0]?.startMs;
    const endMs =
      nextStart === undefined
        ? last.cueEndMs
        : Math.min(last.cueEndMs, nextStart);
    const card = cards.length;
    const parts = splitLines(sentence, maxChars);
    let text = "";
    parts.forEach((part, p) => {
      const partText = textOf(part);
      if (text !== "") text += /^\s/.test((part[0] as Token).text) ? " " : "";
      lines.push({
        startMs: (part[0] as Token).startMs,
        endMs: parts[p + 1]?.[0]?.startMs ?? endMs,
        card,
        start: text.length,
        end: text.length + partText.length,
      });
      text += partText;
    });
    cards.push({ startMs: first.startMs, endMs, text });
  });
  return { cards, lines };
}

/**
 * Transcript cards from an auto-generated track on its own (no site translation to follow):
 * sentences end at punctuation, sound labels, speaker changes and, in tracks without
 * punctuation, at pauses. Each card is shown as lines of at most `maxLineChars`.
 */
export function asrSentenceCards(
  cues: readonly Cue[],
  options: MergeOptions = {},
): SentenceCards {
  const tokens = tokensOf(cues, options.joiner ?? " ");
  return cardsOf(sentencesByPauses(tokens, options), options);
}

/** Common first words of an English sentence: a likely boundary in a track without punctuation. */
const EN_STARTERS = new Set(
  "so today i i'm i've i'll i'd we we're we've we'll it it's this that's now let's also but if hey hi okay ok well then there's what how when you're my first next anyway".split(
    " ",
  ),
);

const CJK_END = /[。！？]/;
const WESTERN_END = /[.!?…]/;
const OPENING = /[「『（(［[【]/;
const CLOSING = /[」』）)］\]】]/;

/** How far (ms) a translated sentence end may be from the boundary it marks. */
const WINDOW_MS = 15_000;
/** Cost of leaving a translated sentence end unmatched (two translated sentences, one card). */
const SKIP_COST = 8;
/** At most this many translated sentence ends in a row stay unmatched. */
const MAX_SKIPS = 4;

interface Candidate {
  /** Boundary after this token. */
  after: number;
  /** The boundary falls between the estimated end of the token and the next one's start. */
  fromMs: number;
  toMs: number;
  prior: number;
}

/** In punctuated tracks, a boundary this close (words) to a sentence end costs more. */
const NEAR_END_WORDS = 12;

function endsNear(tokens: readonly Token[], i: number, words: number) {
  const to = Math.min(tokens.length - 1, i + words);
  for (let q = Math.max(0, i - words); q <= to; q++)
    if (endsSentence(tokens[q] as Token)) return true;
  return false;
}

function candidatesOf(tokens: readonly Token[], lang: string): Candidate[] {
  const punctuated = isPunctuated(tokens);
  const starters = primary(lang) === "en" ? EN_STARTERS : new Set<string>();
  const candidates: Candidate[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const token = tokens[i] as Token;
    const next = tokens[i + 1] as Token;
    let prior: number;
    if (endsSentence(token) || startsSpeaker(next)) prior = 0;
    else if (punctuated) {
      // Near a sentence end the translation's end most likely marks that one.
      const near = endsNear(tokens, i, NEAR_END_WORDS);
      const comma = /[,;:]$/.test(token.text.trim());
      prior = comma ? (near ? 6 : 3) : near ? 10 : 6;
    } else {
      const gap = Math.min(Math.max(gapBefore(tokens, i + 1), 0), 1200) / 1000;
      const word = next.text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}']/gu, "");
      prior = 1.2 - 0.5 * gap - (starters.has(word) ? 0.8 : 0);
    }
    const said = token.startMs + clean(token.text).length * MS_PER_CHAR;
    candidates.push({
      after: i,
      fromMs: Math.min(said, next.startMs),
      toMs: next.startMs,
      prior,
    });
  }
  return candidates;
}

/** A piece of a translated sentence up to a clause mark (、 , ;) or the sentence's end. */
interface Clause {
  /** As in the stream, not cleaned. */
  raw: string;
  /** When its last character has been said (ms), spread over the cue's time. */
  ms: number;
}

interface TranslatedSentences {
  /** Each translated sentence; the last may have no end mark. */
  texts: string[];
  /** When each sentence's end mark is said (ms), for every sentence that has one. */
  endsMs: number[];
  /** Each sentence cut at its clause marks, in order: a long card's translation may be cut there. */
  clauses: Clause[][];
}

/**
 * A bracket that closes within this many characters holds a short quotation or a label
 * (「いいね！」, （音楽）): the marks inside it end nothing. A longer quotation is speech of its
 * own whose sentences end inside it, and an opening that never closes (YouTube's translation
 * often loses the closing one) must not swallow every sentence end after it.
 */
const SHORT_BRACKET_CHARS = 20;

/** Which characters of `stream` are inside a short bracket pair (SHORT_BRACKET_CHARS). */
function inShortBrackets(stream: string): boolean[] {
  const inside = new Array<boolean>(stream.length).fill(false);
  const open: number[] = [];
  for (let p = 0; p < stream.length; p++) {
    const c = stream[p] as string;
    if (OPENING.test(c)) open.push(p);
    else if (CLOSING.test(c) && open.length > 0) {
      const from = open.pop() as number;
      if (p - from <= SHORT_BRACKET_CHARS)
        for (let q = from + 1; q < p; q++) inside[q] = true;
    }
  }
  return inside;
}

/** A mark that ends a clause: 、，；, or a comma or semicolon before a space. */
const CLAUSE_END = /[、，；]/;
const WESTERN_CLAUSE_END = /[,;]/;

/**
 * Splits a translation into sentences: after 。！？ anywhere, after . ! ? … before a space or
 * the end, but not inside a short bracket pair (「いいね！」を押して… goes on).
 */
function translatedSentences(
  cues: readonly Cue[],
  joiner: string,
): TranslatedSentences {
  let stream = "";
  const timeAt: number[] = [];
  /** When each character has been said: spread over its piece's time (clause ends only). */
  const saidAt: number[] = [];
  const tokens = tokensOf(cues, joiner);
  tokens.forEach((token, i) => {
    stream += token.text;
    const next = tokens[i + 1]?.startMs ?? token.cueEndMs;
    const until = Math.max(token.startMs, Math.min(next, token.cueEndMs));
    for (let k = 0; k < token.text.length; k++) {
      timeAt.push(token.startMs);
      saidAt.push(
        token.startMs + ((k + 1) / token.text.length) * (until - token.startMs),
      );
    }
  });
  const inside = inShortBrackets(stream);
  const spaceAt = (p: number) =>
    p >= stream.length || /\s/.test(stream[p] as string);
  const texts: string[] = [];
  const endsMs: number[] = [];
  const clauses: Clause[][] = [];
  let start = 0;
  let clauseStart = 0;
  let current: Clause[] = [];
  const cut = (end: number, ms: number) => {
    if (clean(stream.slice(clauseStart, end)) !== "")
      current.push({ raw: stream.slice(clauseStart, end), ms });
    clauseStart = end;
  };
  for (let p = 0; p < stream.length; p++) {
    const c = stream[p] as string;
    if (inside[p]) continue;
    if (CJK_END.test(c) || WESTERN_END.test(c)) {
      const cjk = CJK_END.test(c);
      let end = p + 1;
      while (
        end < stream.length &&
        /[。！？.!?…"”'’]/.test(stream[end] as string)
      )
        end++;
      if (!cjk && !spaceAt(end)) continue;
      texts.push(clean(stream.slice(start, end)));
      endsMs.push(timeAt[p] as number);
      cut(end, saidAt[p] as number);
      clauses.push(current);
      current = [];
      start = end;
      p = end - 1;
    } else if (
      CLAUSE_END.test(c) ||
      (WESTERN_CLAUSE_END.test(c) && spaceAt(p + 1))
    )
      cut(p + 1, saidAt[p] as number);
  }
  const rest = clean(stream.slice(start));
  if (rest !== "") {
    texts.push(rest);
    cut(stream.length, saidAt[stream.length - 1] as number);
    clauses.push(current);
  }
  return { texts, endsMs, clauses };
}

const firstEndingAtOrAfter = (candidates: readonly Candidate[], ms: number) =>
  lowerBound(candidates.length, (i) => candidates[i]!.toMs < ms);

interface Row {
  lo: number;
  cost: Float64Array;
  /** Previous match as row * 2^20 + candidate, or -1 for none. */
  from: Float64Array;
  /** Prefix minimum of `cost` and where it is. */
  min: Float64Array;
  argmin: Int32Array;
}

/**
 * Which candidate boundary each translated sentence end marks (-1: none, the sentence joins
 * the next one), as a monotonic alignment: the cost of a match is the distance in time
 * between the end mark and the boundary plus how unlikely the boundary is without it.
 */
function matchEnds(
  candidates: readonly Candidate[],
  endsMs: readonly number[],
): number[] | undefined {
  const m = endsMs.length;
  const rows: Row[] = [];
  const bestBefore = (row: Row, candidate: number) => {
    const k = Math.min(candidate - 1 - row.lo, row.cost.length - 1);
    return k < 0
      ? { value: Infinity, at: -1 }
      : { value: row.min[k] as number, at: row.lo + (row.argmin[k] as number) };
  };

  for (let j = 0; j < m; j++) {
    const endMs = endsMs[j] as number;
    const lo = firstEndingAtOrAfter(candidates, endMs - WINDOW_MS);
    let hi = lo;
    while (
      hi < candidates.length &&
      (candidates[hi] as Candidate).fromMs <= endMs + WINDOW_MS
    )
      hi++;
    const size = hi - lo;
    const row: Row = {
      lo,
      cost: new Float64Array(size).fill(Infinity),
      from: new Float64Array(size).fill(-1),
      min: new Float64Array(size),
      argmin: new Int32Array(size),
    };
    for (let k = 0; k < size; k++) {
      const c = candidates[lo + k] as Candidate;
      const distance =
        endMs < c.fromMs
          ? c.fromMs - endMs
          : endMs > c.toMs
            ? endMs - c.toMs
            : 0;
      const own = distance / 1000 + c.prior;
      let best = j <= MAX_SKIPS ? j * SKIP_COST : Infinity;
      let from = -1;
      for (let back = 1; back <= MAX_SKIPS + 1 && j - back >= 0; back++) {
        const previous = bestBefore(rows[j - back] as Row, lo + k);
        const value = previous.value + (back - 1) * SKIP_COST;
        if (value < best) {
          best = value;
          from = (j - back) * 2 ** 20 + previous.at;
        }
      }
      row.cost[k] = best + own;
      row.from[k] = from;
    }
    for (let k = 0; k < size; k++) {
      const previous = k > 0 ? (row.min[k - 1] as number) : Infinity;
      if ((row.cost[k] as number) < previous) {
        row.min[k] = row.cost[k] as number;
        row.argmin[k] = k;
      } else {
        row.min[k] = previous;
        row.argmin[k] = row.argmin[k - 1] as number;
      }
    }
    rows.push(row);
  }

  let best = m <= MAX_SKIPS ? m * SKIP_COST : Infinity;
  let at = -1;
  for (let j = Math.max(0, m - 1 - MAX_SKIPS); j < m; j++) {
    const row = rows[j] as Row;
    if (row.cost.length === 0) continue;
    const value =
      (row.min[row.cost.length - 1] as number) + (m - 1 - j) * SKIP_COST;
    if (value < best) {
      best = value;
      at = j * 2 ** 20 + row.lo + (row.argmin[row.cost.length - 1] as number);
    }
  }
  if (best === Infinity) return undefined;

  const matches = new Array<number>(m).fill(-1);
  while (at >= 0) {
    const j = Math.floor(at / 2 ** 20);
    const candidate = at % 2 ** 20;
    matches[j] = candidate;
    const row = rows[j] as Row;
    at = row.from[candidate - row.lo] as number;
  }
  return matches;
}

/** Neither part of a split card is shorter than this (words). */
const MIN_PART_WORDS = 4;
/** How much an uneven split costs (per share of the card away from an even one). */
const BALANCE_COST = 10;
/** A translated clause end further than this (s) from a split marks nothing there. */
const CLAUSE_WINDOW_S = 3;

/** A clause of the translation of a card, and which translated sentence it is part of. */
interface Unit extends Clause {
  sentence: number;
}

/**
 * Puts `tokens[from, to)` and its translation `units` into cards of at most MAX_CARD_WORDS
 * words: a longer one (YouTube translates a run-on as one long sentence) is split into as
 * few even parts as that takes, each split at the likeliest boundary (by the same priors as
 * sentence ends) near an even share, and its translation at the clause end said closest to
 * it. Without such a clause end there, both parts keep the whole translation, as a
 * translated line shows on every card it covers (rule G).
 */
function capCard(
  candidates: readonly Candidate[],
  from: number,
  to: number,
  units: readonly Unit[],
  push: (from: number, to: number, units: readonly Unit[]) => void,
): void {
  const words = to - from;
  if (words <= MAX_CARD_WORDS) return push(from, to, units);
  const parts = Math.ceil(words / MAX_CARD_WORDS);
  let best: { at: number; unit: number; cost: number } | undefined;
  for (let at = from + MIN_PART_WORDS; at <= to - MIN_PART_WORDS; at++) {
    const candidate = candidates[at - 1] as Candidate;
    const share = (at - from) / words;
    let balance = Infinity;
    for (let k = 1; k < parts; k++)
      balance = Math.min(balance, Math.abs(share - k / parts));
    let unit = -1;
    let distance = CLAUSE_WINDOW_S;
    for (let u = 1; u < units.length; u++) {
      const ms = (units[u - 1] as Unit).ms;
      const d =
        (ms < candidate.fromMs
          ? candidate.fromMs - ms
          : ms > candidate.toMs
            ? ms - candidate.toMs
            : 0) / 1000;
      if (d < distance) {
        distance = d;
        unit = u;
      }
    }
    const cost = candidate.prior + BALANCE_COST * balance + distance;
    if (!best || cost < best.cost) best = { at, unit, cost };
  }
  if (!best) return push(from, to, units);
  const { at, unit } = best;
  capCard(candidates, from, at, unit < 0 ? units : units.slice(0, unit), push);
  capCard(candidates, at, to, unit < 0 ? units : units.slice(unit), push);
}

/**
 * Transcript cards from an auto-generated track and the site's machine translation of it
 * (YouTube `tlang`). YouTube translates whole sentences, punctuating them even when the track
 * has no punctuation, and spreads each translation over the track's cues; so every sentence
 * end in the translation marks a sentence end in the track near that time. Each card gets
 * exactly the translated sentences between its ends. Undefined when the translation has no
 * sentence ends to follow.
 */
export function alignAsrSentences(
  cues: readonly Cue[],
  translated: readonly Cue[],
  options: AsrOptions & { translationJoiner?: string } = {},
): TranslatedCards | undefined {
  const tokens = tokensOf(cues, options.joiner ?? " ");
  if (tokens.length === 0) return undefined;
  const translation = translatedSentences(
    translated,
    options.translationJoiner ?? " ",
  );
  // The last end mark usually closes the whole text: it marks no boundary inside it.
  const inner =
    translation.texts.length === translation.endsMs.length
      ? translation.endsMs.slice(0, -1)
      : translation.endsMs;
  if (inner.length === 0) return undefined;
  const candidates = candidatesOf(tokens, options.lang ?? "");
  const matches = matchEnds(candidates, inner);
  if (!matches) return undefined;

  const sentences: Token[][] = [];
  const translations: string[] = [];
  const joiner = options.translationJoiner ?? " ";
  const textOfUnits = (units: readonly Unit[]) => {
    const parts: string[] = [];
    for (let i = 0; i < units.length;) {
      const { sentence } = units[i] as Unit;
      let j = i;
      while (j < units.length && (units[j] as Unit).sentence === sentence) j++;
      const whole =
        j - i === (translation.clauses[sentence] as Clause[]).length;
      parts.push(
        whole
          ? (translation.texts[sentence] as string)
          : clean(
              units
                .slice(i, j)
                .map((u) => u.raw)
                .join(""),
            ),
      );
      i = j;
    }
    return parts.filter((p) => p !== "").join(joiner);
  };
  const push = (from: number, to: number, units: readonly Unit[]) => {
    sentences.push(tokens.slice(from, to));
    translations.push(textOfUnits(units));
  };
  const unitsOf = (list: readonly number[]) =>
    list.flatMap((sentence) =>
      (translation.clauses[sentence] as Clause[]).map((clause) => ({
        ...clause,
        sentence,
      })),
    );
  const capped = (from: number, to: number, list: number[]) =>
    capCard(candidates, from, to, unitsOf(list), push);

  let start = 0;
  let pending: number[] = [];
  matches.forEach((candidate, j) => {
    pending.push(j);
    if (candidate < 0) return;
    const after = (candidates[candidate] as Candidate).after;
    capped(start, after + 1, pending);
    start = after + 1;
    pending = [];
  });
  for (let j = matches.length; j < translation.texts.length; j++)
    pending.push(j);
  capped(start, tokens.length, pending);
  return { ...cardsOf(sentences, options), translations };
}
