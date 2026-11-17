import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";
import { highlighted } from "./page";

test("Settings has no on-device AI rows where no model can run", async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const section = options.getByRole("region", {
    name: en["settings.section.dictionaries"],
  });
  await expect(section.getByRole("checkbox").first()).toBeVisible();
  // Playwright's Chromium has no on-device model.
  await options.waitForTimeout(300);
  await expect(section.getByText(en["settings.ai.title"])).toHaveCount(0);
  await expect(
    section.getByRole("switch", { name: en["settings.ai.unknown.title"] }),
  ).toHaveCount(0);
});

test("a settings change reaches an open article page at once", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect(page.locator("langle-article")).toHaveCount(1);
  expect(await highlighted(page, "langle-new")).toEqual([]);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const newSwitch = options.getByRole("switch", {
    name: "Highlight New words",
  });
  await expect(newSwitch).not.toBeChecked();
  await newSwitch.click();
  await expect(newSwitch).toBeChecked();
  await expect
    .poll(async () => (await highlighted(page, "langle-new")).length)
    .toBeGreaterThan(0);
});
