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

  const subtitle = page.locator("langle-video-player").getByRole("region", {
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
        (window as unknown as { langleViolations: string[] }).langleViolations,
    ),
  ).toEqual([]);
});

test("a reload of the tab shows the Japanese line again", async ({
  context,
}) => {
  // The player starts a load with the caption track the last load set, without
  // requesting it (youtube.com, 2026-11-18): Langle's own request for the English track
  // must not leave it set, or the reload had nothing to capture and showed English only.
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_WATCH);
  const subtitle = page.locator("langle-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
  const card = page
    .getByRole("complementary", { name: en["app.name"] })
    .getByRole("button", { name: LINE });
  await card.click({ position: ON_TIME });
  await expect(subtitle.getByText(LINE_JA)).toBeVisible();

  await page.reload();
  await card.click({ position: ON_TIME });
  await expect(subtitle.getByText(LINE_JA)).toBeVisible();
});

test("a first load whose player replaces its response before requesting its track shows the Japanese line", async ({
  context,
}) => {
  // youtube.com, 2026-11-18: the player swapped the page's initial response (baseUrls
  // that need a PO token) for a refreshed one and requested its track from that.
  await routeYouTube(context, { refreshResponse: true });
  const page = await context.newPage();
  await page.goto(YOUTUBE_WATCH);
  await page
    .getByRole("complementary", { name: en["app.name"] })
    .getByRole("button", { name: LINE })
    .click({ position: ON_TIME });
  const subtitle = page.locator("langle-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle.getByText(LINE_JA)).toBeVisible();
});

test("words selected in the transcript are saved as a phrase from their card", async ({
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
  const card = transcript.getByRole("button", { name: LINE });
  await card.click({ position: ON_TIME });
  // Playing, the card scrolls into the middle of the list (the drag waits for it to
  // stop); paused, the list does not follow the playing line during the drag.
  await expect(card).toHaveAttribute("aria-current", "true");
  await page.evaluate(() =>
    document.querySelector<HTMLVideoElement>("#movie_player video")!.pause(),
  );
  const phrase = card.locator("[data-span]", {
    hasText: /^extraordinary evidence$/,
  });
  await expect(phrase).toHaveCount(0);
  await card
    .getByText("extraordinary", { exact: true })
    .dragTo(card.getByText("evidence", { exact: true }));

  const selection = page.locator("langle-video");
  await expect(selection).toContainText(en["lookup.status.selected"]);
  await selection
    .getByRole("button", { name: en["hover.addLearning"] })
    .click();
  await expect(selection).not.toContainText(en["lookup.status.selected"]);
  // Classified again: the phrase is one term.
  await expect(phrase).toHaveCount(1);
});

test("a drag in the transcript while the video plays holds the list and the video, and ends in the card's words", async ({
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
  const card = transcript.getByRole("button", { name: LINE });
  await card.click({ position: ON_TIME });
  await expect(card).toHaveAttribute("aria-current", "true");
  const video = page.locator("#movie_player video");
  const paused = () => video.evaluate((v: HTMLVideoElement) => v.paused);
  await expect.poll(paused).toBe(false);

  const list = transcript.locator("[data-list]");
  const scrollTop = () => list.evaluate((el) => el.scrollTop);
  const from = (await card
    .getByText("extraordinary", { exact: true })
    .boundingBox())!;
  const to = (await card.getByText("evidence", { exact: true }).boundingBox())!;
  const player = (await page.locator("#movie_player").boundingBox())!;
  // The pointer on the list: it holds still while the video plays on.
  await page.mouse.move(from.x + 4, from.y + from.height / 2);
  const top = await scrollTop();
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 5,
  });
  // Out of the card, over the video, and let go there.
  await page.mouse.move(
    player.x + player.width / 2,
    player.y + player.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();

  const selection = page.locator("langle-video");
  await expect(selection).toContainText(en["lookup.status.selected"]);
  // Words of the card, from "extraordinary" to the one nearest the video.
  await expect(selection).toContainText("extraordinary");
  expect(await scrollTop()).toBe(top);
  // Held by the selection: the player took no click to play.
  expect(await paused()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(selection).not.toContainText(en["lookup.status.selected"]);
  await expect.poll(paused).toBe(false);
});

test("the video pauses while the dictionary window is open and plays again once it closes", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_WATCH);
  const card = page
    .getByRole("complementary", { name: en["app.name"] })
    .getByRole("button", { name: LINE });
  await card.click({ position: ON_TIME });
  const video = page.locator("#movie_player video");
  const paused = () => video.evaluate((v: HTMLVideoElement) => v.paused);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(paused).toBe(false);

  await card.getByText("creativity", { exact: true }).click();
  const window = page.getByRole("complementary", { name: en["dict.window"] });
  await expect(window).toBeVisible();
  await expect.poll(paused).toBe(true);
  await window.getByRole("button", { name: en["dict.close"] }).click();
  await expect.poll(paused).toBe(false);
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
      "#right-controls > langle-player-buttons + #closed-captioning-button-container",
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
  const subtitle = page.locator("langle-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle).toContainText(LINE);
  await expect(subtitle.locator("[lang=en]").first()).toHaveCSS(
    "font-size",
    "20px",
  );
  await expect(page.locator("langle-transcript")).toHaveCount(0);
  await expect
    .poll(() => highlighted(page, "langle-new"), { timeout: 10_000 })
    .toContain("profound");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { langleViolations: string[] }).langleViolations,
    ),
  ).toEqual([]);
});
