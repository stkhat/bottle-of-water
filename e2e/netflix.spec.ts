// The MAIN-world hook reads the manifest, the content script fetches the subtitles
// across origins and asks the background to classify them. The rest is in browser tests
// (src/content/video, src/ui/video).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt } from "../src/core/subtitles/cues";
import { parseTtml } from "../src/core/subtitles/ttml";
import { test, expect } from "./fixtures";
import { ON_TIME, showNewWords } from "./page";
import { NETFLIX_WATCH, routeNetflix } from "./sites";

const subtitles = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/core/subtitles/fixtures/netflix",
);
const cues = (file: string) =>
  parseTtml(readFileSync(path.join(subtitles, file), "utf8"));
const EN = cues("en.imsc.ttml");
const JA = cues("ja.imsc.ttml");
/** "EXTRAORDINARY" is a New word (closed captions are in capitals). */
const LINE = "EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.";
const LINE_CUE = EN.find((c) => c.text.replaceAll("\n", " ") === LINE)!;
const LINE_JA = cueAt(JA, LINE_CUE.startMs)!.text.replaceAll("\n", "");

test("the subtitle shows the playing line with its Japanese line; Netflix's own subtitles are hidden", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await routeNetflix(context);
  const page = await context.newPage();
  await page.goto(NETFLIX_WATCH);
  const transcript = page.getByRole("complementary", {
    name: en["app.name"],
  });
  await transcript
    .getByRole("button", { name: LINE })
    .click({ position: ON_TIME });

  const subtitle = page.locator("lingo-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle).toContainText(LINE);
  await expect(subtitle.getByText(LINE_JA)).toBeVisible();
  await expect(subtitle.getByText("EXTRAORDINARY", { exact: true })).toHaveCSS(
    "box-shadow",
    /rgb\(141, 180, 255\)/,
  );
  expect(
    await page
      .locator(".player-timedtext")
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe("none");
});

test("the video pauses while the dictionary window is open and plays again once it closes", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await routeNetflix(context);
  const page = await context.newPage();
  await page.goto(NETFLIX_WATCH);
  const card = page
    .getByRole("complementary", { name: en["app.name"] })
    .getByRole("button", { name: LINE });
  await card.click({ position: ON_TIME });
  const video = page.locator(".watch-video video");
  const paused = () => video.evaluate((v: HTMLVideoElement) => v.paused);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(paused).toBe(false);

  await card.getByText("EXTRAORDINARY", { exact: true }).click();
  const window = page.getByRole("complementary", { name: en["dict.window"] });
  await expect(window).toBeVisible();
  await expect.poll(paused).toBe(true);
  await window.getByRole("button", { name: en["dict.close"] }).click();
  await expect.poll(paused).toBe(false);
});
