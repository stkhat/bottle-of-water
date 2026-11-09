/**
 * Messages between Lingo's page script on netflix.com (MAIN world, `netflix-page.ts`)
 * and its content script (isolated world, `netflix-bridge.ts`), sent with
 * `window.postMessage` to the page's own origin. The page can read and forge these, so
 * both sides check the shape of what they receive and treat it as untrusted data.
 * Imported by the page script: keep this file free of runtime dependencies.
 */
import type { NetflixTextTrack } from "./netflix-manifest";

/** `source` of messages from the page script. */
export const FROM_PAGE = "lingo-nf";
/** `source` of messages to the page script. */
export const TO_PAGE = "lingo-nf-request";

/** The subtitle tracks of a manifest the player parsed, posted as it is parsed. */
export interface TracksMessage {
  source: typeof FROM_PAGE;
  type: "tracks";
  movieId: string;
  /** Their URLs carry tokens: keep them in memory only. */
  tracks: NetflixTextTrack[];
}

/** What the content script can ask the page script for. */
export type PageCall =
  /** The tracks of a title whose manifest the page script has seen (null if none). */
  | { type: "getTracks"; movieId: string }
  /** The id of the title the player plays. */
  | { type: "currentMovieId" }
  /** The title's name from the player's metadata. */
  | { type: "title"; movieId: string }
  /** Downloads a subtitle URL from a seen manifest and answers its text. */
  | { type: "fetchText"; url: string }
  /** Seeks through Netflix's player (setting `currentTime` breaks its playback). */
  | { type: "seek"; ms: number };

export interface PageCallResults {
  getTracks: NetflixTextTrack[] | null;
  currentMovieId: string | null;
  title: string | null;
  fetchText: string;
  seek: null;
}

export interface CallMessage {
  source: typeof TO_PAGE;
  id: string;
  call: PageCall;
}

export interface ReplyMessage {
  source: typeof FROM_PAGE;
  type: "reply";
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

export function isCallMessage(data: unknown): data is CallMessage {
  if (!isObject(data) || data.source !== TO_PAGE) return false;
  if (!isString(data.id) || !isObject(data.call)) return false;
  const call = data.call;
  switch (call.type) {
    case "getTracks":
    case "title":
      return isString(call.movieId);
    case "currentMovieId":
      return true;
    case "fetchText":
      return isString(call.url);
    case "seek":
      return typeof call.ms === "number" && Number.isFinite(call.ms);
    default:
      return false;
  }
}

/** A track as the page script posts it (checked field by field). */
export function isTextTrack(value: unknown): value is NetflixTextTrack {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.lang) &&
    isString(value.label) &&
    (value.kind === "subtitles" || value.kind === "closedcaptions") &&
    typeof value.forced === "boolean" &&
    Array.isArray(value.downloads) &&
    value.downloads.length > 0 &&
    value.downloads.every(
      (d) =>
        isObject(d) &&
        isString(d.format) &&
        Array.isArray(d.urls) &&
        d.urls.length > 0 &&
        d.urls.every(isString),
    )
  );
}

export const isTrackList = (value: unknown): value is NetflixTextTrack[] =>
  Array.isArray(value) && value.every(isTextTrack);

export function isTracksMessage(data: unknown): data is TracksMessage {
  return (
    isObject(data) &&
    data.source === FROM_PAGE &&
    data.type === "tracks" &&
    isString(data.movieId) &&
    isTrackList(data.tracks)
  );
}

export function isReplyMessage(data: unknown): data is ReplyMessage {
  return (
    isObject(data) &&
    data.source === FROM_PAGE &&
    data.type === "reply" &&
    isString(data.id) &&
    typeof data.ok === "boolean"
  );
}
