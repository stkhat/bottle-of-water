// Serves the recorded YouTube caption fixtures the way /api/timedtext answers, for the
// browser tests (a Vite middleware) and the E2E tests (context.route). Node only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/core/subtitles/fixtures/youtube",
);

/** The video the fixtures were recorded from. */
export const FIXTURE_VIDEO_ID = "iG9CE55wbtY";

/**
 * The body /api/timedtext would send for `url`. Like the real server, a request naming
 * `exp=xpe` without the player's PO token (`pot`), one for another video, or one for a
 * track that has no fixture gets a 200 with an empty body, and so does one with another
 * track's `variant` (the real server, seen on Shorts; here a track's variant, when its
 * baseUrl has one, is its language with "-asr" for the auto-generated one). A request
 * without `exp=xpe` needs no token (youtube.com, 2026-11-18); here it then needs the
 * player's client params (`c`), so a bare baseUrl gets nothing (not measured). Only json3
 * is recorded.
 */
export function timedtextBody(url: URL): string {
  const q = url.searchParams;
  const needsToken = q.get("exp")?.split(",").includes("xpe") ?? false;
  if (!q.get("pot") && (needsToken || !q.get("c"))) return "";
  if (q.get("v") !== FIXTURE_VIDEO_ID) return "";
  if (q.get("fmt") !== "json3") return "";
  const lang = q.get("lang");
  const tlang = q.get("tlang");
  const asr = q.get("kind") === "asr";
  const variant = q.get("variant");
  if (variant !== null && variant !== `${lang}${asr ? "-asr" : ""}`) return "";
  let file: string | undefined;
  if (lang === "en" && !asr && tlang === "ja") file = "en-tlang-ja.json3";
  else if (lang === "en" && !asr && !tlang) file = "en.json3";
  else if (lang === "en" && asr && !tlang) file = "en-asr.json3";
  else if (lang === "ja" && !asr && !tlang) file = "ja.json3";
  return file ? readFileSync(path.join(FIXTURES, file), "utf8") : "";
}

/** The recorded player response's caption part (`captions.playerCaptionsTracklistRenderer`). */
export function fixturePlayerResponse(): unknown {
  return JSON.parse(
    readFileSync(path.join(FIXTURES, "captionTracks.json"), "utf8"),
  );
}
