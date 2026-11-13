import { primary } from "../languages";
import { isSoundLabel, lowerBound } from "./cues";
import type { Cue, Track } from "./types";

/**
 * Where a video's translation comes from (spec, "Choosing a translation"). One choice per
 * video, never switched midway.
 * - siteTrack: the site's human-made subtitle track in the native language
 * - siteAutoTranslate: the site's machine translation of the original track (YouTube `tlang`)
 * - builtIn: the browser's built-in translator
 * - none: no translation
 */
export type TranslationChoice =
  | { source: "siteTrack"; track: Track }
  | { source: "siteAutoTranslate" }
  | { source: "builtIn" }
  | { source: "none" };

export interface TranslationInput {
  /** Every subtitle track the site offers for the video. */
  tracks: readonly Track[];
  nativeLang: string;
  /** The site can machine-translate the original track into the native language. */
  canAutoTranslate: boolean;
  /** The browser's built-in translator can translate the original language into the native one. */
  translatorAvailable: boolean;
}

export function chooseTranslation(input: TranslationInput): TranslationChoice {
  const native = input.nativeLang.toLowerCase();
  const manual = input.tracks.filter((t) => t.kind === "manual");
  const track =
    manual.find((t) => t.lang.toLowerCase() === native) ??
    manual.find((t) => primary(t.lang) === primary(native));
  if (track) return { source: "siteTrack", track };
  if (input.canAutoTranslate) return { source: "siteAutoTranslate" };
  if (input.translatorAvailable) return { source: "builtIn" };
  return { source: "none" };
}

/** Languages written without spaces between words or sentences. */
const NO_SPACE_LANGS = new Set(["ja", "zh", "yue", "th", "lo", "km", "my"]);

/** What goes between two joined translated lines in `lang`. */
export function joinerFor(lang: string): string {
  return NO_SPACE_LANGS.has(primary(lang)) ? "" : " ";
}

export interface AlignOptions {
  /** Language of the translated cues; decides how joined lines are separated. */
  lang: string;
}

/**
 * A translated cue also goes to every other original cue it covers at least this share of
 * (in time). Measured on human Japanese tracks timed apart from the English: at half, cards
 * left with no line drop to almost none while lines with a neighbour's text barely grow;
 * lower shares mostly add grazing neighbours (architecture.md, "Choosing a translation").
 */
const COVERED_SHARE = 0.5;

/**
 * Translated text for each original cue (transcript cards), in the same order as `original`.
 * Each translated cue goes to the original cue it overlaps most in time (ties go to the
 * earlier one), except that a spoken line goes to a sound label such as "(Laughter)" only
 * when it overlaps nothing else. It also goes to every other original cue of its kind
 * (spoken or sound label) that it covers at least half of, so a translated line that spans
 * two cards shows on both. Several landing on one cue are joined in time order. Translated
 * cues that overlap no original cue are dropped, and line breaks are flattened. Original
 * cues that get nothing map to "". When every translated cue starts exactly where an
 * original cue starts (YouTube auto-translation keeps the original's timing), cues are
 * mapped one to one. `original` must be sorted by start time; `translated` need not be.
 */
export function alignByOverlap(
  original: readonly Cue[],
  translated: readonly Cue[],
  options: AlignOptions,
): string[] {
  const joiner = joinerFor(options.lang);
  const flatten = (text: string) => text.split("\n").join(joiner);
  const parts: string[][] = original.map(() => []);

  const indexByStart = new Map<number, number>();
  original.forEach((cue, i) => {
    if (!indexByStart.has(cue.startMs)) indexByStart.set(cue.startMs, i);
  });
  const sameSegmentation =
    translated.length > 0 &&
    translated.every((t) => indexByStart.has(t.startMs));

  const longestMs = original.reduce(
    (max, cue) => Math.max(max, cue.endMs - cue.startMs),
    0,
  );
  // In time order, so that each card's lines are joined in the order they play.
  const inOrder = [...translated].sort((a, b) => a.startMs - b.startMs);
  for (const t of inOrder) {
    const targets = sameSegmentation
      ? [indexByStart.get(t.startMs) as number]
      : overlapping(original, t, longestMs);
    for (const target of targets) parts[target]?.push(flatten(t.text));
  }
  return parts.map((list) => list.join(joiner));
}

const firstStartingAtOrAfter = (cues: readonly Cue[], ms: number) =>
  lowerBound(cues.length, (i) => cues[i]!.startMs < ms);

/**
 * Indexes of the original cues `t` goes to, in order: the one it overlaps the most (a
 * spoken line skips sound labels when it overlaps a spoken cue too), and every other one of
 * its kind that it covers at least `COVERED_SHARE` of. Empty when it overlaps none.
 */
function overlapping(
  original: readonly Cue[],
  t: Cue,
  longestMs: number,
): number[] {
  // Only cues starting in (t.start - longest, t.end) can overlap t.
  const from = firstStartingAtOrAfter(original, t.startMs - longestMs);
  const to = firstStartingAtOrAfter(original, t.endMs);
  const spokenLine = !isSoundLabel(t.text);
  const best = { any: -1, anyOverlap: 0, spoken: -1, spokenOverlap: 0 };
  const covered: number[] = [];
  for (let i = from; i < to; i++) {
    const o = original[i] as Cue;
    const overlap = Math.min(o.endMs, t.endMs) - Math.max(o.startMs, t.startMs);
    if (overlap <= 0) continue;
    const spokenCue = !isSoundLabel(o.text);
    if (overlap > best.anyOverlap)
      Object.assign(best, { any: i, anyOverlap: overlap });
    if (spokenLine && spokenCue && overlap > best.spokenOverlap)
      Object.assign(best, { spoken: i, spokenOverlap: overlap });
    if (
      spokenCue === spokenLine &&
      overlap >= COVERED_SHARE * (o.endMs - o.startMs)
    )
      covered.push(i);
  }
  const most = best.spoken >= 0 ? best.spoken : best.any;
  if (most < 0) return [];
  return [...new Set([most, ...covered])].sort((a, b) => a - b);
}
