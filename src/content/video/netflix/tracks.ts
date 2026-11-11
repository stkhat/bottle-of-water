import type { Track } from "../../../core/subtitles/types";
import { pickTrack } from "../adapter-kit";
import type { NetflixTextTrack } from "./manifest";

/**
 * The track Lingo shows as the original: a non-forced track in the learning language,
 * subtitles before closed captions, the exact language before a regional one.
 */
export const pickOriginalTrack = (
  tracks: readonly NetflixTextTrack[],
  learningLang: string,
) =>
  pickTrack(
    tracks.filter((t) => !t.forced),
    learningLang,
    (t) => t.kind === "subtitles",
  );

/** As a `Track` (every Netflix track is human-made). */
export const asTrack = (track: NetflixTextTrack): Track => ({
  id: track.id,
  lang: track.lang,
  kind: "manual",
  label: track.label,
});

/** The tracks that may translate `original`: the other non-forced ones, subtitles first. */
export function translationTracks(
  tracks: readonly NetflixTextTrack[],
  original: NetflixTextTrack,
): Track[] {
  const others = tracks.filter((t) => t !== original && !t.forced);
  return [
    ...others.filter((t) => t.kind === "subtitles"),
    ...others.filter((t) => t.kind !== "subtitles"),
  ].map(asTrack);
}
