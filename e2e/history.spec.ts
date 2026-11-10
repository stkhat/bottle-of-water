import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect, sendToBackground } from "./fixtures";

/** Page A: the word "tedious" in one sentence. */
const A = {
  path: "/article2-en.html",
  title: "A quick tomato sauce for busy evenings",
  sentence:
    "Stirring it for an hour can feel tedious, but the flavor is worth the wait.",
};
/** Page B: the same word, never saved. */
const B = { path: "/article-en.html", title: /patient bakers/ };

/** The text of every range registered under a highlight name ([] when it is not registered). */
function highlighted(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

/** Scrolls `text` (inside the article) into view and clicks its first letter. */
async function click(page: Page, text: string) {
  const point = await page.evaluate((text) => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf(text);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + text.length);
      node.parentElement!.scrollIntoView({ block: "center" });
      const r = range.getBoundingClientRect();
      return { x: r.left + 3, y: r.top + r.height / 2 };
    }
    throw new Error(`"${text}" not found`);
  }, text);
  await page.mouse.click(point.x, point.y);
}

/** Opens a page and waits for its first analysis (New must be highlighted). */
async function openArticle(context: BrowserContext, path: string) {
  const page = await context.newPage();
  await page.goto(path);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  return page;
}

/** How many pages the sentence history keeps. */
async function pagesKept(context: BrowserContext, extensionId: string) {
  const reply = (await sendToBackground(context, extensionId, {
    type: "historyStatus",
  })) as { value: { pages: number } };
  return reply.value.pages;
}

test("an unsaved word shows where it was seen, keeps it when saved, and the history clears", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });

  // Page A is read first: its sentences are kept.
  const a = await openArticle(context, A.path);
  await expect.poll(() => pagesKept(context, extensionId)).toBe(1);
  await a.close();

  // On page B the unsaved word shows the sentence from A.
  const b = await openArticle(context, B.path);
  await click(b, "tedious");
  const panel = b.getByRole("complementary", { name: en["dict.title"] });
  await expect(panel.getByRole("heading", { name: "tedious" })).toBeVisible();
  await expect(panel.getByText("Seen elsewhere · 1")).toBeVisible();
  await expect(panel.getByText(A.title)).toBeVisible();
  await expect(panel.getByText(A.sentence)).toBeVisible();

  // Saved on B, the word keeps A's sentence in its history too.
  await panel
    .getByRole("button", { name: en["dict.status.learning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(b, "lingo-learning"))
    .toEqual(["tedious"]);
  await b.close();

  const list = await context.newPage();
  await list.goto(`chrome-extension://${extensionId}/wordlist.html`);
  await list
    .getByRole("region", { name: en["wordlist.list"] })
    .getByRole("button", { name: /^tedious/ })
    .click();
  const details = list.getByRole("complementary", {
    name: en["wordlist.details"],
  });
  await expect(
    details.getByRole("heading", { name: "Where you saw it · 2" }),
  ).toBeVisible();
  await expect(details.getByRole("link", { name: A.title })).toContainText(
    A.sentence,
  );
  await expect(details.getByRole("link", { name: B.title })).toContainText(
    en["wordlist.savedHere"],
  );
  await list.close();

  // Settings: the pages kept, Clear, and nothing kept while switched off.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const history = options.getByRole("region", {
    name: en["settings.section.history"],
  });
  const kept = history.getByText(/^[\d,]+ pages and videos/);
  await expect(kept).toBeVisible();
  expect(Number(/^[\d,]+/.exec((await kept.textContent())!)![0])).toBe(2);
  await history
    .getByRole("button", { name: en["settings.history.clearButton"] })
    .click();
  await expect(history.getByText(en["settings.history.empty"])).toBeVisible();

  const keep = history.getByRole("switch", {
    name: en["settings.history.switch"],
  });
  await keep.click();
  await expect(keep).not.toBeChecked();
  await expect
    .poll(async () => {
      const reply = (await sendToBackground(context, extensionId, {
        type: "getSettings",
      })) as { value: { sentenceHistory: boolean } };
      return reply.value.sentenceHistory;
    })
    .toBe(false);
  const again = await openArticle(context, A.path);
  await again.close();
  await options.reload();
  await expect(history.getByText(en["settings.history.empty"])).toBeVisible();
  expect(await pagesKept(context, extensionId)).toBe(0);
});
