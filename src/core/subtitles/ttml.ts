import { decodeEntities, normalizeCueText } from "./text";
import type { Cue } from "./types";

/*
 * A small, tolerant TTML / DFXP reader for subtitle documents (Netflix serves these).
 * DOMParser is not available in every context we run in (Node tests, service worker),
 * and subtitle TTML only needs <p> timing and text, so this reads the markup directly.
 *
 * Supported: begin / end / dur on <p>; clock times (hh:mm:ss.fraction, hh:mm:ss:frames)
 * and offset times (h, m, s, ms, f, t); ttp:tickRate, ttp:frameRate and
 * ttp:frameRateMultiplier on <tt>; <br/> as a line break; nested spans; ruby readings
 * (tts:ruby="text") are dropped. Not supported: timing on <body>/<div>/<span>
 * (subtitle files put it on <p>), xml:space="preserve" (whitespace is always collapsed).
 */

interface TimeBase {
  tickRate: number;
  frameRate: number;
}

const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attributes(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1] ?? "";
    // Drop the namespace prefix: ttp:tickRate → tickRate
    map.set(name.slice(name.lastIndexOf(":") + 1), match[2] ?? match[3] ?? "");
  }
  return map;
}

function timeBase(document: string): TimeBase {
  const root = /<(?:[\w-]+:)?tt\b([^>]*)>/.exec(document);
  const attrs = attributes(root?.[1] ?? "");
  const frameRate = positive(attrs.get("frameRate")) ?? 30;
  const [num, den] = (attrs.get("frameRateMultiplier") ?? "1 1")
    .trim()
    .split(/\s+/)
    .map(Number);
  const effectiveFrameRate =
    num && den && num > 0 && den > 0 ? (frameRate * num) / den : frameRate;
  const tickRate =
    positive(attrs.get("tickRate")) ??
    (attrs.has("frameRate") ? effectiveFrameRate : 1);
  return { tickRate, frameRate: effectiveFrameRate };
}

function positive(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const CLOCK = /^(\d+):(\d{2}):(\d{2})(?:(\.\d+)|:(\d+)(?:\.\d+)?)?$/;
const OFFSET = /^(\d+(?:\.\d+)?)(h|ms|m|s|f|t)$/;

/** Parses a TTML time expression to milliseconds, or undefined when it is not one. */
function parseTime(
  value: string | undefined,
  base: TimeBase,
): number | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  const clock = CLOCK.exec(text);
  if (clock) {
    const seconds =
      Number(clock[1]) * 3600 +
      Number(clock[2]) * 60 +
      Number(clock[3]) +
      (clock[4] ? Number(clock[4]) : 0) +
      (clock[5] ? Number(clock[5]) / base.frameRate : 0);
    return Math.round(seconds * 1000);
  }
  const offset = OFFSET.exec(text);
  if (offset) {
    const n = Number(offset[1]);
    const unitMs: Record<string, number> = {
      h: 3_600_000,
      m: 60_000,
      s: 1000,
      ms: 1,
      f: 1000 / base.frameRate,
      t: 1000 / base.tickRate,
    };
    return Math.round(n * (unitMs[offset[2] ?? "s"] ?? 1000));
  }
  return undefined;
}

const TOKEN = /<[^>]*>|[^<]+/g;

/** Text of a <p>'s content: tags stripped, <br/> as "\n", ruby readings dropped. */
function paragraphText(content: string): string {
  let out = "";
  const spans: boolean[] = []; // true for a span whose content is skipped
  for (const [token] of content.matchAll(TOKEN)) {
    if (token.startsWith("<")) {
      const tag = /^<\s*(\/?)\s*(?:[\w-]+:)?([\w-]+)([^>]*?)(\/?)\s*>$/.exec(
        token,
      );
      if (!tag) continue;
      const [, closing, name, rest, selfClosing] = tag;
      if (name === "br") {
        if (!spans.includes(true)) out += "\n";
      } else if (name === "span" && !selfClosing) {
        if (closing) spans.pop();
        else spans.push(attributes(rest ?? "").get("ruby") === "text");
      }
      continue;
    }
    if (spans.includes(true)) continue;
    out += decodeEntities(token.replace(/\s+/g, " "));
  }
  return normalizeCueText(out);
}

const PARAGRAPH =
  /<(?:[\w-]+:)?p\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?p\s*>)/g;

/** Parses a TTML / DFXP document into cues sorted by start time. */
export function parseTtml(document: string): Cue[] {
  const base = timeBase(document);
  const cues: Cue[] = [];
  for (const match of document.matchAll(PARAGRAPH)) {
    const attrs = attributes(match[1] ?? "");
    const startMs = parseTime(attrs.get("begin"), base);
    if (startMs === undefined) continue;
    const end = parseTime(attrs.get("end"), base);
    const dur = parseTime(attrs.get("dur"), base);
    const endMs = end ?? (dur !== undefined ? startMs + dur : undefined);
    if (endMs === undefined) continue;
    const text = paragraphText(match[2] ?? "");
    if (text === "") continue;
    cues.push({ startMs, endMs, text });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}
