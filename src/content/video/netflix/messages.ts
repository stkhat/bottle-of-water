// Messages between the page script (`page.ts`) and the adapter, over `page-channel.ts`.
import { isObject, isString, type PageChannel } from "../page-channel";
import type { NetflixTextTrack } from "./manifest";

export const CHANNEL = {
  fromPage: "lingo-nf",
  toPage: "lingo-nf-request",
} as const satisfies PageChannel;

/** The subtitle tracks of a manifest the player parsed, posted as it is parsed. */
export interface TracksMessage {
  source: typeof CHANNEL.fromPage;
  type: "tracks";
  movieId: string;
  /** Their URLs carry tokens: keep them in memory only. */
  tracks: NetflixTextTrack[];
}

export type PageCall =
  /** The tracks of a title whose manifest the page script has seen (null if none). */
  | { type: "getTracks"; movieId: string }
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

export function isCall(call: Record<string, unknown>): boolean {
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

function isTextTrack(value: unknown): value is NetflixTextTrack {
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
    data.source === CHANNEL.fromPage &&
    data.type === "tracks" &&
    isString(data.movieId) &&
    isTrackList(data.tracks)
  );
}
