// The MAIN-world hook reads the manifest, the content script fetches the subtitles
// across origins and asks the background to classify them. The rest is in browser tests
// (src/content/video, src/ui/video).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt } from "../src/core/subtitles/cues";
import { parseTtml } from "../src/core/subtitles/ttml";
import { test, expect, sendToBackground } from "./fixtures";
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

test("× closes the transcript sidebar for good, the player takes the whole window, and the menu's switch brings it back", async ({
  context,
  extensionId,
}) => {
  await routeNetflix(context);
  const page = await context.newPage();
  await page.goto(NETFLIX_WATCH);
  const transcript = page.getByRole("complementary", {
    name: en["app.name"],
  });
  const playerWidth = () =>
    page
      .locator(".watch-video--player-view")
      .evaluate((el) => el.getBoundingClientRect().width);
  const windowWidth = await page.evaluate(() => innerWidth);
  await expect(transcript).toBeVisible();
  await expect.poll(playerWidth).toBe(windowWidth - 392);

  await transcript
    .getByRole("button", { name: en["video.closeTranscript"] })
    .click();
  await expect(transcript).toBeHidden();
  await expect.poll(playerWidth).toBe(windowWidth);

  // A saved setting: still closed on the next visit.
  await expect
    .poll(async () => {
      const reply = (await sendToBackground(context, extensionId, {
        type: "getSettings",
      })) as { value?: { transcriptShown?: boolean } };
      return reply.value?.transcriptShown;
    })
    .toBe(false);
  await page.reload();
  await expect(page.locator("lingo-player-buttons")).toBeAttached();
  await expect(transcript).toBeHidden();
  await expect.poll(playerWidth).toBe(windowWidth);

  // Netflix shows its control bar, with the L and ^ buttons, while the pointer moves;
  // Lingo lets it show once the pointer has stayed 1 s in the bar's area at the bottom
  // (the click waits for the L menu button to show).
  const height = page.viewportSize()!.height;
  await page.mouse.move(200, height - 60);
  await page.mouse.move(220, height - 50);
  await page.getByRole("button", { name: en["video.menu"] }).click();
  const menu = page.getByRole("dialog", { name: en["video.menu"] });
  const sidebar = menu.getByRole("switch", {
    name: en["video.menu.transcript"],
  });
  await expect(sidebar).toHaveAttribute("aria-checked", "false");
  await sidebar.click();
  await expect(transcript).toBeVisible();
  await expect.poll(playerWidth).toBe(windowWidth - 392);
});
