import en from "../src/i18n/locales/en.json" with { type: "json" };
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { COLD_LOAD, pointOn, showNewWords } from "./page";
import { routeYouTube, YOUTUBE_WATCH } from "./sites";

// The real host from createShadowRootUi with cssInjectionMode "manual".
test("page styles do not reach the hover card, and Lingo adds no CSS to the page", async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto("/hostile.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  const word = await pointOn(page, "everything", "body");
  // The first hover waits for the packs and the dictionary.
  await expect
    .poll(async () => {
      await page.mouse.move(word.x + 1, word.y);
      await page.mouse.move(word.x, word.y);
      return page
        .getByRole("button", { name: en["hover.details"] })
        .isVisible();
    }, COLD_LOAD)
    .toBe(true);
  const head = page
    .locator("lingo-article")
    .getByText("everything", { exact: true });
  await expect(head).toHaveCSS("color", "rgb(20, 24, 43)");
  await expect(head).toHaveCSS("font-size", "17px");

  await expect(page.locator("#page-text")).toHaveCSS("color", "rgb(255, 0, 0)");
  // hostile.html ships exactly one inline <style> of its own.
  expect(
    await page.evaluate(
      () =>
        document.head.querySelectorAll("style, link[rel=stylesheet]").length,
    ),
  ).toBe(1);
  // The only styles added are the highlight rules, adopted, each for a Lingo highlight.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.adoptedStyleSheets.flatMap((sheet) =>
          [...sheet.cssRules].map(
            (rule) => (rule as CSSStyleRule).selectorText,
          ),
        ),
      ),
    )
    .toEqual([
      "::highlight(lingo-new)",
      "::highlight(lingo-learning)",
      "::highlight(lingo-known)",
    ]);
});

test.describe("the production build", () => {
  test.use({ build: "production" });

  /** What a page script can see of each Lingo host on `page`. */
  const reach = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((el) => el.localName.startsWith("lingo-"))
        .map((el) => ({
          host: el.localName,
          shadowRoot: el.shadowRoot === null ? null : "open",
        })),
    );

  // Closed shadow roots (src/content/shadow-host.ts): a page script finds Lingo's
  // hosts but cannot reach the UI inside them, which still works.
  test("a page script cannot reach the article UI or the video UI", async ({
    context,
    extensionId,
  }) => {
    await showNewWords(context, extensionId);
    const page = await context.newPage();
    await page.goto("/article-en.html");
    await expect(page.locator("lingo-article")).toHaveCount(1);
    // Clicking a word opens the dictionary at the top right, inside the host.
    const word = await pointOn(page, "tangy");
    const width = page.viewportSize()!.width;
    await expect
      .poll(async () => {
        await page.mouse.click(word.x, word.y);
        return page.evaluate(
          (x) => document.elementFromPoint(x, 40)?.localName,
          width - 100,
        );
      }, COLD_LOAD)
      .toBe("lingo-article");
    expect(await reach(page)).toEqual([
      { host: "lingo-article", shadowRoot: null },
    ]);
    await expect(page.getByText(en["app.name"], { exact: true })).toHaveCount(
      0,
    );

    await routeYouTube(context);
    const video = await context.newPage();
    await video.goto(YOUTUBE_WATCH);
    await expect(video.locator("lingo-video-player")).toHaveCount(1);
    await expect(video.locator("lingo-player-buttons")).toHaveCount(1);
    const hosts = await reach(video);
    expect(hosts.length).toBeGreaterThanOrEqual(2);
    expect(hosts.filter((h) => h.shadowRoot !== null)).toEqual([]);
    await expect(
      video.getByRole("button", { name: en["video.toggle"] }),
    ).toHaveCount(0);
  });
});
