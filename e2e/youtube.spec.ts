import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt, sentenceCards } from "../src/core/subtitles/cues";
import { alignByOverlap } from "../src/core/subtitles/translation";
import { parseYouTubeJson3 } from "../src/core/subtitles/youtube-json3";
import { test, expect, openPopupFor, sendToBackground } from "./fixtures";
import { routeYouTube, YOUTUBE_WATCH as WATCH } from "./sites";

const here = path.dirname(fileURLToPath(import.meta.url));
const subtitles = path.join(here, "../src/core/subtitles/fixtures/youtube");
const cues = (file: string) =>
  parseYouTubeJson3(readFileSync(path.join(subtitles, file), "utf8"));

const EN = cues("en.json3");
const JA = cues("ja.json3");
/** The line the tests seek to: "extraordinary" and "creativity" are New words. */
const LINE = "One is the extraordinary evidence of human creativity";
const flat = (text: string) => text.replaceAll("\n", " ");
const LINE_INDEX = EN.findIndex((c) => flat(c.text) === LINE);
const LINE_CUE = EN[LINE_INDEX]!;
/** What the subtitle shows under it: the Japanese line playing at that time. */
const LINE_JA = cueAt(JA, LINE_CUE.startMs)!.text.replaceAll("\n", "");
/** The transcript's cards are sentences; LINE starts one that goes on for two more cues. */
const CARDS = sentenceCards(EN).cards;
const CARD_INDEX = CARDS.findIndex((c) => flat(c.text).startsWith(LINE));
/** What its transcript card shows: the Japanese lines that overlap it most. */
const CARD_JA = alignByOverlap(CARDS, JA, { lang: "ja" })[CARD_INDEX]!;

const violations = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { lingoViolations: string[] }).lingoViolations,
  );

const transcript = (page: Page) =>
  page.getByRole("complementary", { name: en["video.panel"] });
const inVideo = (page: Page) =>
  page.locator("lingo-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
const belowVideo = (page: Page) =>
  page.locator("lingo-video-below").getByRole("region", {
    name: en["video.subtitle"],
  });
const dictionary = (page: Page) =>
  page.getByRole("complementary", { name: en["dict.window"] });
const lButton = (page: Page) =>
  page.getByRole("button", { name: en["video.toggle"] });
const card = (page: Page, text: string) =>
  transcript(page).getByRole("button", { name: text });
const currentTime = (page: Page) =>
  page.evaluate(() => document.querySelector("video")!.currentTime);

/** Opens the watch page with New words highlighted and seeks to LINE from its card. */
async function openAtLine(context: BrowserContext, extensionId: string) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(WATCH);
  await card(page, LINE).click();
  await expect(inVideo(page)).toContainText(LINE);
  return page;
}

test("the subtitle shows the playing line with its highlights and its Japanese line", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  expect(await currentTime(page)).toBeCloseTo(LINE_CUE.startMs / 1000, 1);
  await expect(inVideo(page).getByText(LINE_JA)).toBeVisible();
  // New words: the bright blue underline over the video.
  await expect(
    inVideo(page).getByText("creativity", { exact: true }),
  ).toHaveCSS("box-shadow", /rgb\(141, 180, 255\)/);
  // Lingo's subtitle replaces YouTube's captions.
  await expect(page.locator("#ytp-caption-window-container")).toBeHidden();

  // The transcript card of the playing line, with its translation.
  const playing = card(page, LINE);
  await expect(playing).toHaveAttribute("aria-current", "true");
  await expect(playing).toContainText(CARD_JA);
  await expect(playing.getByText("creativity", { exact: true })).toHaveCSS(
    "box-shadow",
    /rgb\(47, 111, 228\)/,
  );
  expect(await violations(page)).toEqual([]);
});

test("the menu moves the subtitle below the video and hides its translation", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  await page.getByRole("button", { name: en["video.menu"] }).click();
  const menu = page.getByRole("dialog", { name: en["video.menu"] });
  await expect(menu.getByText(en["video.menu.on"])).toBeVisible();
  await menu.getByRole("button", { name: en["video.menu.belowVideo"] }).click();
  await expect(belowVideo(page)).toContainText(LINE);
  await expect(belowVideo(page).getByText(LINE_JA)).toBeVisible();
  await expect(inVideo(page)).toHaveCount(0);

  await menu
    .getByRole("switch", { name: en["video.menu.translationSwitch"] })
    .click();
  await expect(belowVideo(page).getByText(LINE_JA)).toHaveCount(0);
  await expect(belowVideo(page)).toContainText(LINE);
  // The transcript has its own switch.
  await expect(card(page, LINE)).toContainText(CARD_JA);

  // Escape closes the menu; the choice stays after a reload.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.reload();
  await card(page, LINE).click();
  await expect(belowVideo(page)).toContainText(LINE);
  await expect(belowVideo(page).getByText(LINE_JA)).toHaveCount(0);
});

test("the transcript's switch hides its translations; a card seeks to its line", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const first = card(page, flat(EN[0]!.text));
  await expect(transcript(page).getByText(CARD_JA)).toBeVisible();
  await transcript(page)
    .getByRole("switch", { name: en["video.transcriptTranslation"] })
    .click();
  await expect(transcript(page).getByText(CARD_JA)).toHaveCount(0);
  // The subtitle keeps its translation.
  await expect(inVideo(page).getByText(LINE_JA)).toBeVisible();

  await first.click();
  await expect(inVideo(page)).toContainText(flat(EN[0]!.text));
  expect(await currentTime(page)).toBeCloseTo(EN[0]!.startMs / 1000, 1);
  await expect(first).toHaveAttribute("aria-current", "true");
});

test("hovering a word shows its card; clicking it opens the dictionary window", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const word = inVideo(page).getByText("creativity", { exact: true });
  await word.hover();
  await expect(page.getByText(en["hover.hint"])).toBeVisible();
  await expect(page.getByText(en["lookup.status.new"])).toBeVisible();
  // The video keeps playing state: hovering does not pause or play it.
  expect(
    await page.evaluate(() => document.querySelector("video")!.paused),
  ).toBe(true);

  await word.click();
  const window = dictionary(page);
  await expect(
    window.getByRole("heading", { name: "creativity" }),
  ).toBeVisible();
  await expect(window.getByText(/^In this video · \d+$/)).toBeVisible();
  // The window does not cover the subtitle, and only 12px of the transcript.
  const win = (await window.boundingBox())!;
  const sub = (await inVideo(page).boundingBox())!;
  expect(win.y + win.height).toBeLessThanOrEqual(sub.y);
  const side = (await transcript(page).boundingBox())!;
  expect(win.x + win.width).toBeCloseTo(side.x + 12, 0);

  // A line of "In this video" seeks there.
  await page.evaluate(() => {
    document.querySelector("video")!.currentTime = 0;
  });
  await window
    .getByRole("button", { name: new RegExp(`^0:48\\s*${LINE}`) })
    .click();
  await expect
    .poll(() => currentTime(page))
    .toBeCloseTo(LINE_CUE.startMs / 1000, 1);
});

test("the Words tab lists the video's words; a row opens its dictionary window", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const panel = transcript(page);
  const wordsTab = panel.getByRole("tab", { name: en["video.words"] });
  await wordsTab.click();
  await expect(wordsTab).toHaveAttribute("aria-selected", "true");
  await expect(card(page, LINE)).toHaveCount(0);

  // Rows with their counts; the chips count them.
  const row = (head: string) =>
    panel.getByRole("button", { name: new RegExp(`^${head}\\s*\\d+×`) });
  await expect(row("creativity")).toContainText("1×");
  await expect(row("extraordinary")).toBeVisible();
  const chips = panel.getByRole("group", { name: en["video.words.filter"] });
  const all = chips.getByRole("button", { name: /^All \d+$/ });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  const rows = panel.locator("[data-word-row]");
  expect(await rows.count()).toBe(
    Number((await all.textContent())!.match(/\d+/)![0]),
  );

  // New only: every row is underlined in blue.
  const newChip = chips.getByRole("button", {
    name: new RegExp(`^${en["card.chip.new"]} \\d+$`),
  });
  await newChip.click();
  await expect(newChip).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(
    Number((await newChip.textContent())!.match(/\d+/)![0]),
  );
  await expect(
    row("creativity").getByText("creativity", { exact: true }),
  ).toHaveCSS("box-shadow", /rgb\(47, 111, 228\)/);

  await row("creativity").click();
  const window = dictionary(page);
  await expect(
    window.getByRole("heading", { name: "creativity" }),
  ).toBeVisible();
  await expect(
    window.getByText(en["dict.inVideo"].replace("{count}", "1"), {
      exact: true,
    }),
  ).toBeVisible();
  await expect(row("creativity")).toHaveAttribute("aria-pressed", "true");

  // The Transcript tab comes back with its cards.
  await panel.getByRole("tab", { name: en["video.transcript"] }).click();
  await expect(card(page, LINE)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("hovering a word known by its frequency shows its card as Known", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  // "and in all of the people here;": the third line of LINE's card.
  await page.evaluate(() => {
    document.querySelector("video")!.currentTime = 56.5;
  });
  const word = inVideo(page).getByText("people", { exact: true });
  await word.hover();
  await expect(page.getByText(en["hover.hint"])).toBeVisible();
  // Not saved, but known by its frequency: Known, as the mock's statuses go.
  const card = page.locator("lingo-video");
  await expect(
    card.getByRole("button", { name: en["hover.known"], exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByText(en["lookup.status.new"])).toHaveCount(0);
});

test("+ Learning in the window highlights the word everywhere and survives a reload", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  await inVideo(page).getByText("creativity", { exact: true }).click();
  await dictionary(page)
    .getByRole("button", { name: en["dict.status.learning"], exact: true })
    .click();
  const learningOnVideo = /rgba\(15, 159, 126, 0\.55\)/;
  const learningOnPage = "rgb(211, 241, 229)";
  await expect(
    inVideo(page).getByText("creativity", { exact: true }),
  ).toHaveCSS("background-color", learningOnVideo);
  await expect(
    card(page, LINE).getByText("creativity", { exact: true }),
  ).toHaveCSS("background-color", learningOnPage);
  await expect(
    dictionary(page).getByRole("button", {
      name: en["dict.status.remove"],
    }),
  ).toBeVisible();

  await page.reload();
  await card(page, LINE).click();
  await expect(
    inVideo(page).getByText("creativity", { exact: true }),
  ).toHaveCSS("background-color", learningOnVideo);
  await expect(
    card(page, LINE).getByText("creativity", { exact: true }),
  ).toHaveCSS("background-color", learningOnPage);
});

test("the L button turns Lingo off for the video: YouTube's captions come back", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const l = lButton(page);
  await expect(l).toHaveAttribute("aria-pressed", "true");
  await l.click();
  await expect(l).toHaveAttribute("aria-pressed", "false");
  await expect(inVideo(page)).toHaveCount(0);
  await expect(transcript(page)).toHaveCount(0);
  await expect(page.locator("#ytp-caption-window-container")).toBeAttached();
  expect(
    await page
      .locator("#ytp-caption-window-container")
      .evaluate((el) => getComputedStyle(el).display),
  ).not.toBe("none");
  await page.getByRole("button", { name: en["video.menu"] }).click();
  await expect(page.getByText(en["video.menu.off"])).toBeVisible();
  await page.keyboard.press("Escape");

  await l.click();
  await expect(inVideo(page)).toContainText(LINE);
  await expect(transcript(page)).toBeVisible();
});

test("at the end of the video, Video finished offers to save the rest, with Undo", async ({
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
  await expect(end.getByText(en["saveAll.allSaved"])).toBeVisible();
  await end.getByRole("button", { name: en["saveAll.undo"] }).click();
  await expect(end.getByText(/^\d+ words not saved yet$/)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the popup's This video saves the video's unsaved words", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const popup = await openPopupFor(context, extensionId, page);
  await expect(
    popup.getByText("www.youtube.com", { exact: true }),
  ).toBeVisible();
  await expect(popup.getByText(en["saveAll.scope.video"])).toBeVisible();
  const line = await popup.getByText(/^\d+ words not saved yet$/).textContent();
  const unsaved = Number(/\d+/.exec(line!)![0]);
  expect(unsaved).toBeGreaterThan(0);

  await popup.getByRole("button", { name: en["saveAll.addLearning"] }).click();
  await expect(
    popup.getByText(`${unsaved} words added to Learning`),
  ).toBeVisible();
  await expect(
    inVideo(page).getByText("creativity", { exact: true }),
  ).toHaveCSS("background-color", /rgba\(15, 159, 126, 0\.55\)/);
  await popup.getByRole("button", { name: en["saveAll.undo"] }).click();
  await expect(popup.getByText(`${unsaved} words not saved yet`)).toBeVisible();
});
