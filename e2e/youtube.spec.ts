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
import { showNewWords } from "./page";
import { routeYouTube, YOUTUBE_WATCH } from "./sites";

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
  // A card's time, top left: the words in a card open the dictionary instead.
  await transcript
    .getByRole("button", { name: LINE })
    .click({ position: { x: 16, y: 12 } });

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
