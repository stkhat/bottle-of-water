import type { Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect, sendToBackground } from "./fixtures";

/** The text of every range registered under a highlight name; undefined when it is not registered. */
function highlighted(page: Page, name: string) {
  return page.evaluate((name) => {
    const highlight = CSS.highlights.get(name);
    return highlight && [...highlight].map((r) => (r as Range).toString());
  }, name);
}

/** Waits until the content script has had its chance to run on the page. */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestIdleCallback(() => setTimeout(resolve, 0), { timeout: 2000 }),
      ),
  );
}

test("Lingo runs on an English page, with no card on it", async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  await settle(page);
  await expect(
    page.getByRole("button", { name: en["card.chip.learning"] }),
  ).toHaveCount(0);
});

test("Lingo does not run on a Japanese page", async ({ context }) => {
  // Prove the extension is live first: the content script runs on the English page.
  const live = await context.newPage();
  await live.goto("/article-en.html");
  await expect(live.locator("lingo-article")).toHaveCount(1);

  // The card is mounted asynchronously after the content script runs at document_idle,
  // so a plain count check right after goto could pass before the script even ran.
  // We wait for load, then wait inside the page for a macrotask after idle, and only
  // then assert. The live page above shows the script injects reliably in this context.
  const page = await context.newPage();
  await page.goto("/article-ja.html");
  await settle(page);
  await expect(page.locator("lingo-article")).toHaveCount(0);
});

test("a Spanish page gets no highlights while the learning language is English", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  // Prove the extension is live first: the English page is highlighted.
  const live = await context.newPage();
  await live.goto("/article-en.html");
  await expect
    .poll(async () => (await highlighted(live, "lingo-new"))?.length ?? 0)
    .toBeGreaterThan(0);

  const page = await context.newPage();
  await page.goto("/article-es.html");
  await settle(page);
  await expect(page.locator("lingo-article")).toHaveCount(0);
  expect(await highlighted(page, "lingo-new")).toBeUndefined();
});

test("with New switched on, new words are highlighted", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect
    .poll(() => highlighted(page, "lingo-new"))
    .toEqual(expect.arrayContaining(["knead", "ferments", "yeast", "tangy"]));
  const words = (await highlighted(page, "lingo-new"))!;
  // Words within the known level are not new.
  expect(words).not.toContain("the");
  expect(words).not.toContain("bread");
  // Learning is on but nothing is saved; Known is off.
  expect(await highlighted(page, "lingo-learning")).toEqual([]);
  expect(await highlighted(page, "lingo-known")).toBeUndefined();
});

test("a saved word gets the Learning highlight", async ({
  context,
  extensionId,
}) => {
  const reply = await sendToBackground(context, extensionId, {
    type: "saveTerm",
    lang: "en",
    key: "loaf",
    display: "loaves",
    kind: "word",
    status: "learning",
    source: {
      platform: "web",
      url: "http://localhost:4719/article-en.html",
      title: "Why patient bakers end up with better bread",
      lang: "en",
    },
    sentence:
      "But the bakers who get the most flavor out of their loaves tend to do the opposite.",
    pos: { textQuote: "loaves" },
  });
  expect(reply).toMatchObject({ ok: true });

  const page = await context.newPage();
  await page.goto("/article-en.html");
  // Every form of the saved word: "loaves" and "loaf".
  await expect
    .poll(async () => (await highlighted(page, "lingo-learning"))?.sort())
    .toEqual(["loaf", "loaves"]);
  expect(await highlighted(page, "lingo-new")).toBeUndefined();
});

test("nothing runs on a host in neverRunOn", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { neverRunOn: ["127.0.0.1"], highlight: { new: true } },
  });
  // The same page on another host still runs.
  const live = await context.newPage();
  await live.goto("/article-en.html");
  await expect
    .poll(async () => (await highlighted(live, "lingo-new"))?.length ?? 0)
    .toBeGreaterThan(0);

  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4719/article-en.html");
  await settle(page);
  await expect(page.locator("lingo-article")).toHaveCount(0);
  expect(await highlighted(page, "lingo-new")).toBeUndefined();
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
});
