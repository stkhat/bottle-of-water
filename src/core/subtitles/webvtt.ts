import { decodeEntities, normalizeCueText } from "./text";
import type { Cue } from "./types";

const TIMESTAMP = String.raw`(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})`;
const TIMING = new RegExp(`^\\s*${TIMESTAMP}\\s+-->\\s+${TIMESTAMP}`);

function toMs(
  hours: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
  millis: string | undefined,
): number {
  return (
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(millis)
  );
}

/** Cue payload to plain text: ruby readings dropped, tags and inline timestamps stripped. */
function payloadText(payload: string): string {
  const plain = payload
    .replace(/<rt\b[^>]*>[\s\S]*?<\/rt\s*>/g, "")
    .replace(/<rp\b[^>]*>[\s\S]*?<\/rp\s*>/g, "")
    .replace(/<[^>]*>/g, "");
  return normalizeCueText(decodeEntities(plain));
}

/** Parses a WebVTT file into cues sorted by start time. Cue settings are ignored. */
export function parseWebVtt(text: string): Cue[] {
  const lines = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(?:[ \t]|\n|$)/.test(lines)) return [];

  const cues: Cue[] = [];
  const blocks = lines.split(/\n[ \t]*\n/).slice(1);
  for (const block of blocks) {
    const blockLines = block.split("\n");
    while (blockLines[0]?.trim() === "") blockLines.shift();
    const first = blockLines[0] ?? "";
    if (/^(NOTE|STYLE|REGION)(?:[ \t]|$)/.test(first)) continue;
    const timingIndex = blockLines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0 || timingIndex > 1) continue;
    const timing = TIMING.exec(blockLines[timingIndex] ?? "");
    if (!timing) continue;
    const startMs = toMs(timing[1], timing[2], timing[3], timing[4]);
    const endMs = toMs(timing[5], timing[6], timing[7], timing[8]);
    const cueText = payloadText(blockLines.slice(timingIndex + 1).join("\n"));
    if (cueText === "") continue;
    cues.push({ startMs, endMs, text: cueText });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}
