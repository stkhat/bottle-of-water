import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test as base, type Page } from "@playwright/test";
import {
  expect,
  extensionIdOf,
  launchWithExtension,
  sendToBackground,
  test,
} from "./fixtures";
import { routeYouTube, YOUTUBE_WATCH } from "./sites";

/** A point on `word` in the page's own text (scrolled into view). */
function wordPoint(page: Page, word: string) {
  return page.evaluate((word) => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf(word);
      if (i < 0) continue;
      node.parentElement!.scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + word.length);
      const r = range.getBoundingClientRect();
      return { x: r.left + 3, y: r.top + r.height / 2 };
    }
    throw new Error(`"${word}" not found`);
  }, word);
}

test("page styles do not leak into the hover card", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/hostile.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  const word = await wordPoint(page, "everything");
  await expect
    .poll(async () => {
      await page.mouse.move(word.x + 1, word.y);
      await page.mouse.move(word.x, word.y);
      return page
        .getByRole("button", { name: en["hover.details"] })
        .isVisible();
    })
    .toBe(true);
  const head = page
    .locator("lingo-article")
    .getByText("everything", { exact: true });
  await expect(head).toHaveCSS("color", "rgb(20, 24, 43)");
  await expect(head).toHaveCSS("font-size", "17px");
});

test("the extension does not leak CSS into the page", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/hostile.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  await expect(page.locator("#page-text")).toHaveCSS("color", "rgb(255, 0, 0)");
  const injected = await page.evaluate(
    () => document.head.querySelectorAll("style, link[rel=stylesheet]").length,
  );
  // hostile.html ships exactly one inline <style> of its own.
  expect(injected).toBe(1);
  // The only styles added to the page are the highlight rules, adopted rather than
  // inserted, and each one targets a Lingo highlight only.
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

test("a page script's clicks do not reach the article UI; the user's do", async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  const word = await wordPoint(page, "tangy");
  const panel = page.getByRole("complementary", { name: en["dict.title"] });
  await expect
    .poll(async () => {
      await page.mouse.click(word.x, word.y);
      return panel.isVisible();
    })
    .toBe(true);
  const status = (name: string) =>
    panel.getByRole("button", { name, exact: true });
  const learning = status(en["dict.status.learning"]);
  const known = status(en["dict.status.known"]);
  await expect(learning).toHaveAttribute("aria-pressed", "false");
  // The check build's root is open: the page script reaches the button and clicks it.
  await learning.evaluate((button: HTMLElement) => button.click());
  // The user's click on another button goes through, after anything the script did.
  await known.click();
  await expect(known).toHaveAttribute("aria-pressed", "true");
  await expect(learning).toHaveAttribute("aria-pressed", "false");
  await learning.click();
  await expect(learning).toHaveAttribute("aria-pressed", "true");
});

test.describe("the production build", () => {
  // Its shadow roots are closed (src/content/ui/shadow-mode.ts): a page script finds
  // Lingo's hosts but cannot reach the UI inside them, which still works.
  const production = base.extend<{ extensionId: string }>({
    // eslint-disable-next-line no-empty-pattern
    context: async ({}, use) => {
      const context = await launchWithExtension([], "production");
      await use(context);
      await context.close();
    },
    extensionId: async ({ context }, use) => {
      await use(await extensionIdOf(context));
    },
  });

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

  production(
    "a page script cannot reach the article UI",
    async ({ context, extensionId }) => {
      await sendToBackground(context, extensionId, {
        type: "setSettings",
        patch: { highlight: { new: true } },
      });
      const page = await context.newPage();
      await page.goto("/article-en.html");
      await expect(page.locator("lingo-article")).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(() => CSS.highlights.get("lingo-new")?.size ?? 0),
        )
        .toBeGreaterThan(0);
      // Clicking a word opens the dictionary at the top right, inside the host.
      const word = await wordPoint(page, "tangy");
      const width = page.viewportSize()!.width;
      await expect
        .poll(async () => {
          await page.mouse.click(word.x, word.y);
          return page.evaluate(
            (x) => document.elementFromPoint(x, 40)?.localName,
            width - 100,
          );
        })
        .toBe("lingo-article");
      expect(await reach(page)).toEqual([
        { host: "lingo-article", shadowRoot: null },
      ]);
      await expect(page.getByText(en["app.name"], { exact: true })).toHaveCount(
        0,
      );
    },
  );

  production("a page script cannot reach the video UI", async ({ context }) => {
    await routeYouTube(context);
    const page = await context.newPage();
    await page.goto(YOUTUBE_WATCH);
    await expect(page.locator("lingo-video-player")).toHaveCount(1);
    await expect(page.locator("lingo-player-buttons")).toHaveCount(1);
    const hosts = await reach(page);
    expect(hosts.length).toBeGreaterThanOrEqual(2);
    expect(hosts.filter((h) => h.shadowRoot !== null)).toEqual([]);
    await expect(
      page.getByRole("button", { name: en["video.toggle"] }),
    ).toHaveCount(0);
  });
});
