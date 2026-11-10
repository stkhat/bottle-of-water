import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt, sentenceCards } from "../src/core/subtitles/cues";
import { alignByOverlap } from "../src/core/subtitles/translation";
import { parseTtml } from "../src/core/subtitles/ttml";
import { fixtureManifest } from "../tests/netflix-subtitles";
import type { FakeNetflixControl } from "./fake-netflix-player";
import { test, expect, sendToBackground } from "./fixtures";
import { NETFLIX_WATCH as WATCH, routeNetflix } from "./sites";

const here = path.dirname(fileURLToPath(import.meta.url));
const subtitles = path.join(here, "../src/core/subtitles/fixtures/netflix");
const read = (file: string) => readFileSync(path.join(subtitles, file), "utf8");

// The English closed captions (Lingo reads the IMSC file; the DFXP one has the same lines).
const EN = parseTtml(read("en.imsc.ttml"));
const JA = parseTtml(read("ja.imsc.ttml"));
/** The line the tests seek to: "EXTRAORDINARY" is a New word (closed captions are in capitals). */
const LINE = "EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.";
const flat = (text: string) => text.replaceAll("\n", " ");
const LINE_INDEX = EN.findIndex((c) => flat(c.text) === LINE);
const LINE_CUE = EN[LINE_INDEX]!;
/** What the subtitle shows under it: the Japanese line playing at that time. */
const LINE_JA = cueAt(JA, LINE_CUE.startMs)!.text.replaceAll("\n", "");
/** The transcript's cards are sentences (two cues of the fixture make one). */
const CARDS = sentenceCards(EN).cards;
/** The card whose translation joins two Japanese lines' worth of English. */
const PAIR_INDEX = 1;
const PAIR_JA = alignByOverlap(CARDS, JA, { lang: "ja" })[PAIR_INDEX]!;

const transcript = (page: Page) =>
  page.getByRole("complementary", { name: en["video.panel"] });
const inVideo = (page: Page) =>
  page.locator("lingo-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
const lButton = (page: Page) =>
  page.getByRole("button", { name: en["video.toggle"] });
const controlBar = (page: Page) =>
  page.locator("[data-uia='controls-standard']");
/** Moves the pointer over the video, so Netflix shows its control bar. */
async function moveOverVideo(page: Page) {
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 3, viewport.height / 2);
  await page.mouse.move(viewport.width / 3 + 10, viewport.height / 2 + 10);
  await expect(controlBar(page)).toBeVisible();
}
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
  await expect(card(page, flat(CARDS[PAIR_INDEX]!.text))).toContainText(
    PAIR_JA,
  );
  // At the right of the player, clear of Netflix's control bar.
  const box = (await transcript(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x + box.width).toBeCloseTo(viewport.width - 16, 0);
  await moveOverVideo(page);
  const bar = (await controlBar(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
});

test("the L and ^ buttons come and go with Netflix's control bar, before the audio & subtitles button", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const buttons = page.locator("lingo-player-buttons");
  /** The buttons sit in the bar's row of buttons, before the audio & subtitles button's wrapper. */
  const inRow = () =>
    buttons.evaluate(
      (el) =>
        el.nextElementSibling?.firstElementChild?.getAttribute("data-uia") ===
          "control-audio-subtitle" &&
        el.parentElement?.querySelector("[data-uia='control-next']") !== null,
    );
  await moveOverVideo(page);
  await expect(lButton(page)).toBeVisible();
  expect(await inRow()).toBe(true);

  // The pointer stops: Netflix removes the bar, and the buttons go with it.
  await page.mouse.move(5, 5);
  await expect(controlBar(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(buttons).toHaveCount(0);

  // It moves again: a new bar, with the buttons in it, still working.
  await moveOverVideo(page);
  await expect(lButton(page)).toBeVisible();
  expect(await inRow()).toBe(true);
  const menu = page.getByRole("button", { name: en["video.menu"] });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
});

test("the subtitle rises above Netflix's control bar while it shows", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const player = (await page
    .locator(".watch-video--player-view")
    .boundingBox())!;
  const subtitleBottom = async () => {
    const box = (await inVideo(page).boundingBox())!;
    return box.y + box.height;
  };
  await page.mouse.move(5, 5);
  await expect(controlBar(page)).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(subtitleBottom)
    .toBeCloseTo(player.y + player.height - 64, 0);

  await moveOverVideo(page);
  const bar = (await controlBar(page).boundingBox())!;
  await expect.poll(subtitleBottom).toBeCloseTo(bar.y - 12, 0);

  // The pointer stops: the bar goes, and the subtitle comes back down.
  await page.mouse.move(5, 5);
  await expect(controlBar(page)).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(subtitleBottom)
    .toBeCloseTo(player.y + player.height - 64, 0);
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

test("the Words tab lists the episode's words; a row opens its dictionary window", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  await transcript(page).getByRole("tab", { name: en["video.words"] }).click();
  const row = transcript(page).getByRole("button", {
    name: /^extraordinary\s*\d+×/,
  });
  await row.click();
  const window = page.getByRole("complementary", { name: en["dict.window"] });
  await expect(
    window.getByRole("heading", { name: "extraordinary" }),
  ).toBeVisible();
  await expect(window.getByText(/^In this video · \d+$/)).toBeVisible();
  await expect(row).toHaveAttribute("aria-pressed", "true");
});

test("the L button turns Lingo off: Netflix's subtitles come back", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  await moveOverVideo(page);
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
    result: { movieId: number; textTracks: { language: string | null }[] };
  };
  manifest.result.movieId = 80000002;
  manifest.result.textTracks = manifest.result.textTracks.filter(
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
  await expect(card(page, flat(CARDS[PAIR_INDEX]!.text))).not.toContainText(
    PAIR_JA,
  );
  await card(page, LINE).click();
  await expect(inVideo(page)).toContainText(LINE);
  await expect(inVideo(page).getByText(LINE_JA)).toHaveCount(0);
});
