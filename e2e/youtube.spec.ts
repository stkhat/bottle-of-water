import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";
import { alignByOverlap } from "../src/core/subtitles/translation";
import { parseYouTubeJson3 } from "../src/core/subtitles/youtube-json3";
import {
  FIXTURE_VIDEO_ID,
  fixturePlayerResponse,
  timedtextBody,
} from "../tests/youtube-timedtext";
import { installFakeYouTubePlayer } from "./fake-youtube-player";
import { test, expect } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const WATCH = `https://www.youtube.com/watch?v=${FIXTURE_VIDEO_ID}`;
const subtitles = path.join(here, "../src/core/subtitles/fixtures/youtube");
const cues = (file: string) =>
  parseYouTubeJson3(readFileSync(path.join(subtitles, file), "utf8"));

/**
 * Serves youtube.com from fixtures: the watch-page skeleton (with Trusted Types
 * enforced, as on the real site), a small local video, the recorded /api/timedtext
 * answers, and a fake player API. Nothing reaches the real site.
 */
async function routeYouTube(context: BrowserContext) {
  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await context.route("https://www.youtube.com/watch*", (route) => {
    const html = readFileSync(
      path.join(here, "fixtures/youtube-watch.html"),
      "utf8",
    ).replace("<video", '<video src="/lingo-test/video.webm" muted');
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      headers: {
        "content-security-policy": "require-trusted-types-for 'script'",
      },
      body: html,
    });
  });
  await context.route(
    "https://www.youtube.com/lingo-test/video.webm",
    (route) =>
      route.fulfill({
        contentType: "video/webm",
        path: path.join(here, "fixtures/video.webm"),
      }),
  );
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

test("on a YouTube video, Lingo gets the original and Japanese subtitles and hides YouTube's captions", async ({
  context,
}) => {
  const en = cues("en.json3");
  const translated = alignByOverlap(en, cues("ja.json3"), {
    lang: "ja",
  }).filter((t) => t !== "").length;
  await routeYouTube(context);
  const page = await context.newPage();
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  await page.goto(WATCH);

  await expect
    .poll(() => logs.filter((line) => line.startsWith("Lingo:")))
    .toEqual([
      `Lingo: ${FIXTURE_VIDEO_ID}: ${en.length} lines, translation siteTrack on ${translated}`,
    ]);
  // Lingo shows its own subtitles instead (a style element: Trusted Types allow it).
  await expect(page.locator("#ytp-caption-window-container")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { lingoViolations: string[] }).lingoViolations,
    ),
  ).toEqual([]);
});
