import en from "../src/i18n/locales/en.json" with { type: "json" };
import type { BrowserContext } from "@playwright/test";
import { test, expect, openPopupFor, sendToBackground } from "./fixtures";

const VIDEO = {
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=bake1",
  title: "Baking bread from scratch at home",
  lang: "en",
};

/** Saves a word from the baking video, at `seconds` into it. */
async function saveFromVideo(
  context: BrowserContext,
  extensionId: string,
  key: string,
  status: "learning" | "known",
  sentence: string,
  seconds: number,
) {
  const reply = await sendToBackground(context, extensionId, {
    type: "saveTerm",
    lang: "en",
    key,
    display: key,
    kind: key.includes(" ") ? "phrase" : "word",
    status,
    source: VIDEO,
    sentence,
    pos: { timeMs: seconds * 1000 },
  });
  expect(reply).toMatchObject({ ok: true });
}

/** How many occurrences the background has for `key`. */
async function seen(context: BrowserContext, extensionId: string, key: string) {
  const reply = (await sendToBackground(context, extensionId, {
    type: "lookup",
    lang: "en",
    key,
    kind: "word",
  })) as { value: { elsewhere: unknown[] } };
  return reply.value.elsewhere.length;
}

test("the word list from the popup: filter, search, sort, details, status, remove", async ({
  context,
  extensionId,
}) => {
  await saveFromVideo(
    context,
    extensionId,
    "knead",
    "learning",
    "Knead the dough for ten minutes.",
    75,
  );
  await saveFromVideo(
    context,
    extensionId,
    "tedious",
    "learning",
    "It sounds tedious, but it's worth it.",
    80,
  );
  await saveFromVideo(
    context,
    extensionId,
    "honestly",
    "known",
    "Honestly, I never thought I would enjoy it.",
    312,
  );
  // The article has "knead" and "tedious": visiting it records them seen there.
  const article = await context.newPage();
  await article.goto("/article-en.html");
  await expect.poll(() => seen(context, extensionId, "knead")).toBe(2);
  await expect.poll(() => seen(context, extensionId, "tedious")).toBe(2);

  const popup = await openPopupFor(context, extensionId, article);
  const opened = context.waitForEvent("page");
  await popup.getByRole("button", { name: en["popup.wordList"] }).click();
  const page = await opened;
  await page.waitForLoadState();
  expect(page.url()).toBe(`chrome-extension://${extensionId}/wordlist.html`);

  const list = page.getByRole("region", { name: en["wordlist.list"] });
  const rows = list.getByRole("button");
  const row = (head: string) =>
    list.getByRole("button", { name: new RegExp(`^${head}`) });
  await expect(rows).toHaveCount(3);
  // Recently seen first: the article visit came last.
  await expect(rows.first()).toContainText(/knead|tedious/);
  await expect(rows.last()).toContainText("honestly");
  await expect(row("knead")).toContainText("こねる");
  await expect(row("knead")).toContainText("Learning");
  await expect(row("knead")).toContainText("Today");

  // Filters, search and sort.
  const status = page.getByRole("group", {
    name: en["wordlist.status"],
    exact: true,
  });
  await status.getByRole("button", { name: "Known" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("honestly");
  await status.getByRole("button", { name: "All" }).click();
  const search = page.getByRole("searchbox", { name: en["wordlist.search"] });
  await search.fill("KNEA");
  await expect(rows).toHaveCount(1);
  await search.fill("");
  await page
    .getByRole("combobox", { name: en["wordlist.sort"] })
    .selectOption({ label: en["wordlist.sort.az"] });
  await expect(rows.nth(0)).toContainText("honestly");
  await expect(rows.nth(1)).toContainText("knead");
  await expect(rows.nth(2)).toContainText("tedious");

  // Details: where it was seen, with links back.
  await row("knead").click();
  const details = page.getByRole("complementary", {
    name: en["wordlist.details"],
  });
  await expect(details.getByRole("heading", { level: 2 })).toHaveText("knead");
  await expect(
    details.getByRole("heading", { name: "Where you saw it · 2" }),
  ).toBeVisible();
  const toVideo = details.getByRole("link", { name: /Baking bread/ });
  await expect(toVideo).toHaveAttribute("href", `${VIDEO.url}&t=75s`);
  await expect(toVideo).toContainText("YouTube · at 1:15 · Saved here");
  const toArticle = details.getByRole("link", { name: /patient bakers/ });
  const tab = context.waitForEvent("page");
  await toArticle.click();
  const back = await tab;
  await back.waitForLoadState();
  expect(back.url()).toMatch(/\/article-en\.html$/);
  await back.close();

  // Status change, then removal.
  const group = details.getByRole("group", { name: en["dict.statusGroup"] });
  await group.getByRole("button", { name: "Known" }).click();
  await expect(row("knead")).toContainText("Known");
  await group.getByRole("button", { name: "Remove" }).click();
  await expect(row("knead")).toHaveCount(0);
  await expect(
    group.getByRole("button", { name: "Not saved" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
});
