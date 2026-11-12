// The MAIN-world hook catches the player's caption request, the content script asks the
// background to classify the cues, and the subtitle shows them under YouTube's real
// Trusted Types policy. The rest is in browser tests (src/content/video, src/ui/video).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt } from "../src/core/subtitles/cues";
import { parseYouTubeJson3 } from "../src/core/subtitles/youtube-json3";
import { test, expect } from "./fixtures";
import { highlighted, ON_TIME, showNewWords } from "./page";
import { routeYouTube, YOUTUBE_SHORT, YOUTUBE_WATCH } from "./sites";

const subtitles = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/core/subtitles/fixtures/youtube",
);
const cues = (file: string) =>
  parseYouTubeJson3(readFileSync(path.join(subtitles, file), "utf8"));
const EN = cues("en.json3");
const JA = cues("ja.json3");
/** "extraordinary" and "creativity" are New words. */
const LINE = "One is the extraordinary evidence of human creativity";
const LINE_CUE = EN.find((c) => c.text.replaceAll("\n", " ") === LINE)!;
const LINE_JA = cueAt(JA, LINE_CUE.startMs)!.text.replaceAll("\n", "");

test("the subtitle shows the playing line with its highlights and its Japanese line", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_WATCH);
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
  // New words: the bright blue underline over the video.
  await expect(subtitle.getByText("creativity", { exact: true })).toHaveCSS(
    "box-shadow",
    /rgb\(141, 180, 255\)/,
  );
  await expect(page.locator("#ytp-caption-window-container")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { lingoViolations: string[] }).lingoViolations,
    ),
  ).toEqual([]);
});

test("a Short shows the subtitle over it and highlights its comments panel", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_SHORT);
  // The L and ^ group sits in the Short's own buttons, before its captions button.
  await expect(
    page.locator(
      "#right-controls > lingo-player-buttons + #closed-captioning-button-container",
    ),
  ).toHaveCount(1);
  await page.evaluate(
    (seconds) => {
      const video = document.querySelector<HTMLVideoElement>(
        "#shorts-player video",
      )!;
      video.currentTime = seconds;
    },
    (LINE_CUE.startMs + 200) / 1000,
  );
  const subtitle = page.locator("lingo-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle).toContainText(LINE);
  await expect(subtitle.locator("[lang=en]").first()).toHaveCSS(
    "font-size",
    "20px",
  );
  await expect(page.locator("lingo-transcript")).toHaveCount(0);
  await expect
    .poll(() => highlighted(page, "lingo-new"), { timeout: 10_000 })
    .toContain("profound");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { lingoViolations: string[] }).lingoViolations,
    ),
  ).toEqual([]);
});
