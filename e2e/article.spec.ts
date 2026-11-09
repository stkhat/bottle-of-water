import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect, sendToBackground } from "./fixtures";

/** The text of every range registered under a highlight name ([] when it is not registered). */
function highlighted(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

/** Scrolls `text` (inside the article) to the middle of the viewport and returns its box. */
function textBox(page: Page, text: string) {
  return page.evaluate((text) => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const data = node.data.replace(/\s+/g, " ");
      const i = data.indexOf(text);
      if (i < 0) continue;
      // Map the offset back to the raw text (runs of whitespace collapsed above).
      let raw = 0;
      for (let seen = 0; seen < i; raw++) {
        if (/\s/.test(node.data[raw]!) && /\s/.test(node.data[raw + 1] ?? ""))
          continue;
        seen++;
      }
      const range = document.createRange();
      range.setStart(node, raw);
      range.setEnd(node, raw + text.length);
      node.parentElement!.scrollIntoView({ block: "center" });
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right, y: r.top + r.height / 2 };
    }
    throw new Error(`"${text}" not found`);
  }, text);
}

async function hover(page: Page, text: string) {
  const box = await textBox(page, text);
  await page.mouse.move(box.left + 3, box.y);
}

async function click(page: Page, text: string) {
  const box = await textBox(page, text);
  await page.mouse.click(box.left + 3, box.y);
}

const dictionary = (page: Page) =>
  page.getByRole("complementary", { name: en["dict.title"] });

async function showNewWords(context: BrowserContext, extensionId: string) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
}

/** Opens a page and waits for its first analysis (New must be highlighted). */
async function openArticle(context: BrowserContext, path = "/article-en.html") {
  const page = await context.newPage();
  await page.goto(path);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  return page;
}

test("hovering a word shows its card with the Japanese translation", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await hover(page, "tangy");
  await expect(page.getByText(en["hover.hint"])).toBeVisible();
  await expect(page.getByText("tangy", { exact: true })).toBeVisible();
  await expect(page.getByText(/ぴりっと/)).toBeVisible();
  await expect(page.getByText(en["lookup.status.new"])).toBeVisible();
});

test("a word saved from the dictionary panel keeps its Learning highlight", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await click(page, "tangy");
  const panel = dictionary(page);
  await expect(panel.getByRole("heading", { name: "tangy" })).toBeVisible();
  await expect(panel.getByText(/^On this page · 1$/)).toBeVisible();
  await panel
    .getByRole("button", { name: en["dict.status.learning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["tangy"]);
  expect(await highlighted(page, "lingo-new")).not.toContain("tangy");

  await page.reload();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["tangy"]);
});

test("a selected phrase is saved and highlighted", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const box = await textBox(page, "rise and fall");
  // Click inside "rise", then Shift+click inside "fall". (A mouse drag selects
  // nothing on this page in headless Chromium; it does in the browser tests.)
  await page.mouse.click(box.left + 4, box.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.right - 4, box.y);
  await page.keyboard.up("Shift");
  const bar = page.getByText("Save “rise and fall” as a phrase");
  await expect(bar).toBeVisible();
  await page
    .getByRole("button", { name: en["phrase.learning"], exact: true })
    .click();
  await expect(bar).toHaveCount(0);
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["rise and fall"]);
});

test("the end card adds every unsaved word and undoes it", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await expect(page.getByText(en["card.pageStatus"])).toBeVisible();
  await textBox(page, "back to its cause.");
  const end = page.getByRole("region", { name: en["endCard.region"] });
  await expect(end.getByText(en["endCard.article"])).toBeVisible();
  await expect(page.getByText(en["card.pageStatus"])).toHaveCount(0);

  const line = await end.getByText(/words not saved yet$/).textContent();
  const unsaved = Number(/\d+/.exec(line!)![0]);
  expect(unsaved).toBeGreaterThan(5);
  const newWords = (await highlighted(page, "lingo-new")).length;

  await end.getByRole("button", { name: en["saveAll.addLearning"] }).click();
  await expect(
    end.getByText(`${unsaved} words added to Learning`),
  ).toBeVisible();
  await expect(end.getByText(en["saveAll.allSaved"])).toBeVisible();
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  expect((await highlighted(page, "lingo-learning")).length).toBe(newWords);

  await end.getByRole("button", { name: en["saveAll.undo"] }).click();
  await expect(end.getByText(`${unsaved} words not saved yet`)).toBeVisible();
  expect((await highlighted(page, "lingo-new")).length).toBe(newWords);
  expect(await highlighted(page, "lingo-learning")).toEqual([]);

  await end.getByRole("button", { name: en["endCard.close"] }).click();
  await expect(page.getByText(en["card.pageStatus"])).toBeVisible();
});

test("Seen elsewhere lists the other article a word was saved on", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const first = await openArticle(context, "/article2-en.html");
  await click(first, "tangy");
  await dictionary(first)
    .getByRole("button", { name: en["dict.status.learning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(first, "lingo-learning"))
    .toEqual(["tangy"]);

  const page = await openArticle(context);
  await click(page, "tangy");
  const panel = dictionary(page);
  await expect(panel.getByText("Seen elsewhere · 1")).toBeVisible();
  await expect(
    panel.getByText("A quick tomato sauce for busy evenings"),
  ).toBeVisible();
  await expect(
    panel.getByText("A spoonful of vinegar gives the sauce a tangy finish."),
  ).toBeVisible();
});

test("the popup can ask the page what save-all would do, and do it", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Without the "tabs" permission tab URLs are hidden: ask every tab; only the
  // article's content script answers.
  const ask = (message: object) =>
    popup.evaluate(async (message) => {
      const { chrome: api } = globalThis as unknown as {
        chrome: {
          tabs: {
            query(q: object): Promise<{ id: number }[]>;
            sendMessage(id: number, m: unknown): Promise<unknown>;
          };
        };
      };
      const replies = await Promise.all(
        (await api.tabs.query({})).map((tab) =>
          api.tabs.sendMessage(tab.id, message).catch(() => undefined),
        ),
      );
      return replies.filter((r) => r !== undefined);
    }, message);

  const [summary] = (await ask({ type: "pageSummary" })) as {
    supported: boolean;
    unsaved: number;
    done: null;
  }[];
  expect(summary).toMatchObject({ supported: true, done: null });
  expect(summary!.unsaved).toBeGreaterThan(0);

  expect(await ask({ type: "pageSaveAll", status: "known" })).toEqual([
    {
      supported: true,
      unsaved: 0,
      done: { count: summary!.unsaved, target: "known" },
    },
  ]);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  expect(await ask({ type: "pageUndo" })).toEqual([summary]);
  await page.close();
});
