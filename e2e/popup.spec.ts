import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect, openPopupFor } from "./fixtures";
import { COLD_LOAD, highlighted, openArticle, showNewWords } from "./page";

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
    // The word list shows once its rows are read, with meanings from the dictionary.
    await expect(page.getByRole(role, { name: en[name] })).toBeVisible(
      COLD_LOAD,
    );
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
  await expect(
    popup.getByText(en["saveAll.scope.page"], { exact: true }),
  ).toBeVisible();
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
  await expect(
    popup.getByText(en["saveAll.scope.page"], { exact: true }),
  ).toHaveCount(0);

  await site.click();
  await expect(site).toBeChecked();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(newWords);
  await expect(
    popup.getByText(en["saveAll.scope.page"], { exact: true }),
  ).toBeVisible();
});

test("Show words on this page opens the article's Words panel and closes the popup", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  const popup = await openPopupFor(context, extensionId, page);
  const closed = popup.waitForEvent("close");
  await popup.getByRole("button", { name: en["popup.showWords"] }).click();
  await closed;
  const panel = page.getByRole("complementary", {
    name: en["page.words.panel"],
  });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: en["page.words.title"] }),
  ).toBeVisible();
  await expect(panel.locator("[data-word-row]").first()).toBeVisible();
});

test("the header's switch turns Lingo off on the page, leaving only the header and sync, and back on", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  const newWords = (await highlighted(page, "lingo-new")).length;
  const popup = await openPopupFor(context, extensionId, page);
  const lingo = popup.getByRole("switch", {
    name: en["popup.lingoSwitch"],
    exact: true,
  });
  const site = popup.getByRole("switch", { name: en["popup.siteSwitch"] });
  await expect(site).toBeVisible();

  await lingo.click();
  await expect(lingo).not.toBeChecked();
  await expect(page.locator("lingo-article")).toHaveCount(0);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  await expect(site).toHaveCount(0);
  await expect(
    popup.getByText(en["saveAll.scope.page"], { exact: true }),
  ).toHaveCount(0);

  await lingo.click();
  await expect(lingo).toBeChecked();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(newWords);
  await expect(site).toBeVisible();
});
