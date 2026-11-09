import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";

test("popup header shows the app and language pair", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByText(en["app.name"], { exact: true })).toBeVisible();
  await expect(page.getByText(en["app.languagePair"])).toBeVisible();
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
