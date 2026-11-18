import en from "../src/i18n/locales/en.json" with { type: "json" };
import { checkSettings } from "./check-settings";
import { test, expect } from "./fixtures";
import { COLD_LOAD, highlighted } from "./page";

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

test("a web page changes the check build's settings as Settings does, and restores them", async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect(page.locator("langle-article")).toHaveCount(1);

  const saved = await checkSettings(page, "get");
  if (saved === "no answer" || !("settings" in saved))
    throw new Error(`No settings: ${JSON.stringify(saved)}`);
  expect(saved.settings).toMatchObject({
    learningLang: "en",
    nativeLang: "ja",
  });

  expect(await checkSettings(page, "set", { nativeLang: "xx" })).toMatchObject({
    ok: false,
    error: expect.stringContaining("is not an offered pair"),
  });

  expect(
    await checkSettings(page, "set", {
      nativeLang: "fr",
      highlight: { new: true },
    }),
  ).toMatchObject({
    ok: true,
    settings: { nativeLang: "fr", highlight: { new: true } },
  });
  // The pair's dictionary downloads, and the page analyzes again with the new settings.
  await expect
    .poll(async () => {
      const reply = await checkSettings(page, "packs");
      return reply !== "no answer" && "ready" in reply && reply.ready
        ? reply.packs
        : [];
    }, COLD_LOAD)
    .toContain("en-fr");
  await expect
    .poll(async () => (await highlighted(page, "langle-new")).length, COLD_LOAD)
    .toBeGreaterThan(0);

  // Restoring: the saved get, set back whole.
  expect(await checkSettings(page, "set", saved.settings)).toMatchObject({
    ok: true,
    settings: saved.settings,
  });
  await expect
    .poll(async () => (await highlighted(page, "langle-new")).length)
    .toBe(0);
});
