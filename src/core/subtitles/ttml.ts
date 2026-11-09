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
 * (tts:ruby="text", on the span or on a <style> it refers to) are dropped;
 * xml:space="preserve" on <p> or <tt> keeps the line breaks in the text. Paragraphs with
 * the same begin and end are one on-screen subtitle (Netflix gives each line its own <p>):
 * they become one cue, lines ordered top to bottom, then left to right, by tts:origin
 * (on the <p>, else on its region). Not supported: timing on <body>/<div>/<span>
 * (subtitle files put it on <p>). Layout (writing mode, shear) is ignored: text only.
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

/** Attributes of the elements named `name` with an xml:id, by id. */
function elementsById(
  document: string,
  name: string,
): Map<string, Map<string, string>> {
  const byId = new Map<string, Map<string, string>>();
  const pattern = new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*?)\\/?>`, "g");
  for (const match of document.matchAll(pattern)) {
    const attrs = attributes(match[1] ?? "");
    const id = attrs.get("id");
    if (id) byId.set(id, attrs);
  }
  return byId;
}

type Styles = Map<string, Map<string, string>>;

/** A styling attribute of an element: its own, else from the styles it refers to. */
function styled(
  attrs: Map<string, string>,
  name: string,
  styles: Styles,
  depth = 0,
): string | undefined {
  const own = attrs.get(name);
  if (own !== undefined || depth > 8) return own;
  for (const id of (attrs.get("style") ?? "").split(/\s+/)) {
    const style = styles.get(id);
    const value = style && styled(style, name, styles, depth + 1);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Text of a <p>'s content: tags stripped, <br/> as "\n", ruby readings dropped. */
function paragraphText(
  content: string,
  styles: Styles,
  preserve: boolean,
): string {
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
        else
          spans.push(styled(attributes(rest ?? ""), "ruby", styles) === "text");
      }
      continue;
    }
    if (spans.includes(true)) continue;
    out += decodeEntities(
      preserve ? token.replace(/\r\n?/g, "\n") : token.replace(/\s+/g, " "),
    );
  }
  return normalizeCueText(out);
}

const PARAGRAPH =
  /<(?:[\w-]+:)?p\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?p\s*>)/g;

/** The x and y of a tts:origin ("10.00% 84.62%", "120px 400px"), or undefined. */
function origin(value: string | undefined): [number, number] | undefined {
  const [x, y] = (value ?? "").trim().split(/\s+/).map(parseFloat);
  return x !== undefined && y !== undefined && Number.isFinite(x + y)
    ? [x, y]
    : undefined;
}

interface Line {
  startMs: number;
  endMs: number;
  text: string;
  at: [number, number] | undefined;
}

/** One subtitle's lines: top to bottom, then left to right, when every line has a place. */
function joinLines(lines: Line[]): string {
  const placed = lines.every((line) => line.at)
    ? [...lines].sort((a, b) => a.at![1] - b.at![1] || a.at![0] - b.at![0])
    : lines;
  return placed.map((line) => line.text).join("\n");
}

/** Parses a TTML / DFXP document into cues sorted by start time. */
export function parseTtml(source: string): Cue[] {
  const document = source.replace(/<!--[\s\S]*?-->/g, "");
  const base = timeBase(document);
  const styles = elementsById(document, "style");
  const regions = elementsById(document, "region");
  const preserveAll =
    attributes(/<(?:[\w-]+:)?tt\b([^>]*)>/.exec(document)?.[1] ?? "").get(
      "space",
    ) === "preserve";
  // Lines by their times, in the file's order.
  const subtitles = new Map<string, Line[]>();
  for (const match of document.matchAll(PARAGRAPH)) {
    const attrs = attributes(match[1] ?? "");
    const startMs = parseTime(attrs.get("begin"), base);
    if (startMs === undefined) continue;
    const end = parseTime(attrs.get("end"), base);
    const dur = parseTime(attrs.get("dur"), base);
    const endMs = end ?? (dur !== undefined ? startMs + dur : undefined);
    if (endMs === undefined) continue;
    const space = attrs.get("space");
    const preserve = space === undefined ? preserveAll : space === "preserve";
    const text = paragraphText(match[2] ?? "", styles, preserve);
    if (text === "") continue;
    const region = regions.get(attrs.get("region") ?? "");
    const at =
      origin(attrs.get("origin")) ??
      origin(region && styled(region, "origin", styles));
    const key = `${startMs}-${endMs}`;
    const lines = subtitles.get(key) ?? [];
    lines.push({ startMs, endMs, text, at });
    subtitles.set(key, lines);
  }
  const cues: Cue[] = [];
  for (const lines of subtitles.values()) {
    const { startMs, endMs } = lines[0]!;
    cues.push({ startMs, endMs, text: joinLines(lines) });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}
