// Corpus → units.jsonl: one line per transcript card or article paragraph, made by the
// caption code of one checkout (captionCards, parseYouTubeJson3, alignByOverlap; Netflix
// TTML/WebVTT through parseTtml/parseWebVtt).
//
//   npx jiti .claude/skills/real-content-quality/scripts/build-units.ts \
//     [--repo=<checkout>] [--corpus=<dir>] [--out=<dir>] [--learning=en] [--native=ja]
//
// (or the same names as environment variables: REPO, CORPUS, OUT, STUDY, LEARNING, NATIVE).
// Defaults: REPO = the checkout this script is in; CORPUS = <study>/corpus;
// OUT = <study>/runs/units-<REPO's short sha>; the study is STUDY or the newest one in
// the main checkout's data/raw/quality/ (common.ts).
//
// Corpus files (references/collection.md):
// - youtube/<id>.json: json3 tracks under the learning language's code (`en`), the
//   native code (`ja`: a human track, or null) and `tlang` (YouTube's translation into
//   the native language); `trackKind` (older files: `enKind`) is "manual" or "asr".
// - netflix/<id>.json: `timed: {<lang>: <TTML or WebVTT text>}` when the raw tracks
//   were saved (they are re-aligned here), else the rendered `cards` [{t, <lang>: text}].
// - articles/<id>.json: `title`, `paras`. Paragraphs matching SKIP (a regex, default
//   newsletter/sign-up boilerplate) are left out.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  readJson,
  repo,
  setting,
  shortSha,
  studyDir,
  type Unit,
} from "./common.ts";

type Captions = typeof import("../../../../src/content/video/captions.ts");
type Json3Module =
  typeof import("../../../../src/core/subtitles/youtube-json3.ts");
type TranslationModule =
  typeof import("../../../../src/core/subtitles/translation.ts");
type TtmlModule = typeof import("../../../../src/core/subtitles/ttml.ts");
type WebVttModule = typeof import("../../../../src/core/subtitles/webvtt.ts");
type Cue = import("../../../../src/core/subtitles/types.ts").Cue;
type Json3 = import("../../../../src/core/subtitles/youtube-json3.ts").Json3;

const REPO = repo();
const LEARNING = setting("learning", "en")!;
const NATIVE = setting("native", "ja")!;
const corpusSetting = setting("corpus");
const CORPUS = corpusSetting ?? join(studyDir(), "corpus");
const OUT =
  setting("out") ??
  join(
    corpusSetting ? join(CORPUS, "..") : studyDir(),
    "runs",
    `units-${shortSha(REPO)}`,
  );
const SKIP = new RegExp(
  setting(
    "skip",
    "newsletter|sign up|Sign up|Associated Press’ health and science|Follow .* on|Get our flagship|^Related|financial support from",
  )!,
);

const { captionCards } = (await import(
  `${REPO}/src/content/video/captions.ts`
)) as Captions;
const { parseYouTubeJson3 } = (await import(
  `${REPO}/src/core/subtitles/youtube-json3.ts`
)) as Json3Module;
const { alignByOverlap } = (await import(
  `${REPO}/src/core/subtitles/translation.ts`
)) as TranslationModule;
const { parseTtml } = (await import(
  `${REPO}/src/core/subtitles/ttml.ts`
)) as TtmlModule;
const { parseWebVtt } = (await import(
  `${REPO}/src/core/subtitles/webvtt.ts`
)) as WebVttModule;

const filesOf = (kind: string) => {
  try {
    return readdirSync(join(CORPUS, kind))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(CORPUS, kind, f));
  } catch {
    return [];
  }
};

const track = (kind: "manual" | "asr") => ({
  id: "",
  lang: LEARNING,
  kind,
  label: "",
});

const units: Unit[] = [];
const report: Record<string, Record<string, number>> = {};
const count = (site: string, what: string, n = 1) => {
  const r = (report[site] ??= {});
  r[what] = (r[what] ?? 0) + n;
};

/** Cards of one video, from the learning track and the translation the extension would pick. */
function videoUnits(
  doc: string,
  site: "youtube" | "netflix",
  cues: Cue[],
  kind: "manual" | "asr",
  human: Cue[] | undefined,
  auto: Cue[] | undefined,
) {
  const translation = human
    ? { source: "siteTrack" as const, lang: NATIVE, cues: human }
    : auto?.length
      ? { source: "siteAutoTranslate" as const, lang: NATIVE, cues: auto }
      : { source: "none" as const, lang: NATIVE, cues: [] };
  const { state } = captionCards({ track: track(kind), cues, translation });
  // A human track is shown: keep the site's machine translation next to it, to compare.
  const tlang =
    human && auto?.length && kind === "manual"
      ? alignByOverlap(state.cues, auto, { lang: NATIVE })
      : undefined;
  const source = translation.source + (kind === "asr" ? "-asr" : "");
  state.cues.forEach((c, i) => {
    const native = state.translations[i] ?? "";
    units.push({
      doc,
      site,
      i,
      t: (c.startMs / 1000).toFixed(1),
      text: c.text,
      native,
      nativeSource: source,
      ...(tlang && { tlang: tlang[i] ?? "" }),
    });
    count(site, "cards");
    if (!native) count(site, "noNative");
  });
  count(site, `docs ${source}`);
}

interface YouTubeFile {
  id: string;
  trackKind?: string;
  enKind?: string;
  tlang?: Json3 | null;
  [lang: string]: unknown;
}
for (const f of filesOf("youtube")) {
  const d = readJson(f) as YouTubeFile;
  const own = d[LEARNING] as Json3 | undefined;
  if (!own) {
    console.error(`skip ${f}: no ${LEARNING} track`);
    continue;
  }
  const kind = (d.trackKind ?? d.enKind) === "asr" ? "asr" : "manual";
  const human = d[NATIVE] as Json3 | null | undefined;
  videoUnits(
    `yt:${d.id}`,
    "youtube",
    parseYouTubeJson3(own),
    kind,
    human ? parseYouTubeJson3(human) : undefined,
    d.tlang ? parseYouTubeJson3(d.tlang) : undefined,
  );
}

interface NetflixFile {
  id: string;
  timed?: Record<string, string>;
  cards?: ({ t?: string } & Record<string, string | undefined>)[];
}
const parseTimed = (text: string) =>
  // trimStart also drops a byte-order mark.
  text.trimStart().startsWith("WEBVTT") ? parseWebVtt(text) : parseTtml(text);
for (const f of filesOf("netflix")) {
  const d = readJson(f) as NetflixFile;
  const own = d.timed?.[LEARNING];
  if (own) {
    const human = d.timed?.[NATIVE];
    videoUnits(
      `nf:${d.id}`,
      "netflix",
      parseTimed(own),
      "manual",
      human ? parseTimed(human) : undefined,
      undefined,
    );
    continue;
  }
  // Only the cards Lingo rendered: their text and lines as they were.
  (d.cards ?? []).forEach((c, i) => {
    const native = c[NATIVE] ?? "";
    units.push({
      doc: `nf:${d.id}`,
      site: "netflix",
      i,
      ...(c.t !== undefined && { t: c.t }),
      text: c[LEARNING] ?? "",
      native,
      nativeSource: "rendered",
    });
    count("netflix", "cards");
    if (!native) count("netflix", "noNative");
  });
  count("netflix", "docs rendered");
}

interface ArticleFile {
  id: string;
  title?: string;
  paras: string[];
}
for (const f of filesOf("articles")) {
  const d = readJson(f) as ArticleFile;
  const paras = [d.title, ...d.paras]
    .filter((p): p is string => !!p && !SKIP.test(p))
    // A drop cap saved as its own line ("T\nhe …").
    .map((p) => p.replace(/^(\p{Lu})\n(?=\p{Ll})/u, "$1"));
  paras.forEach((text, i) =>
    units.push({ doc: `ar:${d.id}`, site: "article", i, text }),
  );
  count("article", "paragraphs", paras.length);
  count("article", "docs");
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "units.jsonl"),
  units.map((u) => JSON.stringify(u)).join("\n") + "\n",
);
console.log(
  JSON.stringify(
    { repo: REPO, corpus: CORPUS, out: join(OUT, "units.jsonl"), ...report },
    null,
    1,
  ),
);
