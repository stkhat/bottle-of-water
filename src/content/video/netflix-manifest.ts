/**
 * What Lingo reads from the manifest the Netflix player parses for each title: its
 * subtitle tracks and where to download them. Every assumption about the manifest's
 * shape is here (see docs/notes/netflix.md); a manifest that does not match gives
 * nothing, and Lingo then leaves the video alone. Imported by the page script: keep
 * this file free of runtime dependencies.
 */
import type { Track } from "../../core/subtitles/types";

/** One way to download a track, with every CDN's URL (they carry tokens: memory only). */
export interface NetflixDownload {
  format: string;
  urls: string[];
}

export interface NetflixTextTrack {
  id: string;
  /** BCP 47 code as Netflix gives it (en, ja, pt-BR, zh-Hant…). */
  lang: string;
  label: string;
  /** "closedcaptions" are the SDH ("[CC]") tracks. */
  kind: "subtitles" | "closedcaptions";
  /** A forced-narrative track (only the foreign-language lines). */
  forced: boolean;
  /** Text formats Lingo reads, in order of preference; never empty. */
  downloads: NetflixDownload[];
}

export interface NetflixManifestTracks {
  /** The title's id, as in `/watch/<id>`. */
  movieId: string;
  tracks: NetflixTextTrack[];
}

/**
 * Text formats (profiles) in a track's `downloadables`, in order of preference: TTML
 * (IMSC, DFXP, simple SDH) first, then WebVTT. Image formats (`nflx-cmisc`) cannot be read.
 */
export const TEXT_FORMATS = [
  "imsc1.1",
  "dfxp-ls-sdh",
  "simplesdh",
  "webvtt-lssdh-ios8",
] as const;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string | number =>
  (typeof value === "string" && value !== "") ||
  (typeof value === "number" && Number.isFinite(value));

const isHttpUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\//.test(value);

/** URLs of one downloadable: `urls: [{ url }]`, or the older `downloadUrls: { cdnId: url }`. */
function downloadUrls(downloadable: Json): string[] {
  const urls: unknown[] = [];
  if (Array.isArray(downloadable.urls))
    for (const entry of downloadable.urls)
      urls.push(isObject(entry) ? entry.url : undefined);
  if (isObject(downloadable.downloadUrls))
    urls.push(...Object.values(downloadable.downloadUrls));
  return urls.filter(isHttpUrl);
}

function readTrack(raw: unknown, index: number): NetflixTextTrack | undefined {
  if (!isObject(raw) || raw.isNoneTrack === true) return undefined;
  const lang = raw.language ?? raw.bcp47;
  if (typeof lang !== "string" || lang === "") return undefined;
  // `downloadables` as netflix.com sends it (2026-11); `ttDownloadables` in the older shape.
  const downloadables = isObject(raw.downloadables)
    ? raw.downloadables
    : isObject(raw.ttDownloadables)
      ? raw.ttDownloadables
      : {};
  const downloads: NetflixDownload[] = [];
  for (const format of TEXT_FORMATS) {
    const downloadable = downloadables[format];
    if (!isObject(downloadable) || downloadable.isImage === true) continue;
    const urls = downloadUrls(downloadable);
    if (urls.length > 0) downloads.push({ format, urls });
  }
  if (downloads.length === 0) return undefined;
  const id = raw.new_track_id ?? raw.id;
  const closed =
    raw.rawTrackType === "closedcaptions" ||
    (raw.rawTrackType === undefined && raw.trackType === "ASSISTIVE");
  return {
    id: isId(id) ? String(id) : `${lang}-${index}`,
    lang,
    label:
      typeof raw.languageDescription === "string" && raw.languageDescription
        ? raw.languageDescription
        : lang,
    kind: closed ? "closedcaptions" : "subtitles",
    forced: raw.isForcedNarrative === true,
    downloads,
  };
}

/**
 * The subtitle tracks of a manifest, or undefined for anything else. The manifest is
 * `{ result: { movieId, textTracks } }` as netflix.com sends it, or the older
 * `{ result: { movieId, timedtexttracks } }`; also accepted without `result`, or with
 * `viewableId`. Only tracks with a text format are kept; the "Off" track and tracks not
 * downloadable yet are dropped. Cheap on other values: this runs on every `JSON.parse`
 * of the page.
 */
export function readManifest(
  value: unknown,
): NetflixManifestTracks | undefined {
  if (!isObject(value)) return undefined;
  const root = isObject(value.result) ? value.result : value;
  const list = root.textTracks ?? root.timedtexttracks;
  if (!Array.isArray(list)) return undefined;
  const movieId = root.movieId ?? root.viewableId;
  if (!isId(movieId)) return undefined;
  const tracks: NetflixTextTrack[] = [];
  list.forEach((raw, index) => {
    const track = readTrack(raw, index);
    if (track) tracks.push(track);
  });
  return { movieId: String(movieId), tracks };
}

const primary = (lang: string) => lang.toLowerCase().split(/[-_]/)[0] ?? "";

/**
 * The track Lingo shows as the original: a non-forced track in the learning language,
 * subtitles before closed captions, the exact language before a regional one.
 */
export function pickOriginalTrack(
  tracks: readonly NetflixTextTrack[],
  learningLang: string,
): NetflixTextTrack | undefined {
  const lang = learningLang.toLowerCase();
  const usable = tracks.filter((t) => !t.forced);
  const order = [
    (t: NetflixTextTrack) =>
      t.kind === "subtitles" && t.lang.toLowerCase() === lang,
    (t: NetflixTextTrack) =>
      t.kind === "subtitles" && primary(t.lang) === primary(lang),
    (t: NetflixTextTrack) => t.lang.toLowerCase() === lang,
    (t: NetflixTextTrack) => primary(t.lang) === primary(lang),
  ];
  for (const matches of order) {
    const track = usable.find(matches);
    if (track) return track;
  }
  return undefined;
}

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
