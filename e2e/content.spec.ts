import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";
import { highlighted, openArticle, pointOn, showNewWords } from "./page";

test("a word saved from the dictionary is Learning, and in every form after a reload", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const loaf = await pointOn(page, "loaf");
  await page.mouse.click(loaf.x, loaf.y);
  const panel = page.getByRole("complementary", { name: en["dict.title"] });
  await expect(panel.getByRole("heading", { name: "loaf" })).toBeVisible();
  await panel
    .getByRole("button", { name: en["status.learning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toContain("loaf");

  await page.reload();
  await expect
    .poll(async () => (await highlighted(page, "lingo-learning")).sort())
    .toEqual(["loaf", "loaves"]);
  expect(await highlighted(page, "lingo-new")).not.toContain("loaves");
});

test("a name the page always capitalises is no word: not highlighted", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  // "Maya" is a vocabulary word (EJDict's マヤ人), capitalised inside a sentence.
  await expect
    .poll(() => highlighted(page, "lingo-new"))
    .toContain("sourdough");
  expect(await highlighted(page, "lingo-new")).not.toContain("Maya");
});
