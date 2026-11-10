import en from "../src/i18n/locales/en.json" with { type: "json" };
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, openPopupFor, sendToBackground } from "./fixtures";

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

test("the popup shows the page's host, without a save-all section", async ({
  context,
  extensionId,
}) => {
  const page = await openArticle(context, extensionId);
  const popup = await openPopupFor(context, extensionId, page);
  await expect(popup.getByText("localhost", { exact: true })).toBeVisible();
  await expect(popup.getByText("This page")).toHaveCount(0);
  await expect(
    popup.getByRole("button", { name: "Add all to Learning" }),
  ).toHaveCount(0);
});

test("switching On this site off removes Lingo from the page, and on brings it back", async ({
  context,
  extensionId,
}) => {
  const page = await openArticle(context, extensionId);
  await expect(page.locator("lingo-article")).toHaveCount(1);
  const popup = await openPopupFor(context, extensionId, page);
  const site = popup.getByRole("switch", { name: en["popup.siteSwitch"] });
  await expect(site).toBeChecked();
  // The switch does nothing until the settings are loaded (the language pair shows).
  await expect(popup.getByText(/^\S+ → \S+$/)).toBeVisible();

  await site.click();
  await expect(site).not.toBeChecked();
  await expect(page.locator("lingo-article")).toHaveCount(0);
  expect(await highlighted(page, "lingo-new")).toEqual([]);

  await site.click();
  await expect(site).toBeChecked();
  await expect(page.locator("lingo-article")).toHaveCount(1);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
});
