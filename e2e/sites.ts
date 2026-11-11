// The routed YouTube and Netflix watch pages the E2E tests open: fixture pages, the
// local test clip, recorded or synthetic subtitles and fake players. Nothing reaches
// the real sites.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";
import {
  FIXTURE_MOVIE_ID,
  fixtureManifest,
  netflixSubtitleBody,
} from "../tests/netflix-subtitles";
import {
  FIXTURE_VIDEO_ID,
  fixturePlayerResponse,
  timedtextBody,
} from "../tests/youtube-timedtext";
import {
  FIXTURE_METADATA,
  installFakeNetflixPlayer,
  type FakeNetflixOptions,
} from "../tests/fake-netflix-player";
import { installFakeYouTubePlayer } from "../tests/fake-youtube-player";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Serves the 140-second clip with byte ranges: the video can seek only then. */
async function routeTalkVideo(context: BrowserContext, url: string) {
  const video = readFileSync(path.join(here, "fixtures/talk.webm"));
  await context.route(url, (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(
      route.request().headers()["range"] ?? "",
    );
    if (!range)
      return route.fulfill({
        contentType: "video/webm",
        headers: { "accept-ranges": "bytes" },
        body: video,
      });
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : video.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "video/webm",
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${video.length}`,
      },
      body: video.subarray(start, end + 1),
    });
  });
}

export const YOUTUBE_WATCH = `https://www.youtube.com/watch?v=${FIXTURE_VIDEO_ID}`;
export const NETFLIX_WATCH = `https://www.netflix.com/watch/${FIXTURE_MOVIE_ID}?trackId=14170286`;

/**
 * Serves youtube.com from fixtures: the watch-page skeleton (with Trusted Types
 * enforced, as on the real site), a local 140-second video (the recorded captions end
 * at 2:15), the recorded /api/timedtext answers, and a fake player API.
 */
export async function routeYouTube(context: BrowserContext) {
  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await context.route("https://www.youtube.com/watch*", (route) => {
    const html = readFileSync(
      path.join(here, "fixtures/youtube-watch.html"),
      "utf8",
    ).replace("<video", '<video src="/lingo-test/talk.webm" muted');
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      headers: {
        "content-security-policy": "require-trusted-types-for 'script'",
      },
      body: html,
    });
  });
  await routeTalkVideo(context, "https://www.youtube.com/lingo-test/talk.webm");
  await context.route("https://www.youtube.com/api/timedtext*", (route) =>
    route.fulfill({
      contentType: "application/json; charset=UTF-8",
      body: timedtextBody(new URL(route.request().url())),
    }),
  );
  await context.addInitScript(installFakeYouTubePlayer, {
    videoId: FIXTURE_VIDEO_ID,
    title: "Do schools kill creativity?",
    playerResponse: fixturePlayerResponse(),
  });
  // Trusted Types violations in the page (e.g. an innerHTML assignment).
  await context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { lingoViolations: string[] }).lingoViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) =>
      seen.push(`${event.violatedDirective}: ${event.sample}`),
    );
  });
}

/**
 * Serves netflix.com from the synthetic fixtures: the watch-page skeleton, the local
 * 140-second clip, the subtitle files on a CDN host (cross-origin, with CORS like
 * Netflix's), and a fake player that parses the synthetic manifest.
 */
export async function routeNetflix(context: BrowserContext) {
  await context.route("https://www.netflix.com/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await context.route("https://www.netflix.com/watch/*", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: readFileSync(
        path.join(here, "fixtures/netflix-watch.html"),
        "utf8",
      ).replace("<video", '<video src="/lingo-test/talk.webm" muted'),
    }),
  );
  await routeTalkVideo(context, "https://www.netflix.com/lingo-test/talk.webm");
  await context.route("https://*.nflxvideo.net/**", (route) => {
    const body = netflixSubtitleBody(new URL(route.request().url()));
    return route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: "text/plain; charset=utf-8",
      headers: { "access-control-allow-origin": "https://www.netflix.com" },
      body: body ?? "",
    });
  });
  const options: FakeNetflixOptions = {
    movieId: FIXTURE_MOVIE_ID,
    manifest: fixtureManifest(),
    metadata: FIXTURE_METADATA,
    // Built while the pointer moves, removed 3 s after it stops, as on netflix.com.
    controlBar: { idleMs: 3000, title: ["Lingo Test Show", "E1", "Pilot"] },
  };
  // Only on netflix.com (the init script runs on extension pages too).
  await context.addInitScript({
    content: `if (location.hostname === "www.netflix.com") (${installFakeNetflixPlayer.toString()})(${JSON.stringify(options)});`,
  });
}
