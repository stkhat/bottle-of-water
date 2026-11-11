import { primary } from "../../../core/languages";
import { pickTrack } from "../adapter-kit";
import type {
  YouTubeCaptionInfo,
  YouTubeTrack,
} from "../../../core/subtitles/youtube-json3";

/**
 * The URL of another track of the same video, made from a timedtext URL the player
 * requested: its PO token and client params stay, `lang`, `kind` and `tlang` change,
 * and the format is json3. (A bare `baseUrl` without the token gets an empty body.)
 */
export function trackUrl(
  captured: string,
  track: { lang: string; asr: boolean; tlang?: string },
): string {
  const url = new URL(captured);
  const q = url.searchParams;
  q.set("lang", track.lang);
  if (track.asr) q.set("kind", "asr");
  else q.delete("kind");
  if (track.tlang) q.set("tlang", track.tlang);
  else q.delete("tlang");
  q.set("fmt", "json3");
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
