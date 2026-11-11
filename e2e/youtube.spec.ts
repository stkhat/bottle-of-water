import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt, sentenceCards } from "../src/core/subtitles/cues";
import { alignByOverlap } from "../src/core/subtitles/translation";
import { parseYouTubeJson3 } from "../src/core/subtitles/youtube-json3";
import { test, expect, knownCount, sendToBackground } from "./fixtures";
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
/** A transcript card's time, top left: the words in a card open the dictionary instead. */
const ON_TIME = { x: 16, y: 12 };
const card = (page: Page, text: string) =>
  transcript(page).getByRole("button", { name: text });
const currentTime = (page: Page) =>
  page.evaluate(() => document.querySelector("video")!.currentTime);

/** The page's element drawn on top at the middle of `target` (a shadow host for Lingo). */
async function topmostAt(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  return page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.localName,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

/** Opens the watch page with New words highlighted and seeks to LINE from its card. */
async function openAtLine(context: BrowserContext, extensionId: string) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(WATCH);
  await card(page, LINE).click({ position: ON_TIME });
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

  // Escape closes the menu; the choice stays after a reload (once it is saved).
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect
    .poll(async () => {
      const reply = (await sendToBackground(context, extensionId, {
        type: "getSettings",
      })) as {
        value: { subtitlePosition: string; subtitleTranslation: boolean };
      };
      return reply.value;
    })
    .toMatchObject({
      subtitlePosition: "belowVideo",
      subtitleTranslation: false,
    });
  await page.reload();
  await card(page, LINE).click({ position: ON_TIME });
  await expect(belowVideo(page)).toContainText(LINE);
  await expect(belowVideo(page).getByText(LINE_JA)).toHaveCount(0);
});

test("the menu's sliders change the subtitle's text size and background, and are saved", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const line = inVideo(page).locator("p").first();
  await expect(line).toHaveCSS("font-size", "24px");
  await expect(line).toHaveCSS("background-color", "rgba(8, 10, 16, 0.8)");

  await page.getByRole("button", { name: en["video.menu"] }).click();
  const menu = page.getByRole("dialog", { name: en["video.menu"] });
  const size = menu.getByRole("slider", { name: en["video.menu.size"] });
  const background = menu.getByRole("slider", {
    name: en["video.menu.opacity"],
  });
  await size.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(line).toHaveCSS("font-size", "28.8px");
  await background.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(line).toHaveCSS("background-color", "rgba(8, 10, 16, 0.75)");

  await expect
    .poll(async () => {
      const reply = (await sendToBackground(context, extensionId, {
        type: "getSettings",
      })) as { value: { subtitleSize: number; subtitleOpacity: number } };
      return reply.value;
    })
    .toMatchObject({ subtitleSize: 120, subtitleOpacity: 75 });
  await page.reload();
  await card(page, LINE).click();
  await expect(inVideo(page).locator("p").first()).toHaveCSS(
    "font-size",
    "28.8px",
  );
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

  await first.click({ position: ON_TIME });
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

test("a transcript word shows its card and opens the window; a press elsewhere closes it", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const time = await currentTime(page);
  const word = card(page, LINE).getByText("creativity", { exact: true });
  await word.hover();
  await expect(page.getByText(en["hover.hint"])).toBeVisible();

  await word.click();
  const window = dictionary(page);
  await expect(
    window.getByRole("heading", { name: "creativity" }),
  ).toBeVisible();
  // A word's click opens it: no seek.
  expect(await currentTime(page)).toBe(time);
  // "In this video" marks the word in its line.
  await expect(
    window.locator("[data-mark]", { hasText: "creativity" }).first(),
  ).toBeVisible();

  // A press in the window keeps it; one on another word switches it.
  await window.getByRole("heading", { name: "creativity" }).click();
  await inVideo(page).getByText("extraordinary", { exact: true }).click();
  await expect(
    window.getByRole("heading", { name: "extraordinary" }),
  ).toBeVisible();

  // A press on the page closes it.
  await page.mouse.click(5, 5);
  await expect(window).toHaveCount(0);
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
  await card(page, LINE).click({ position: ON_TIME });
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

test("in fullscreen the subtitle, hover card, dictionary window and menu stay; leaving brings the transcript back", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  // YouTube makes the whole app fullscreen, not the player.
  await page.getByRole("button", { name: "Full screen (f)" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.localName))
    .toBe("ytd-app");
  await expect(transcript(page)).toHaveCount(0);

  // The subtitle over the video, larger, with its translation.
  const word = inVideo(page).getByText("creativity", { exact: true });
  await expect(word).toHaveCSS("font-size", "34px");
  await expect(inVideo(page).getByText(LINE_JA)).toBeVisible();
  await expect(page.locator("#ytp-caption-window-container")).toBeHidden();

  // The hover card shows inside the fullscreen element, on top.
  await word.hover();
  const hint = page.getByText(en["hover.hint"]);
  await expect(hint).toBeVisible();
  expect(await topmostAt(page, hint)).toBe("lingo-video");

  // The dictionary window opens at the top right of the screen.
  await word.click();
  const window = dictionary(page);
  await expect(
    window.getByRole("heading", { name: "creativity" }),
  ).toBeVisible();
  const win = (await window.boundingBox())!;
  const width = await page.evaluate(() => innerWidth);
  expect(win.y).toBeCloseTo(32, 0);
  expect(win.x + win.width).toBeCloseTo(width - 32, 0);
  expect(await topmostAt(page, window)).toBe("lingo-video");
  await window.getByRole("button", { name: en["dict.close"] }).click();
  await expect(window).toHaveCount(0);

  // The menu: no subtitle position; the gear, the translation switch and the sliders.
  await page.getByRole("button", { name: en["video.menu"] }).click();
  const menu = page.getByRole("dialog", { name: en["video.menu"] });
  await expect(menu.getByText(en["video.menu.on"])).toBeVisible();
  await expect(
    menu.getByRole("group", { name: en["video.menu.position"] }),
  ).toHaveCount(0);
  await expect(menu.getByText(en["video.menu.subtitles"])).toHaveCount(0);
  await expect(menu.getByText(en["video.menu.showTranslation"])).toBeVisible();
  await expect(
    menu.getByRole("button", { name: en["video.menu.openSettings"] }),
  ).toBeVisible();
  await expect(
    menu.getByRole("slider", { name: en["video.menu.size"] }),
  ).toBeVisible();
  const translation = menu.getByRole("switch", {
    name: en["video.menu.translationSwitch"],
  });
  await translation.click();
  await expect(inVideo(page).getByText(LINE_JA)).toHaveCount(0);
  await translation.click();
  await expect(inVideo(page).getByText(LINE_JA)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // The L button turns Lingo off and on, still in fullscreen.
  const l = lButton(page);
  await l.click();
  await expect(l).toHaveAttribute("aria-pressed", "false");
  await expect(inVideo(page)).toHaveCount(0);
  await l.click();
  await expect(inVideo(page)).toContainText(LINE);
  expect(await page.evaluate(() => document.fullscreenElement?.localName)).toBe(
    "ytd-app",
  );

  // Leaving fullscreen: the transcript, the normal subtitle and the menu's positions.
  await page.getByRole("button", { name: "Exit full screen (f)" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  await expect(card(page, LINE)).toBeVisible();
  await expect(word).toHaveCSS("font-size", "24px");
  await page.getByRole("button", { name: en["video.menu"] }).click();
  await expect(
    menu.getByRole("group", { name: en["video.menu.position"] }),
  ).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("at the end of the video, unsaved new words become Known when Settings say so", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { unsavedAtEnd: "known" },
  });
  const page = await openAtLine(context, extensionId);
  expect(await knownCount(context, extensionId)).toBe(0);
  await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    video.currentTime = video.duration - 0.5;
    await video.play();
  });
  await expect
    .poll(() => knownCount(context, extensionId), { timeout: 10_000 })
    .toBeGreaterThan(0);
  // Nothing shows on the page.
  await expect(page.getByText("Video finished")).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
});
