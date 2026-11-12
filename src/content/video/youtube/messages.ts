// Messages between the page script (`page.ts`) and the adapter, over `page-channel.ts`.
import { isObject, isString, type PageChannel } from "../page-channel";

export const CHANNEL = {
  fromPage: "lingo-yt",
  toPage: "lingo-yt-request",
} as const satisfies PageChannel;

/** A /api/timedtext response the player received, posted as it arrives. */
export interface TimedtextMessage {
  source: typeof CHANNEL.fromPage;
  type: "timedtext";
  /** The request URL, with the player's token: keep it in memory only. */
  url: string;
  /** `v`, `lang`, `tlang` and `kind` of the URL (null when absent). */
  videoId: string | null;
  lang: string | null;
  tlang: string | null;
  kind: string | null;
  body: string;
}

/** Which player a call is for: Shorts have their own (`#shorts-player`). */
interface PlayerChoice {
  shorts?: boolean;
}

export type PageCall = PlayerChoice &
  /** The current video's `videoDetails` and `captions` from `getPlayerResponse()`. */
  (
    | { type: "getPlayerResponse" }
    | { type: "videoId" }
    /**
     * Makes the player load a caption track (it then requests it from /api/timedtext).
     * Answers the track that was on before, for `restoreCaptions`.
     */
    | { type: "loadTrack"; languageCode: string; asr: boolean }
    /** Puts back the track `loadTrack` answered (captions off when it was none). */
    | { type: "restoreCaptions"; previous: unknown }
    /** Fetches a same-origin /api/timedtext URL from the page and answers its body. */
    | { type: "fetchTimedtext"; url: string }
    | { type: "seek"; seconds: number }
    | { type: "pause" }
    | { type: "play" }
  );

export interface PageCallResults {
  getPlayerResponse: unknown;
  videoId: string | null;
  loadTrack: { previous: unknown };
  restoreCaptions: null;
  fetchTimedtext: string;
  seek: null;
  pause: null;
  play: null;
}

export function isCall(call: Record<string, unknown>): boolean {
  if (call.shorts !== undefined && typeof call.shorts !== "boolean")
    return false;
  switch (call.type) {
    case "getPlayerResponse":
    case "videoId":
    case "restoreCaptions":
    case "pause":
    case "play":
      return true;
    case "loadTrack":
      return isString(call.languageCode) && typeof call.asr === "boolean";
    case "fetchTimedtext":
      return isString(call.url);
    case "seek":
      return typeof call.seconds === "number" && Number.isFinite(call.seconds);
    default:
      return false;
  }
}

const stringOrNull = (value: unknown) => value === null || isString(value);

export function isTimedtextMessage(data: unknown): data is TimedtextMessage {
  return (
    isObject(data) &&
    data.source === CHANNEL.fromPage &&
    data.type === "timedtext" &&
    isString(data.url) &&
    isString(data.body) &&
    stringOrNull(data.videoId) &&
    stringOrNull(data.lang) &&
    stringOrNull(data.tlang) &&
    stringOrNull(data.kind)
  );
}
