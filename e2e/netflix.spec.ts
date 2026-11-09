import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt } from "../src/core/subtitles/cues";
import { alignByOverlap } from "../src/core/subtitles/translation";
import { parseTtml } from "../src/core/subtitles/ttml";
import { parseWebVtt } from "../src/core/subtitles/webvtt";
import {
  FIXTURE_MOVIE_ID,
  fixtureManifest,
  netflixSubtitleBody,
} from "../tests/netflix-subtitles";
import {
  installFakeNetflixPlayer,
  type FakeNetflixControl,
  type FakeNetflixOptions,
} from "./fake-netflix-player";
import { test, expect, sendToBackground } from "./fixtures";
import { routeTalkVideo } from "./routes";

const here = path.dirname(fileURLToPath(import.meta.url));
const WATCH = `https://www.netflix.com/watch/${FIXTURE_MOVIE_ID}?trackId=14170286`;
const subtitles = path.join(here, "../src/core/subtitles/fixtures/netflix");
const read = (file: string) => readFileSync(path.join(subtitles, file), "utf8");

const EN = parseTtml(read("en.dfxp"));
const JA = parseWebVtt(read("ja.vtt"));
/** The line the tests seek to: "EXTRAORDINARY" is a New word (closed captions are in capitals). */
const LINE = "EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.";
const flat = (text: string) => text.replaceAll("\n", " ");
const LINE_INDEX = EN.findIndex((c) => flat(c.text) === LINE);
const LINE_CUE = EN[LINE_INDEX]!;
/** What the subtitle shows under it: the Japanese line playing at that time. */
const LINE_JA = cueAt(JA, LINE_CUE.startMs)!.text.replaceAll("\n", "");
/** The card whose translation joins two Japanese lines' worth of English. */
const PAIR_INDEX = 1;
const PAIR_JA = alignByOverlap(EN, JA, { lang: "ja" })[PAIR_INDEX]!;

const METADATA = {
  title: "Lingo Test Show",
  seasons: [
    {
      seq: 1,
      episodes: [
        { id: Number(FIXTURE_MOVIE_ID), seq: 1, title: "Pilot" },
        { id: 80000002, seq: 2, title: "Second" },
      ],
    },
  ],
};

/**
 * Serves netflix.com from the synthetic fixtures: the watch-page skeleton, the local
 * 140-second clip, the subtitle files on a CDN host (cross-origin, with CORS like
 * Netflix's), and a fake player that parses the synthetic manifest. Nothing reaches
 * the real site.
 */
async function routeNetflix(context: BrowserContext) {
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
    metadata: METADATA,
  };
  // Only on netflix.com (the init script runs on extension pages too).
  await context.addInitScript({
    content: `if (location.hostname === "www.netflix.com") (${installFakeNetflixPlayer.toString()})(${JSON.stringify(options)});`,
  });
}

const transcript = (page: Page) =>
  page.getByRole("complementary", { name: en["video.transcript"] });
const inVideo = (page: Page) =>
  page.locator("lingo-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
const lButton = (page: Page) =>
  page.getByRole("button", { name: en["video.toggle"] });
const card = (page: Page, text: string) =>
  transcript(page).getByRole("button", { name: text });
const currentTime = (page: Page) =>
  page.evaluate(() => document.querySelector("video")!.currentTime);
const siteCaptions = (page: Page) =>
  page
    .locator(".player-timedtext")
    .evaluate((el) => getComputedStyle(el).display);
const fake = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { lingoFakeNetflix: FakeNetflixControl })
        .lingoFakeNetflix.log,
  );

/** Opens the watch page with New words highlighted and seeks to LINE from its card. */
async function openAtLine(context: BrowserContext, extensionId: string) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  await routeNetflix(context);
  const page = await context.newPage();
  await page.goto(WATCH);
  await card(page, LINE).click();
  await expect(inVideo(page)).toContainText(LINE);
  return page;
}

test("the subtitle shows the playing line with its Japanese line; Netflix's own subtitles are hidden", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  // The card seeks through Netflix's player API, in milliseconds.
  expect((await fake(page)).seek).toEqual([LINE_CUE.startMs]);
  expect(await currentTime(page)).toBeCloseTo(LINE_CUE.startMs / 1000, 1);
  await expect(inVideo(page).getByText(LINE_JA)).toBeVisible();
  await expect(
    inVideo(page).getByText("EXTRAORDINARY", { exact: true }),
  ).toHaveCSS("box-shadow", /rgb\(141, 180, 255\)/);
  expect(await siteCaptions(page)).toBe("none");

  // The transcript: the playing card, and a card with the Japanese line it overlaps most
  // (two English lines share one Japanese line; it goes to the second).
  expect(PAIR_JA).toContain("創造性");
  await expect(card(page, LINE)).toHaveAttribute("aria-current", "true");
  await expect(card(page, flat(EN[PAIR_INDEX]!.text))).toContainText(PAIR_JA);
  // At the right of the player, clear of Netflix's control bar.
  const box = (await transcript(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x + box.width).toBeCloseTo(viewport.width - 16, 0);
  const bar = (await page
    .locator(".watch-video--bottom-controls-container")
    .boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y);

  // The L and ^ buttons sit in the control bar, before the audio & subtitles button.
  const buttons = page.locator(
    ".watch-video--bottom-controls-container > lingo-player-buttons",
  );
  await expect(buttons).toBeVisible();
  expect(
    await buttons.evaluate(
      (el) =>
        el.nextElementSibling?.querySelector(
          "[data-uia='control-audio-subtitle']",
        ) !== null,
    ),
  ).toBe(true);
});

test("a transcript card seeks to its line", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const first = card(page, flat(EN[0]!.text));
  await first.click();
  await expect(inVideo(page)).toContainText(flat(EN[0]!.text));
  expect(await currentTime(page)).toBeCloseTo(EN[0]!.startMs / 1000, 1);
  await expect(first).toHaveAttribute("aria-current", "true");
});

test("the L button turns Lingo off: Netflix's subtitles come back", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const l = lButton(page);
  await l.click();
  await expect(l).toHaveAttribute("aria-pressed", "false");
  await expect(inVideo(page)).toHaveCount(0);
  await expect(transcript(page)).toHaveCount(0);
  await expect.poll(() => siteCaptions(page)).not.toBe("none");
  await expect(page.getByText("Netflix's own subtitle")).toBeVisible();

  await l.click();
  await expect(inVideo(page)).toContainText(LINE);
  await expect(transcript(page)).toBeVisible();
  expect(await siteCaptions(page)).toBe("none");
});

test("at the end of the video, Video finished offers to save the rest", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    video.currentTime = video.duration - 0.5;
    await video.play();
  });
  const end = page.getByRole("region", { name: en["endCard.region"] });
  await expect(end.getByText(en["endCard.video"])).toBeVisible({
    timeout: 10_000,
  });
  await expect(end.getByText(/^\d+ words not saved yet$/)).toBeVisible();
  await end.getByRole("button", { name: en["saveAll.addLearning"] }).click();
  await expect(end.getByText(/^\d+ words added to Learning$/)).toBeVisible();
});

test("the next episode gets its own subtitles", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  // Netflix moves to the next episode without loading a page; this one has no Japanese.
  const manifest = JSON.parse(fixtureManifest()) as {
    result: { movieId: number; timedtexttracks: { language: string | null }[] };
  };
  manifest.result.movieId = 80000002;
  manifest.result.timedtexttracks = manifest.result.timedtexttracks.filter(
    (t) => t.language !== "ja",
  );
  await page.evaluate(
    (next) => {
      (
        window as unknown as { lingoFakeNetflix: FakeNetflixControl }
      ).lingoFakeNetflix.navigate(next);
    },
    { movieId: "80000002", manifest: JSON.stringify(manifest) },
  );
  // Without a Japanese track, the fixture's Japanese lines are gone.
  await expect(card(page, flat(EN[PAIR_INDEX]!.text))).not.toContainText(
    PAIR_JA,
  );
  await card(page, LINE).click();
  await expect(inVideo(page)).toContainText(LINE);
  await expect(inVideo(page).getByText(LINE_JA)).toHaveCount(0);
});
