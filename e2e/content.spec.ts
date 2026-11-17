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
    .poll(() => highlighted(page, "langle-learning"))
    .toContain("loaf");

  await page.reload();
  await expect
    .poll(async () => (await highlighted(page, "langle-learning")).sort())
    .toEqual(["loaf", "loaves"]);
  expect(await highlighted(page, "langle-new")).not.toContain("loaves");
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
  // Playwright's Chromium has no on-device model: no "In this sentence".
  await expect(panel.getByText(en["dict.meanings"])).toBeVisible();
  await expect(
    panel.getByRole("region", { name: en["dict.inSentence"] }),
  ).toHaveCount(0);
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
    .poll(() => highlighted(page, "langle-learning"))
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

  // The word list shows the meaning in its Meaning column and groups the places by it.
  const list = await context.newPage();
  await list.goto(`chrome-extension://${extensionId}/wordlist.html`);
  const row = list
    .getByRole("region", { name: en["wordlist.list"] })
    .getByRole("button", { name: /^loaf/ });
  await expect(
    row.getByRole("img", { name: en["wordlist.yourMeanings"] }),
  ).toBeVisible();
  const details = list.getByRole("complementary", {
    name: en["wordlist.details"],
  });
  const heading = details.locator("[data-seen-group] > div").first();
  await expect(
    heading.getByRole("img", { name: en["dict.yourMeaning"] }),
  ).toBeVisible();
  await expect(heading).toContainText("· 1");
  // The column and the group show the same line.
  const line = (await heading.locator("[lang]").textContent())!;
  expect(line).not.toBe("");
  await expect(row).toContainText(line);
  // The page's other sentence with "loaves", recorded since: no meaning chosen, last.
  await expect(details.locator("[data-seen-group] > div").last()).toContainText(
    en["wordlist.noMeaning"],
  );
});

test("a name the page always capitalises is no word: not highlighted", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  // "Maya" is a vocabulary word (EJDict's マヤ人), capitalised inside a sentence.
  await expect
    .poll(() => highlighted(page, "langle-new"))
    .toContain("sourdough");
  expect(await highlighted(page, "langle-new")).not.toContain("Maya");
});
