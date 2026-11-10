// Serves the synthetic Netflix subtitle fixtures the way Netflix's CDN would, for the
// browser tests (a Vite middleware) and the E2E tests (context.route). Node only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/core/subtitles/fixtures/netflix",
);

/** The title of the synthetic manifest. */
export const FIXTURE_MOVIE_ID = "80000001";

/** The fixture files, by the token (`t`) of their URL in `manifest.json`. */
const FILES: Record<string, string> = {
  "SYNTHETIC-en-imsc": "en.imsc.ttml",
  "SYNTHETIC-en-dfxp": "en.dfxp",
  "SYNTHETIC-ja-imsc": "ja.imsc.ttml",
};

/** The body for a subtitle URL of the synthetic manifest, or undefined (a 404). */
export function netflixSubtitleBody(url: URL): string | undefined {
  const file = FILES[url.searchParams.get("t") ?? ""];
  return file ? readFileSync(path.join(FIXTURES, file), "utf8") : undefined;
}

/** The synthetic manifest's text. */
export function fixtureManifest(): string {
  return readFileSync(path.join(FIXTURES, "manifest.json"), "utf8");
}
