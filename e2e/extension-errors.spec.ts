// Drives every flow of the extension while collecting what Chrome's
// chrome://extensions → Errors page would show (error-collector.ts): each test fails
// with the list when the extension logged an error or a warning, or threw.
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { fixtureManifest } from "../tests/netflix-subtitles";
import { fixturePlayerResponse } from "../tests/youtube-timedtext";
import {
  collectExtensionErrors,
  connectBrowserCdp,
  freePort,
  type BrowserCdp,
  type ErrorCollector,
} from "./error-collector";
import type { FakeNetflixControl } from "./fake-netflix-player";
import {
  test as base,
  type Build,
  extensionIdOf,
  extensionPathOf,
  launchWithExtension,
  openPopupFor,
  sendToBackground,
} from "./fixtures";
import {
  NETFLIX_WATCH,
  YOUTUBE_WATCH,
  routeNetflix,
  routeYouTube,
} from "./sites";

const test = base.extend<{
  build: Build;
  port: number;
  cdp: BrowserCdp;
  errors: ErrorCollector;
}>({
  build: ["production", { option: true }],
  // eslint-disable-next-line no-empty-pattern
  port: async ({}, use) => {
    await use(await freePort());
  },
  context: async ({ build, port }, use) => {
    const context = await launchWithExtension(
      [
        `--remote-debugging-port=${port}`,
        // For CDP's Extensions.loadUnpacked, which reloads the extension.
        "--enable-unsafe-extension-debugging",
      ],
      build,
    );
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
  cdp: async ({ context, port }, use) => {
    void context;
    const cdp = await connectBrowserCdp(port);
    await use(cdp);
    cdp.close();
  },
  errors: [
    async ({ context, extensionId, cdp }, use) => {
      const errors = await collectExtensionErrors(context, extensionId, cdp);
      await use(errors);
      // A last round trip: whatever the background was doing has been reported.
      await sendToBackground(context, extensionId, { type: "getSettings" });
      errors.stop();
      expect(errors.format(), "Lingo's reports on the Errors page").toBe("");
    },
    { auto: true },
  ],
});
const expect = test.expect;

/** The text of every range registered under a highlight name ([] when it is not registered). */
function highlighted(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

/** Scrolls `text` (inside the article) into view and returns a point on it. */
function pointOn(page: Page, text: string) {
  return page.evaluate((text) => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf(text);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + text.length);
      node.parentElement!.scrollIntoView({ block: "center" });
      const r = range.getBoundingClientRect();
      return { x: r.left + 3, y: r.top + r.height / 2 };
    }
    throw new Error(`"${text}" not found`);
  }, text);
}

async function showNewWords(context: BrowserContext, extensionId: string) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
}

/** Opens the article fixture and waits for its first analysis. */
async function openArticle(context: BrowserContext, url = "/article-en.html") {
  const page = await context.newPage();
  await page.goto(url);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  return page;
}

/** A transcript card's time, top left: the words in a card open the dictionary instead. */
const ON_TIME = { x: 16, y: 12 };
const dictionary = (page: Page) =>
  page.getByRole("complementary", { name: en["dict.title"] });

/** Hover, click, a status change in the panel, a phrase, and the end of the article. */
async function useArticle(page: Page) {
  const tangy = await pointOn(page, "tangy");
  await page.mouse.move(tangy.x, tangy.y);
  await expect(
    page.getByRole("button", { name: en["hover.details"] }),
  ).toBeVisible();
  await page.mouse.click(tangy.x, tangy.y);
  const panel = dictionary(page);
  await expect(panel.getByRole("heading", { name: "tangy" })).toBeVisible();
  await panel
    .getByRole("button", { name: en["dict.status.learning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toContain("tangy");
  await panel
    .getByRole("button", { name: en["dict.status.known"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .not.toContain("tangy");
  await page.keyboard.press("Escape");

  await pointOn(page, "rise and fall");
  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const start = node.data.indexOf("rise and");
      if (start < 0) continue;
      const end = node.data.indexOf("fall", start) + 2;
      getSelection()!.setBaseAndExtent(node, start + 1, node, end);
      return;
    }
  });
  await page
    .getByRole("button", { name: en["hover.addLearning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toContain("rise and fall");

  await page.evaluate(() =>
    document
      .querySelector("article")!
      .lastElementChild!.scrollIntoView({ block: "center" }),
  );
}

/**
 * The production build's `useArticle`: Lingo's UI is behind closed shadow roots there,
 * so the article is used through the mouse and keyboard only (a word's card and
 * dictionary, Escape, the end of the article), without reading or pressing the UI.
 */
async function useArticleBlindly(page: Page) {
  const tangy = await pointOn(page, "tangy");
  await page.mouse.move(tangy.x, tangy.y);
  await expect
    .poll(() => hostAt(page, tangy.x, tangy.y - 40))
    .toBe("lingo-article");
  await page.mouse.click(tangy.x, tangy.y);
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    document
      .querySelector("article")!
      .lastElementChild!.scrollIntoView({ block: "center" }),
  );
}

/** The local name of the element a page script finds at a viewport point. */
function hostAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.localName ?? null,
    { x, y },
  );
}

/**
 * The popup on `page`: switches the site off and on when asked, then closes. With
 * `answeredBy`, it waits for the page's content script to answer (the host shows).
 */
async function usePopup(
  context: BrowserContext,
  extensionId: string,
  page: Page,
  { toggleSite, answeredBy }: { toggleSite: boolean; answeredBy?: string },
) {
  const popup = await openPopupFor(context, extensionId, page);
  await expect(popup.getByText(en["app.name"], { exact: true })).toBeVisible();
  if (answeredBy)
    await expect(popup.getByText(answeredBy, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  if (toggleSite) {
    // The switch does nothing until the settings are loaded (the language pair shows).
    await expect(popup.getByText(/^\S+ → \S+$/)).toBeVisible();
    const site = popup.getByRole("switch", { name: en["popup.siteSwitch"] });
    await expect(site).toBeChecked();
    await site.click();
    await expect(site).not.toBeChecked();
    await site.click();
    await expect(site).toBeChecked();
  }
  // At least one refresh (every second) while open.
  await expect(popup.getByText(/Sync space:/)).toBeVisible();
  await popup.close();
}

// The production build, and the check build loaded in your own Chrome (WXT's dev
// logging and the self-reload are only in that one).
for (const build of ["production", "check"] as const)
  test.describe(`${build} build`, () => {
    test.use({ build });
    // The production build closes the shadow roots of Lingo's UI on web pages
    // (shadow-mode.ts): Playwright cannot reach into the UI there. On that build the
    // flows load the pages and use them through the mouse and keyboard, and leave out
    // the steps that read or press Lingo's UI; the check build does every step.
    const reachesUi = build === "check";
    // What differs between the builds is the UI on web pages (and the reload), so the
    // production build runs only the flows on web pages; the rest runs once, on the
    // check build, which does every step.
    const checkBuildOnly = reachesUi;

    if (checkBuildOnly)
      test("the collector hears the service worker and the extension's pages", async ({
        context,
        extensionId,
        errors,
      }) => {
        const worker = context.serviceWorkers()[0]!;
        await worker.evaluate(() => {
          console.warn("lingo-test: a warning");
          setTimeout(() => {
            throw new Error("lingo-test: thrown");
          });
          void Promise.reject(new Error("lingo-test: rejected"));
        });
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/popup.html`);
        await page.evaluate(() => {
          console.error("lingo-test: a page error");
          setTimeout(() => {
            throw new Error("lingo-test: thrown on the page");
          });
        });
        const texts = () => errors.reports.map((r) => `${r.source}: ${r.text}`);
        await expect
          .poll(texts)
          .toEqual(
            expect.arrayContaining([
              "service worker: lingo-test: a warning",
              expect.stringMatching(
                /^service worker: Uncaught.*lingo-test: thrown/,
              ),
              expect.stringMatching(
                /^service worker: Uncaught \(in promise\).*lingo-test: rejected/,
              ),
              "extension page /popup.html: lingo-test: a page error",
              "extension page /popup.html: Uncaught Error: lingo-test: thrown on the page",
            ]),
          );
        errors.reports.length = 0;
      });

    test("an extension reload leaves the old content scripts quiet", async ({
      context,
      extensionId,
      cdp,
    }) => {
      await showNewWords(context, extensionId);
      await routeYouTube(context);
      const article = await openArticle(context);
      const video = await context.newPage();
      await video.goto(YOUTUBE_WATCH);
      if (reachesUi) {
        await videoCard(video, YT_LINE).click({ position: ON_TIME });
        await expect(inVideo(video)).toContainText(YT_LINE);
      } else await expect(video.locator("lingo-video-player")).toHaveCount(1);

      // Loading the folder again reloads the extension, as the check build does when
      // a new build is copied in (runtime.reload() does not bring back an extension
      // loaded from the command line).
      const reply = await cdp.send("Extensions.loadUnpacked", {
        path: extensionPathOf(build),
      });
      expect(reply.result).toEqual({ id: extensionId });

      // The pages are used as before; the old scripts step aside without a word.
      const tangy = await pointOn(article, "tangy");
      await article.mouse.move(tangy.x, tangy.y);
      await article.mouse.click(tangy.x, tangy.y);
      await article.evaluate(() =>
        document
          .querySelector("article")!
          .lastElementChild!.scrollIntoView({ block: "center" }),
      );
      await expect(article.locator("lingo-article")).toHaveCount(0);
      const box = (await video.locator("video").boundingBox())!;
      await video.mouse.move(box.x + box.width / 2, box.y + box.height - 40);
      await video.mouse.click(box.x + box.width / 2, box.y + box.height - 40);
      await video.evaluate(() => {
        document.querySelector("video")!.currentTime = 10;
      });
      await expect(video.locator("lingo-video-player")).toHaveCount(0);
    });

    test("articles: reading, saving, the end of the article, another language, the popup", async ({
      context,
      extensionId,
    }) => {
      await showNewWords(context, extensionId);
      const page = await openArticle(context);
      await (reachesUi ? useArticle(page) : useArticleBlindly(page));
      await usePopup(context, extensionId, page, { toggleSite: true });
      await expect
        .poll(async () => (await highlighted(page, "lingo-new")).length)
        .toBeGreaterThan(0);

      // A page in another language: Lingo stays out, quietly.
      const ja = await context.newPage();
      await ja.goto("/article-ja.html");
      await ja.waitForLoadState("load");
      await usePopup(context, extensionId, ja, { toggleSite: false });
      // The page with hostile styles.
      const hostile = await context.newPage();
      await hostile.goto("/hostile.html");
      await expect(hostile.locator("lingo-article")).toHaveCount(1);
    });

    if (checkBuildOnly)
      test("a Spanish article: reading and saving with the Spanish pack", async ({
        context,
        extensionId,
      }) => {
        await sendToBackground(context, extensionId, {
          type: "setSettings",
          patch: {
            learningLang: "es",
            nativeLang: "en",
            knownLevel: 1000,
            highlight: { new: true },
          },
        });
        const page = await openArticle(context, "/article-es.html");
        const word = await pointOn(page, "comiendo");
        await page.mouse.move(word.x, word.y);
        await expect(page.getByText("to eat", { exact: true })).toBeVisible();
        await page.mouse.click(word.x, word.y);
        const panel = dictionary(page);
        await expect(
          panel.getByRole("heading", { name: "comer" }),
        ).toBeVisible();
        await panel
          .getByRole("button", {
            name: en["dict.status.learning"],
            exact: true,
          })
          .click();
        await expect
          .poll(() => highlighted(page, "lingo-learning"))
          .toContain("comiendo");
        await usePopup(context, extensionId, page, { toggleSite: false });
      });

    const transcript = (page: Page) =>
      page.getByRole("complementary", { name: en["video.panel"] });
    const inVideo = (page: Page) =>
      page.locator("lingo-video-player").getByRole("region", {
        name: en["video.subtitle"],
      });
    const lButton = (page: Page) =>
      page.getByRole("button", { name: en["video.toggle"] });
    const videoCard = (page: Page, text: string) =>
      transcript(page).getByRole("button", { name: text });

    /** Plays the last half second of the video, its unsaved new words marked Known. */
    async function playToEnd(
      context: BrowserContext,
      extensionId: string,
      page: Page,
    ) {
      await sendToBackground(context, extensionId, {
        type: "setSettings",
        patch: { unsavedAtEnd: "known" },
      });
      await page.evaluate(async () => {
        const video = document.querySelector("video")!;
        video.currentTime = video.duration - 0.5;
        await video.play();
      });
      await expect
        .poll(
          () => page.evaluate(() => document.querySelector("video")!.ended),
          {
            timeout: 10_000,
          },
        )
        .toBe(true);
    }

    const YT_LINE = "One is the extraordinary evidence of human creativity";

    test("YouTube: subtitle, menu, transcript, dictionary, L, the end, navigation", async ({
      context,
      extensionId,
    }) => {
      await showNewWords(context, extensionId);
      await routeYouTube(context);
      const page = await context.newPage();
      await page.goto(YOUTUBE_WATCH);
      if (reachesUi) await useYouTube(page);
      else await expect(page.locator("lingo-video-player")).toHaveCount(1);
      await usePopup(context, extensionId, page, {
        toggleSite: true,
        answeredBy: new URL(YOUTUBE_WATCH).hostname,
      });
      if (reachesUi) await playToEnd(context, extensionId, page);

      // YouTube's single-page navigation to a video without captions for Lingo.
      await page.evaluate((response) => {
        const other = structuredClone(response) as {
          captions?: {
            playerCaptionsTracklistRenderer?: {
              captionTracks?: { baseUrl: string }[];
            };
          };
        };
        for (const track of other.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks ?? [])
          track.baseUrl = track.baseUrl.replace(/v=[^&]+/, "v=otherVideo1");
        history.pushState(null, "", "/watch?v=otherVideo1");
        (
          document.getElementById("movie_player") as unknown as {
            fakeNavigate(next: object): void;
          }
        ).fakeNavigate({
          videoId: "otherVideo1",
          title: "Another video",
          playerResponse: other,
        });
      }, fixturePlayerResponse());
      if (reachesUi) await expect(videoCard(page, YT_LINE)).toHaveCount(0);
      await usePopup(context, extensionId, page, { toggleSite: false });
    });

    /** The YouTube flow through Lingo's UI (check build). */
    async function useYouTube(page: Page) {
      await videoCard(page, YT_LINE).click({ position: ON_TIME });
      await expect(inVideo(page)).toContainText(YT_LINE);

      // Hover and click a word; save it.
      const word = inVideo(page).getByText("creativity", { exact: true });
      await word.hover();
      await expect(page.getByText(en["hover.hint"])).toBeVisible();
      await word.click();
      const window = page.getByRole("complementary", {
        name: en["dict.window"],
      });
      await window
        .getByRole("button", { name: en["dict.status.learning"], exact: true })
        .click();
      await expect(
        window.getByRole("button", { name: en["dict.status.remove"] }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      // The menu: below the video, translation off and on, back in the video.
      await page.getByRole("button", { name: en["video.menu"] }).click();
      const menu = page.getByRole("dialog", { name: en["video.menu"] });
      await menu
        .getByRole("button", { name: en["video.menu.belowVideo"] })
        .click();
      const translation = menu.getByRole("switch", {
        name: en["video.menu.translationSwitch"],
      });
      await translation.click();
      await translation.click();
      await menu
        .getByRole("button", { name: en["video.menu.inVideo"] })
        .click();
      await page.keyboard.press("Escape");
      await expect(inVideo(page)).toContainText(YT_LINE);

      // The transcript's own switch, and a card that seeks.
      const ownSwitch = transcript(page).getByRole("switch", {
        name: en["video.transcriptTranslation"],
      });
      await ownSwitch.click();
      await ownSwitch.click();
      await videoCard(page, YT_LINE).click({ position: ON_TIME });

      // The Words tab: a filter, a row's dictionary window, back to the transcript.
      const panel = transcript(page);
      await panel.getByRole("tab", { name: en["video.words"] }).click();
      await panel
        .getByRole("group", { name: en["video.words.filter"] })
        .getByRole("button", { name: /^Learning \d+$/ })
        .click();
      await panel.getByRole("button", { name: /^creativity\s*\d+×/ }).click();
      await expect(
        window.getByRole("heading", { name: "creativity" }),
      ).toBeVisible();
      await window.getByRole("button", { name: en["dict.close"] }).click();
      await panel.getByRole("tab", { name: en["video.transcript"] }).click();
      await expect(videoCard(page, YT_LINE)).toBeVisible();

      // The comments: a word's panel, saved as Known, closed.
      await page.locator("ytd-comments#comments").scrollIntoViewIfNeeded();
      const at = await page.evaluate(async () => {
        const has = () =>
          [...(CSS.highlights.get("lingo-new") ?? [])].some(
            (r) => (r as Range).toString() === "profound",
          );
        while (!has()) await new Promise((r) => setTimeout(r, 50));
        const range = [...CSS.highlights.get("lingo-new")!].find(
          (r) => (r as Range).toString() === "profound",
        ) as Range;
        const box = range.getBoundingClientRect();
        return { x: box.left + 3, y: box.top + box.height / 2 };
      });
      await page.mouse.click(at.x, at.y);
      const comments = page
        .locator("lingo-comments")
        .getByRole("complementary");
      await comments
        .getByRole("button", { name: en["dict.status.known"], exact: true })
        .click();
      await expect(
        comments.getByRole("button", { name: en["dict.status.remove"] }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(comments).toHaveCount(0);

      // L off and on.
      const l = lButton(page);
      await l.click();
      await expect(l).toHaveAttribute("aria-pressed", "false");
      await expect(transcript(page)).toHaveCount(0);
      await l.click();
      await expect(inVideo(page)).toContainText(YT_LINE);

      // Fullscreen (YouTube's button makes ytd-app fullscreen): a word's card and
      // window, the menu, and back.
      await page.getByRole("button", { name: "Full screen (f)" }).click();
      await expect(transcript(page)).toHaveCount(0);
      await word.hover();
      await expect(page.getByText(en["hover.hint"])).toBeVisible();
      await word.click();
      await expect(
        window.getByRole("heading", { name: "creativity" }),
      ).toBeVisible();
      await window.getByRole("button", { name: en["dict.close"] }).click();
      await page.getByRole("button", { name: en["video.menu"] }).click();
      await expect(
        menu.getByRole("button", { name: en["video.menu.openSettings"] }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Exit full screen (f)" }).click();
      await expect(videoCard(page, YT_LINE)).toBeVisible();
    }

    const NF_LINE = "EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.";

    test("Netflix: control bar, seek, L, the end, next episode", async ({
      context,
      extensionId,
    }) => {
      await showNewWords(context, extensionId);
      await routeNetflix(context);
      const page = await context.newPage();
      await page.goto(NETFLIX_WATCH);
      if (reachesUi) await useNetflix(page);
      else await expect(page.locator("lingo-video-player")).toHaveCount(1);
      await usePopup(context, extensionId, page, {
        toggleSite: true,
        answeredBy: new URL(NETFLIX_WATCH).hostname,
      });
      if (reachesUi) await playToEnd(context, extensionId, page);

      // The next episode, without a Japanese track.
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
      if (reachesUi) {
        await videoCard(page, NF_LINE).click({ position: ON_TIME });
        await expect(inVideo(page)).toContainText(NF_LINE);
      } else await expect(page.locator("lingo-video-player")).toHaveCount(1);
    });

    /** The Netflix flow through Lingo's UI (check build). */
    async function useNetflix(page: Page) {
      await videoCard(page, NF_LINE).click({ position: ON_TIME });
      await expect(inVideo(page)).toContainText(NF_LINE);

      const controlBar = page.locator("[data-uia='controls-standard']");
      const moveOverVideo = async () => {
        const viewport = page.viewportSize()!;
        await page.mouse.move(viewport.width / 3, viewport.height / 2);
        await page.mouse.move(
          viewport.width / 3 + 10,
          viewport.height / 2 + 10,
        );
        await expect(controlBar).toBeVisible();
      };
      await moveOverVideo();
      await expect(lButton(page)).toBeVisible();
      await page.mouse.move(5, 5);
      await expect(controlBar).toHaveCount(0, { timeout: 10_000 });
      await moveOverVideo();

      const l = lButton(page);
      await l.click();
      await expect(l).toHaveAttribute("aria-pressed", "false");
      await expect(transcript(page)).toHaveCount(0);
      await l.click();
      await expect(inVideo(page)).toContainText(NF_LINE);

      const word = inVideo(page).getByText("EXTRAORDINARY", { exact: true });
      await word.hover();
      await expect(page.getByText(en["hover.hint"])).toBeVisible();
      await word.click();
      const window = page.getByRole("complementary", {
        name: en["dict.window"],
      });
      await expect(window).toBeVisible();
      await window.getByRole("button", { name: en["dict.close"] }).click();

      // Fullscreen from Netflix's bar: a word's card and window, the menu, and back.
      await moveOverVideo();
      await page
        .getByRole("button", { name: "Full screen", exact: true })
        .click();
      await expect(transcript(page)).toHaveCount(0);
      await word.hover();
      await expect(page.getByText(en["hover.hint"])).toBeVisible();
      await word.click();
      await expect(window).toBeVisible();
      await window.getByRole("button", { name: en["dict.close"] }).click();
      await moveOverVideo();
      const menuButton = page.getByRole("button", { name: en["video.menu"] });
      await menuButton.click();
      await expect(
        page.getByRole("button", { name: en["video.menu.openSettings"] }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Exit full screen" }).click();
      await expect(videoCard(page, NF_LINE)).toBeVisible();
    }

    /** Saves a word as the content scripts do. */
    async function saveWord(
      context: BrowserContext,
      extensionId: string,
      key: string,
      status: "learning" | "known",
    ) {
      const reply = await sendToBackground(context, extensionId, {
        type: "saveTerm",
        lang: "en",
        key,
        display: key,
        kind: key.includes(" ") ? "phrase" : "word",
        status,
        source: {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=bake1",
          title: "Baking bread from scratch at home",
          lang: "en",
        },
        sentence: `A sentence with ${key} in it.`,
        pos: { timeMs: 75_000 },
      });
      expect(reply).toMatchObject({ ok: true });
    }

    if (checkBuildOnly)
      test("extension pages: the popup without a content script, settings, word list", async ({
        context,
        extensionId,
      }, testInfo) => {
        // The popup where no content script answers.
        const blank = await context.newPage();
        await blank.goto("about:blank");
        await usePopup(context, extensionId, blank, { toggleSite: false });
        const data = await context.newPage();
        await data.goto("data:text/html,<p>Hello</p>");
        await usePopup(context, extensionId, data, { toggleSite: false });

        // Settings: every control there is.
        const options = await context.newPage();
        await options.goto(`chrome-extension://${extensionId}/options.html`);
        await expect(options.getByRole("switch").first()).toBeVisible();
        for (const select of await options.getByRole("combobox").all()) {
          const values = await select
            .locator("option")
            .evaluateAll((all) =>
              all.map((o) => (o as HTMLOptionElement).value),
            );
          const first = await select.inputValue();
          for (const value of values) await select.selectOption(value);
          await select.selectOption(first);
        }
        await options
          .getByRole("slider", { name: /most common English words as known/ })
          .fill("20000");
        const switches = await options.getByRole("switch").all();
        for (const control of switches) {
          await control.click();
          await control.click();
        }
        for (const box of await options.getByRole("checkbox").all()) {
          await box.click();
          await box.click();
        }
        const positions = options.getByRole("group", {
          name: en["settings.video.position"],
        });
        await positions.getByRole("button").last().click();
        await positions.getByRole("button").first().click();
        await options
          .getByRole("button", { name: en["settings.sites.add"] })
          .click();
        const site = options.getByRole("textbox", {
          name: en["settings.sites.addInput"],
        });
        await site.fill("not a site");
        await site.press("Enter");
        await expect(
          options.getByText(en["settings.sites.invalid"]),
        ).toBeVisible();
        await site.fill("example.com");
        await site.press("Enter");
        await options
          .getByRole("button", { name: "Remove example.com", exact: true })
          .click();
        await expect(
          options.getByRole("button", { name: "Remove example.com" }),
        ).toHaveCount(0);
        const history = options.getByRole("region", {
          name: en["settings.section.history"],
        });
        await history
          .getByRole("button", { name: en["settings.history.clearButton"] })
          .click();
        await expect(
          history.getByText(en["settings.history.empty"]),
        ).toBeVisible();

        // Backup: export, import it back, and a file that is not a backup.
        await saveWord(context, extensionId, "knead", "learning");
        await saveWord(context, extensionId, "tedious", "learning");
        await saveWord(context, extensionId, "honestly", "known");
        await saveWord(context, extensionId, "rise and fall", "learning");
        const backup = options.getByRole("region", { name: "Sync and backup" });
        const downloading = options.waitForEvent("download");
        await backup.getByRole("button", { name: en["backup.export"] }).click();
        const file = await (await downloading).path();
        await options.getByLabel(en["backup.file"]).setInputFiles(file);
        await expect(options.getByText(/^Imported \d+ words?$/)).toBeVisible();
        const bad = testInfo.outputPath("not-a-backup.json");
        fs.mkdirSync(path.dirname(bad), { recursive: true });
        fs.writeFileSync(bad, "{ not json");
        await options.getByLabel(en["backup.file"]).setInputFiles(bad);
        await expect(options.getByText(/^Could not import/)).toBeVisible();

        // The word list: filters, search, sort, details, status, removal, backup.
        const list = await context.newPage();
        await list.goto(`chrome-extension://${extensionId}/wordlist.html`);
        const rows = list
          .getByRole("region", { name: en["wordlist.list"] })
          .getByRole("button");
        await expect(rows).toHaveCount(4);
        const status = list.getByRole("group", {
          name: en["wordlist.status"],
          exact: true,
        });
        for (const name of ["Learning", "Known", "All"])
          await status.getByRole("button", { name, exact: true }).click();
        const kind = list.getByRole("group", {
          name: en["wordlist.kind"],
          exact: true,
        });
        for (const name of ["Phrases", "Words", "All"])
          await kind.getByRole("button", { name, exact: true }).click();
        const search = list.getByRole("searchbox", {
          name: en["wordlist.search"],
        });
        await search.fill("zzz");
        await expect(list.getByText(en["wordlist.noMatch"])).toBeVisible();
        await search.fill("");
        const sort = list.getByRole("combobox", { name: en["wordlist.sort"] });
        for (const label of [
          en["wordlist.sort.az"],
          en["wordlist.sort.seen"],
          en["wordlist.sort.recent"],
        ])
          await sort.selectOption({ label });
        await rows.filter({ hasText: "knead" }).click();
        const details = list.getByRole("complementary", {
          name: en["wordlist.details"],
        });
        await expect(details.getByRole("heading", { level: 2 })).toHaveText(
          "knead",
        );
        const group = details.getByRole("group", {
          name: en["dict.statusGroup"],
        });
        await group.getByRole("button", { name: "Known" }).click();
        await group.getByRole("button", { name: "Remove" }).click();
        await expect(rows).toHaveCount(3);
        const listDownload = list.waitForEvent("download");
        await list.getByRole("button", { name: en["backup.export"] }).click();
        await listDownload;
        await list.getByLabel(en["backup.file"]).setInputFiles(file);
        await expect(list.getByText(/^Imported \d+ words?$/)).toBeVisible();
      });

    if (checkBuildOnly)
      test("a service worker stopped mid-session starts again without errors", async ({
        context,
        extensionId,
      }) => {
        await showNewWords(context, extensionId);
        await routeYouTube(context);
        const article = await openArticle(context);
        const video = await context.newPage();
        await video.goto(YOUTUBE_WATCH);
        await videoCard(video, YT_LINE).click({ position: ON_TIME });
        await expect(inVideo(video)).toContainText(YT_LINE);
        const options = await context.newPage();
        await options.goto(`chrome-extension://${extensionId}/options.html`);
        await expect(options.getByRole("switch").first()).toBeVisible();

        const cdp = await context.newCDPSession(article);
        await cdp.send("ServiceWorker.enable");
        const stop = () => cdp.send("ServiceWorker.stopAllWorkers");

        await stop();
        await useArticle(article);
        await stop();
        await usePopup(context, extensionId, article, { toggleSite: true });
        await stop();
        const word = inVideo(video).getByText("creativity", { exact: true });
        await word.hover();
        await expect(video.getByText(en["hover.hint"])).toBeVisible();
        await word.click();
        await expect(
          video.getByRole("complementary", { name: en["dict.window"] }),
        ).toBeVisible();
        await stop();
        await options
          .getByRole("switch", { name: "Highlight Known words" })
          .click();
        await expect
          .poll(() => article.evaluate(() => CSS.highlights.has("lingo-known")))
          .toBe(true);
        await stop();
        await article.reload();
        await expect
          .poll(async () => (await highlighted(article, "lingo-new")).length)
          .toBeGreaterThan(0);
      });

    if (checkBuildOnly)
      test("sync with its space nearly full", async ({
        context,
        extensionId,
      }) => {
        // Fill storage.sync with other keys up to a few hundred bytes below the quota.
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/popup.html`);
        await page.evaluate(async () => {
          const { chrome: api } = globalThis as unknown as {
            chrome: {
              storage: {
                sync: {
                  QUOTA_BYTES: number;
                  QUOTA_BYTES_PER_ITEM: number;
                  set(items: object): Promise<void>;
                  getBytesInUse(keys: null): Promise<number>;
                };
              };
            };
          };
          const sync = api.storage.sync;
          const item = sync.QUOTA_BYTES_PER_ITEM - 100;
          for (let i = 0; ; i++) {
            const left = sync.QUOTA_BYTES - (await sync.getBytesInUse(null));
            if (left < 1500) break;
            const size = Math.min(item, left - 1200);
            await sync.set({ [`fill${i}`]: "x".repeat(size) });
          }
        });
        await page.close();

        await showNewWords(context, extensionId);
        const article = await openArticle(context);
        await useArticle(article);
        for (const key of ["knead", "tedious", "honestly", "loaf", "yeast"])
          await saveWord(context, extensionId, key, "learning");
        // The popup shows how full the space is, and saving keeps working.
        await usePopup(context, extensionId, article, { toggleSite: true });
        const options = await context.newPage();
        await options.goto(`chrome-extension://${extensionId}/options.html`);
        await expect(options.getByText(/KB of \d+ KB/)).toBeVisible();
        await expect
          .poll(async () => {
            const reply = (await sendToBackground(context, extensionId, {
              type: "syncStatus",
            })) as { value: { lastSavedAt?: number; error?: string } };
            return reply.value.lastSavedAt !== undefined || !!reply.value.error;
          })
          .toBe(true);
      });

    // Real sites need the network and change under us: opt in with LINGO_REAL_SITES=1
    // (`npm run test:e2e:real`). They run on the production build, the one users get.
    if (!reachesUi)
      test.describe("real sites (network)", () => {
        test.skip(!process.env.LINGO_REAL_SITES, "set LINGO_REAL_SITES=1");
        test.setTimeout(120_000);

        for (const url of [
          "https://en.wikipedia.org/wiki/Bread",
          "https://www.bbc.com/news",
          "https://www.youtube.com/watch?v=iG9CE55wbtY",
        ])
          test(`no reports on ${url}`, async ({ context, extensionId }) => {
            await showNewWords(context, extensionId);
            const page = await context.newPage();
            // Some sites never finish loading (ads, long polls) in headless Chromium.
            await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 60_000,
            });
            const host = new URL(url).hostname;
            if (url.includes("wikipedia")) {
              await expect(page.locator("lingo-article")).toHaveCount(1);
              await expect
                .poll(async () => (await highlighted(page, "lingo-new")).length)
                .toBeGreaterThan(0);
              await page.mouse.wheel(0, 20_000);
              await usePopup(context, extensionId, page, {
                toggleSite: true,
                answeredBy: host,
              });
            }
            if (url.includes("youtube")) {
              // Captions come back empty under Playwright: Lingo waits quietly.
              await expect(page.locator("lingo-video-player")).toBeAttached({
                timeout: 30_000,
              });
            }
            await usePopup(context, extensionId, page, {
              toggleSite: false,
              answeredBy: host,
            });
          });
      });
  });
