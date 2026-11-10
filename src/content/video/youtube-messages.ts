/**
 * Messages between Lingo's page script on youtube.com (MAIN world, `youtube-page.ts`) and
 * its content script (isolated world, `youtube-bridge.ts`), sent with `window.postMessage`
 * to the page's own origin. The page can read and forge these, so both sides check the
 * shape of what they receive and treat it as untrusted data. Imported by the page script:
 * keep this file free of dependencies.
 */

/** `source` of messages from the page script. */
export const FROM_PAGE = "lingo-yt";
/** `source` of messages to the page script. */
export const TO_PAGE = "lingo-yt-request";

/** A /api/timedtext response the player received, posted as it arrives. */
export interface TimedtextMessage {
  source: typeof FROM_PAGE;
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

/** What the content script can ask the page script for. */
export type PageCall =
  /** The current video's `videoDetails` and `captions` from `getPlayerResponse()`. */
  | { type: "getPlayerResponse" }
  /** The player's current video id. */
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
  | { type: "seek"; seconds: number };

export interface PageCallResults {
  getPlayerResponse: unknown;
  videoId: string | null;
  loadTrack: { previous: unknown };
  restoreCaptions: null;
  fetchTimedtext: string;
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

const CALLS = new Set([
  "getPlayerResponse",
  "videoId",
  "loadTrack",
  "restoreCaptions",
  "fetchTimedtext",
  "seek",
]);

export function isCallMessage(data: unknown): data is CallMessage {
  if (!isObject(data) || data.source !== TO_PAGE) return false;
  if (typeof data.id !== "string" || !isObject(data.call)) return false;
  const call = data.call;
  if (typeof call.type !== "string" || !CALLS.has(call.type)) return false;
  switch (call.type) {
    case "loadTrack":
      return (
        typeof call.languageCode === "string" && typeof call.asr === "boolean"
      );
    case "fetchTimedtext":
      return typeof call.url === "string";
    case "seek":
      return typeof call.seconds === "number" && Number.isFinite(call.seconds);
    default:
      return true;
  }
}

const stringOrNull = (value: unknown) =>
  value === null || typeof value === "string";

export function isTimedtextMessage(data: unknown): data is TimedtextMessage {
  return (
    isObject(data) &&
    data.source === FROM_PAGE &&
    data.type === "timedtext" &&
    typeof data.url === "string" &&
    typeof data.body === "string" &&
    stringOrNull(data.videoId) &&
    stringOrNull(data.lang) &&
    stringOrNull(data.tlang) &&
    stringOrNull(data.kind)
  );
}

export function isReplyMessage(data: unknown): data is ReplyMessage {
  return (
    isObject(data) &&
    data.source === FROM_PAGE &&
    data.type === "reply" &&
    typeof data.id === "string" &&
    typeof data.ok === "boolean"
  );
}
