import en from "../src/i18n/locales/en.json" with { type: "json" };
import type { BrowserContext, Page } from "@playwright/test";
import {
  ENGLISH_PAGE,
  test,
  expect,
  openPopupFor,
  sendToBackground,
} from "./fixtures";

test("popup header shows the app and language pair", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByText(en["app.name"], { exact: true })).toBeVisible();
  await expect(page.getByText("English → Japanese")).toBeVisible();
});

test("the gear button opens the options page", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: en["popup.openSettings"] }).click();
  const options = await opened;
  await options.waitForLoadState();
  expect(options.url()).toMatch(/\/options\.html$/);
  // The "Settings" title is a plain span inside the labelled nav, not a heading.
  const nav = options.getByRole("navigation", {
    name: en["settings.navLabel"],
  });
  await expect(
    nav.getByText(en["settings.title"], { exact: true }),
  ).toBeVisible();
});

/** The text of every range registered under a highlight name ([] when it is not registered). */
function highlighted(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

/** The article fixture with New highlighted, once its first analysis is done. */
async function openArticle(context: BrowserContext, extensionId: string) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  return page;
}

test("the popup shows the page's unsaved words, adds them all and undoes it", async ({
  context,
  extensionId,
}) => {
  const page = await openArticle(context, extensionId);
  const fresh = await highlighted(page, "lingo-new");
  const newWords = fresh.length;
  // Detected phrases are saved too, and counted as Phrases rather than Learning.
  const phrases = new Set(
    fresh.filter((text) => text.includes(" ")).map((t) => t.toLowerCase()),
  ).size;
  expect(phrases).toBeGreaterThan(0);
  const popup = await openPopupFor(context, extensionId, page);

  await expect(popup.getByText("localhost", { exact: true })).toBeVisible();
  await expect(popup.getByText(en["saveAll.scope.page"])).toBeVisible();
  const line = await popup.getByText(/^\d+ words not saved yet$/).textContent();
  const unsaved = Number(/\d+/.exec(line!)![0]);
  expect(unsaved).toBeGreaterThan(5);
  await expect(popup.getByText(String(unsaved), { exact: true })).toHaveCount(
    0,
  );

  await popup.getByRole("button", { name: en["saveAll.addLearning"] }).click();
  await expect(
    popup.getByText(`${unsaved} words added to Learning`),
  ).toBeVisible();
  // The counts come from the background.
  await expect(
    popup.getByText(String(unsaved - phrases), { exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByText(String(phrases), { exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => highlighted(page, "lingo-new")).toEqual([]);
  expect((await highlighted(page, "lingo-learning")).length).toBe(newWords);

  await popup.getByRole("button", { name: en["saveAll.undo"] }).click();
  await expect(popup.getByText(`${unsaved} words not saved yet`)).toBeVisible();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(newWords);
  expect(await highlighted(page, "lingo-learning")).toEqual([]);
});

test("switching On this site off removes Lingo from the page, and on brings it back", async ({
  context,
  extensionId,
}) => {
  const page = await openArticle(context, extensionId);
  await expect(page.getByText(ENGLISH_PAGE)).toBeVisible();
  const popup = await openPopupFor(context, extensionId, page);
  const site = popup.getByRole("switch", { name: en["popup.siteSwitch"] });
  await expect(site).toBeChecked();
  // The switch does nothing until the settings are loaded (the language pair shows).
  await expect(popup.getByText(/^\S+ → \S+$/)).toBeVisible();

  await site.click();
  await expect(site).not.toBeChecked();
  await expect(page.getByText(ENGLISH_PAGE)).toHaveCount(0);
  await expect(page.locator("lingo-article")).toHaveCount(0);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  await expect(popup.getByText(en["saveAll.scope.page"])).toHaveCount(0);

  await site.click();
  await expect(site).toBeChecked();
  await expect(page.getByText(ENGLISH_PAGE)).toBeVisible();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  await expect(popup.getByText(en["saveAll.scope.page"])).toBeVisible();
});
