import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect, openPopupFor } from "./fixtures";
import { highlighted, openArticle, showNewWords } from "./page";

test("the header icons open the settings and the word list", async ({
  context,
  extensionId,
}) => {
  const pages = [
    [
      en["action.openSettings"],
      "options.html",
      "navigation",
      "settings.navLabel",
    ],
    [en["wordlist.title"], "wordlist.html", "region", "wordlist.list"],
  ] as const;
  for (const [button, path, role, name] of pages) {
    // The popup closes itself once it opens a page.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const opened = context.waitForEvent("page");
    await popup.getByRole("button", { name: button }).click();
    const page = await opened;
    await page.waitForLoadState();
    expect(page.url()).toBe(`chrome-extension://${extensionId}/${path}`);
    await expect(page.getByRole(role, { name: en[name] })).toBeVisible();
  }
});

test("the page's unsaved words: Mark all, Undo, and On this site off and on", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
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

  await popup.getByRole("button", { name: en["saveAll.addLearning"] }).click();
  await expect(
    popup.getByText(`${unsaved} words marked as Learning`),
  ).toBeVisible();
  // The counts come from the background.
  await expect(
    popup.getByText(String(unsaved - phrases), { exact: true }),
  ).toBeVisible();
  await expect.poll(() => highlighted(page, "lingo-new")).toEqual([]);
  expect((await highlighted(page, "lingo-learning")).length).toBe(newWords);

  await popup.getByRole("button", { name: en["saveAll.undo"] }).click();
  await expect(popup.getByText(`${unsaved} words not saved yet`)).toBeVisible();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(newWords);
  expect(await highlighted(page, "lingo-learning")).toEqual([]);

  const site = popup.getByRole("switch", { name: en["popup.siteSwitch"] });
  await expect(site).toBeChecked();
  await site.click();
  await expect(site).not.toBeChecked();
  await expect(page.locator("lingo-article")).toHaveCount(0);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  await expect(popup.getByText(en["saveAll.scope.page"])).toHaveCount(0);

  await site.click();
  await expect(site).toBeChecked();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(newWords);
  await expect(popup.getByText(en["saveAll.scope.page"])).toBeVisible();
});
