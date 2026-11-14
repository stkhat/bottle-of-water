import { primary } from "../../../core/languages";
import { pickTrack } from "../adapter-kit";
import type {
  YouTubeCaptionInfo,
  YouTubeTrack,
} from "../../../core/subtitles/youtube-json3";

/** Parameters that name a track: they come from the track's own `baseUrl`, never from another track's request. */
const TRACK_PARAMS = new Set(["lang", "kind", "tlang", "variant", "name"]);

/**
 * The URL of a track of the same video (or of its auto-translation with `tlang`), made from
 * the track's own `baseUrl` and a timedtext URL the player requested: the request's PO
 * token and client params, which the `baseUrl` lacks, are added, and the format is json3.
 * Parameters that name a track (`lang`, `kind`, `variant`…) stay the `baseUrl`'s: YouTube
 * answers a request with another track's `variant` with an empty body (seen on Shorts,
 * docs/notes/youtube-shorts.md). A bare `baseUrl` without the token gets an empty body too.
 */
export function trackUrl(
  captured: string,
  tracks: readonly YouTubeTrack[],
  target: { track: YouTubeTrack; tlang?: string },
): string {
  const request = new URL(captured);
  const q = request.searchParams;
  // What the player added to its track's baseUrl, when that track is known.
  const own = tracks.find(
    (t) =>
      t.lang === q.get("lang") &&
      (t.kind === "asr") === (q.get("kind") === "asr"),
  );
  const ownBase = own && new URL(own.baseUrl, captured).searchParams;
  // On the request's origin, which the page script fetches from.
  const base = new URL(target.track.baseUrl, captured);
  const url = new URL(base.pathname + base.search, request.origin);
  const params = url.searchParams;
  for (const [key, value] of q) {
    if (key === "tlang" || params.has(key)) continue;
    if (ownBase ? ownBase.has(key) : TRACK_PARAMS.has(key)) continue;
    params.set(key, value);
  }
  if (target.tlang) params.set("tlang", target.tlang);
  else params.delete("tlang");
  params.set("fmt", "json3");
  return url.href;
}

/**
 * The track Lingo shows as the original: the manual track in the learning language,
 * else its auto-generated one. A regional code (`en-GB`) counts as its language.
 */
export const pickOriginalTrack = (
  tracks: readonly YouTubeTrack[],
  learningLang: string,
) => pickTrack(tracks, learningLang, (t) => t.kind === "manual");

/** The `tlang` code that machine-translates `track` into the native language, if any. */
export function autoTranslateCode(
  info: YouTubeCaptionInfo,
  track: YouTubeTrack,
  nativeLang: string,
): string | undefined {
  if (!track.translatable) return undefined;
  const native = nativeLang.toLowerCase();
  return (
    info.translationLanguages.find((code) => code.toLowerCase() === native) ??
    info.translationLanguages.find((code) => primary(code) === primary(native))
  );
}
