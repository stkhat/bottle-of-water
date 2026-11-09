import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { cueAt, sentenceCards } from "../src/core/subtitles/cues";
import { alignByOverlap } from "../src/core/subtitles/translation";
import { parseYouTubeJson3 } from "../src/core/subtitles/youtube-json3";
import {
  FIXTURE_VIDEO_ID,
  fixturePlayerResponse,
  timedtextBody,
} from "../tests/youtube-timedtext";
import { installFakeYouTubePlayer } from "./fake-youtube-player";
import { test, expect, sendToBackground } from "./fixtures";
import { routeTalkVideo } from "./routes";

const here = path.dirname(fileURLToPath(import.meta.url));
const WATCH = `https://www.youtube.com/watch?v=${FIXTURE_VIDEO_ID}`;
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

/**
 * Serves youtube.com from fixtures: the watch-page skeleton (with Trusted Types
 * enforced, as on the real site), a local 140-second video (the recorded captions end
 * at 2:15), the recorded /api/timedtext answers, and a fake player API. Nothing
 * reaches the real site.
 */
async function routeYouTube(context: BrowserContext) {
  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await context.route("https://www.youtube.com/watch*", (route) => {
    const html = readFileSync(
      path.join(here, "fixtures/youtube-watch.html"),
      "utf8",
    ).replace("<video", '<video src="/lingo-test/talk.webm" muted');
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      headers: {
        "content-security-policy": "require-trusted-types-for 'script'",
      },
      body: html,
    });
  });
  await routeTalkVideo(context, "https://www.youtube.com/lingo-test/talk.webm");
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

const violations = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { lingoViolations: string[] }).lingoViolations,
  );

const transcript = (page: Page) =>
  page.getByRole("complementary", { name: en["video.transcript"] });
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

test("the popup's This page answers for the video", async ({
  context,
  extensionId,
}) => {
  const page = await openAtLine(context, extensionId);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Without the "tabs" permission tab URLs are hidden: ask every tab.
  const ask = (message: object) =>
    popup.evaluate(async (message) => {
      const { chrome: api } = globalThis as unknown as {
        chrome: {
          tabs: {
            query(q: object): Promise<{ id: number }[]>;
            sendMessage(id: number, m: unknown): Promise<unknown>;
          };
        };
      };
      const replies = await Promise.all(
        (await api.tabs.query({})).map((tab) =>
          api.tabs.sendMessage(tab.id, message).catch(() => undefined),
        ),
      );
      return replies.filter((r) => r !== undefined);
    }, message);

  const [summary, ...others] = (await ask({ type: "pageSummary" })) as {
    supported: boolean;
    unsaved: number;
  }[];
  expect(others).toEqual([]);
  expect(summary).toMatchObject({ supported: true, done: null });
  expect(summary!.unsaved).toBeGreaterThan(0);
  expect(await ask({ type: "pageSaveAll", status: "learning" })).toEqual([
    {
      supported: true,
      unsaved: 0,
      done: { count: summary!.unsaved, target: "learning" },
    },
  ]);
  await expect(
    inVideo(page).getByText("creativity", { exact: true }),
  ).toHaveCSS("background-color", /rgba\(15, 159, 126, 0\.55\)/);
  expect(await ask({ type: "pageUndo" })).toEqual([summary]);
});
