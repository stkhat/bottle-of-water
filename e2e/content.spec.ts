import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect, sendToBackground } from "./fixtures";
import {
  COLD_LOAD,
  highlighted,
  openArticle,
  pointOn,
  showNewWords,
} from "./page";

test("a word saved from the dictionary is Learning, and in every form after a reload", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const loaf = await pointOn(page, "loaf");
  await page.mouse.click(loaf.x, loaf.y);
  const panel = page.getByRole("complementary", { name: en["dict.title"] });
  // The first lookup waits for the dictionary.
  await expect(panel.getByRole("heading", { name: "loaf" })).toBeVisible(
    COLD_LOAD,
  );
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

test("choosing a meaning in the dictionary saves the word as Learning, and the export holds it", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const loaf = await pointOn(page, "loaf");
  await page.mouse.click(loaf.x, loaf.y);
  const panel = page.getByRole("complementary", { name: en["dict.title"] });
  await expect(panel.getByRole("heading", { name: "loaf" })).toBeVisible(
    COLD_LOAD,
  );
  const use = panel.getByRole("button", { name: /^Use here: / }).first();
  const meaning = (await use.getAttribute("aria-label"))!.slice(
    "Use here: ".length,
  );
  await use.click();
  await expect(
    panel.getByRole("button", { name: `Used here: ${meaning}` }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("button", { name: en["status.learning"], exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toContain("loaf");

  const reply = (await sendToBackground(context, extensionId, {
    type: "exportJson",
  })) as { ok: true; value: string };
  const data = JSON.parse(reply.value) as {
    version: number;
    meanings: { termId: string; text: string }[];
    meaningChoices: { termId: string; meaningKey: string | null }[];
  };
  expect(data.version).toBe(2);
  expect(data.meanings).toEqual([
    expect.objectContaining({ termId: "en:loaf", text: meaning }),
  ]);
  expect(data.meaningChoices).toEqual([
    expect.objectContaining({ termId: "en:loaf" }),
  ]);
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
