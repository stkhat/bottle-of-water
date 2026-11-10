import fs from "node:fs";
import type { Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import {
  test,
  expect,
  extensionIdOf,
  launchWithExtension,
  sendToBackground,
} from "./fixtures";

/** The text of every range registered under a highlight name ([] when it is not registered). */
function highlighted(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

const newCount = async (page: Page) =>
  (await highlighted(page, "lingo-new")).length;

test("settings changes reach an open article page at once", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect(page.getByText(en["card.pageStatus"])).toBeVisible();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(0);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const newSwitch = options.getByRole("switch", {
    name: "Highlight New words",
  });
  await expect(newSwitch).not.toBeChecked();
  await newSwitch.click();
  await expect(newSwitch).toBeChecked();
  await expect.poll(() => newCount(page)).toBeGreaterThan(0);
  const atDefault = await newCount(page);

  // A higher level treats more words as known: fewer are new.
  await options
    .getByRole("slider", { name: /most common English words as known/ })
    .fill("20000");
  await expect(
    options.getByText("Treat the 20,000 most common English words as known"),
  ).toBeVisible();
  await expect.poll(() => newCount(page)).toBeLessThan(atDefault);

  // Switched off for articles: the page gives Lingo up.
  await options
    .getByRole("switch", { name: "Run Lingo on Articles on other sites" })
    .click();
  await expect(page.getByText(en["card.pageStatus"])).toHaveCount(0);
  expect(await newCount(page)).toBe(0);
});

test("a backup exported in one browser imports into another", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "saveTerm",
    lang: "en",
    key: "tangy",
    display: "tangy",
    kind: "word",
    status: "learning",
    source: {
      platform: "web",
      url: "http://localhost:4719/article-en.html",
      title: "Bread",
      lang: "en",
    },
    sentence: "The yeast gives a slightly tangy taste.",
    pos: { textQuote: "slightly tangy taste" },
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const backup = options.getByRole("region", { name: "Sync and backup" });
  await expect(backup.getByText(/Never exported\./)).toBeVisible();
  const downloading = options.waitForEvent("download");
  await backup.getByRole("button", { name: "Export" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^lingo-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const file = await download.path();
  const exported = JSON.parse(fs.readFileSync(file, "utf8")) as {
    terms: { key: string }[];
  };
  expect(exported.terms.map((term) => term.key)).toEqual(["tangy"]);
  await expect(backup.getByText(/Last export: just now\./)).toBeVisible();

  const other = await launchWithExtension();
  try {
    const otherId = await extensionIdOf(other);
    const page = await other.newPage();
    await page.goto(`chrome-extension://${otherId}/options.html`);
    await page.getByLabel("Backup file to import").setInputFiles(file);
    await expect(page.getByText("Imported 1 word")).toBeVisible();
    expect(
      await sendToBackground(other, otherId, { type: "counts", lang: "en" }),
    ).toEqual({ ok: true, value: { learning: 1, known: 0, phrases: 0 } });
  } finally {
    await other.close();
  }
});
