import { normalizeCueText } from "./text";
import type { Cue, CueWord, Track } from "./types";

/** YouTube's timedtext response with `fmt=json3`. Only the fields we read. */
export interface Json3 {
  events?: Json3Event[];
}

export interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  /** 1 when the event adds to the window instead of starting a new line (ASR line breaks). */
  aAppend?: number;
  segs?: { utf8?: string; tOffsetMs?: number }[];
}

/** How long a cue lasts when the event has no duration and nothing follows it. */
const LAST_CUE_MS = 3000;

interface Draft {
  startMs: number;
  durationMs: number | undefined;
  raw: string;
  words: CueWord[] | undefined;
}

/**
 * Parses a json3 timedtext body into cues sorted by start time.
 * Events without text (the ASR window definition, "\n"-only events) make no cue;
 * appended events add their text to the cue before them.
 */
export function parseYouTubeJson3(input: string | Json3): Cue[] {
  const data = typeof input === "string" ? parseJson(input) : input;
  const events = Array.isArray(data?.events) ? data.events : [];

  const drafts: Draft[] = [];
  for (const event of events) {
    if (!Array.isArray(event.segs) || typeof event.tStartMs !== "number")
      continue;
    const raw = event.segs.map((seg) => seg.utf8 ?? "").join("");
    if (event.aAppend) {
      const previous = drafts[drafts.length - 1];
      if (previous && raw.trim() !== "") previous.raw += raw;
      continue;
    }
    if (normalizeCueText(raw) === "") continue;
    const start = event.tStartMs;
    drafts.push({
      startMs: start,
      durationMs: event.dDurationMs,
      raw,
      words:
        event.segs.length > 1
          ? event.segs.map((seg) => ({
              startMs: start + (seg.tOffsetMs ?? 0),
              text: seg.utf8 ?? "",
            }))
          : undefined,
    });
  }

  drafts.sort((a, b) => a.startMs - b.startMs);
  return drafts.map((draft, i) => {
    const next = drafts[i + 1];
    const endMs =
      draft.durationMs !== undefined
        ? draft.startMs + draft.durationMs
        : next
          ? next.startMs
          : draft.startMs + LAST_CUE_MS;
    const cue: Cue = {
      startMs: draft.startMs,
      endMs,
      text: normalizeCueText(draft.raw),
    };
    if (draft.words) cue.words = draft.words;
    return cue;
  });
}

function parseJson(text: string): Json3 | undefined {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as Json3;
  } catch {
    return undefined;
  }
}

/** A YouTube caption track with what is needed to fetch it. */
export interface YouTubeTrack extends Track {
  baseUrl: string;
  /** The site can auto-translate this track (`&tlang=`). */
  translatable: boolean;
}

export interface YouTubeCaptionInfo {
  tracks: YouTubeTrack[];
  /** Languages YouTube can auto-translate a translatable track into. */
  translationLanguages: string[];
}

interface RawCaptionTrack {
  baseUrl?: string;
  vssId?: string;
  languageCode?: string;
  kind?: string;
  isTranslatable?: boolean;
  name?: { simpleText?: string; runs?: { text?: string }[] };
}

interface RawPlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: RawCaptionTrack[];
      translationLanguages?: { languageCode?: string }[];
    };
  };
}

/** Reads the caption tracks from a player response (`ytInitialPlayerResponse` or `getPlayerResponse()`). */
export function youtubeCaptionInfo(
  playerResponse: unknown,
): YouTubeCaptionInfo {
  const renderer = (playerResponse as RawPlayerResponse | null | undefined)
    ?.captions?.playerCaptionsTracklistRenderer;
  const tracks: YouTubeTrack[] = [];
  for (const raw of renderer?.captionTracks ?? []) {
    if (!raw.baseUrl || !raw.languageCode) continue;
    const kind = raw.kind === "asr" ? "asr" : "manual";
    tracks.push({
      id: raw.vssId ?? `${kind === "asr" ? "a" : ""}.${raw.languageCode}`,
      lang: raw.languageCode,
      kind,
      label:
        raw.name?.simpleText ??
        raw.name?.runs?.map((run) => run.text ?? "").join("") ??
        raw.languageCode,
      baseUrl: raw.baseUrl,
      translatable: raw.isTranslatable === true,
    });
  }
  const translationLanguages = (renderer?.translationLanguages ?? [])
    .map((language) => language.languageCode)
    .filter((code): code is string => typeof code === "string");
  return { tracks, translationLanguages };
}
