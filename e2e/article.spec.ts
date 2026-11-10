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

test("a dictionary phrase is highlighted as one new term with its meaning", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const fresh = await highlighted(page, "lingo-new");
  expect(fresh).toContain("from scratch");
  expect(fresh).not.toContain("scratch");

  await hover(page, "from scratch");
  await expect(
    page.getByText(en["lookup.kind.phrase"], { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("最初から", { exact: true })).toHaveAttribute(
    "lang",
    "ja",
  );
  await click(page, "from scratch");
  const panel = dictionary(page);
  await expect(
    panel.getByRole("heading", { name: "from scratch" }),
  ).toBeVisible();
  await expect(panel.getByText("ゼロから", { exact: true })).toBeVisible();
});

test("a phrase with only an English definition shows it as English", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  expect(await highlighted(page, "lingo-new")).toContain("figure out");

  await hover(page, "figure out");
  await expect(
    page.getByText("To come to understand", { exact: true }),
  ).toHaveAttribute("lang", "en");
  await click(page, "figure out");
  const panel = dictionary(page);
  await expect(
    panel.getByRole("heading", { name: "figure out" }),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "To come to understand; to discover or find a solution; to deduce.",
    ),
  ).toHaveAttribute("lang", "en");
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
  await textBox(page, "rise and fall");
  // Select from inside "rise" to inside "fall" with the Selection API. Mouse
  // selection is covered by the browser tests: in headless Chromium a mouse drag
  // selects nothing on this page, and Shift+click is unreliable on Linux.
  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const start = node.data.indexOf("rise and");
      if (start < 0) continue;
      const end = node.data.indexOf("fall", start) + 2;
      getSelection()!.setBaseAndExtent(node, start + 1, node, end);
      return;
    }
    throw new Error("rise and fall not found");
  });
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

test("reaching the end marks every unsaved new word Known when Settings say so", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true, known: true }, unsavedAtEnd: "known" },
  });
  const page = await openArticle(context);
  // No Lingo card sits on the page.
  await expect(
    page.getByRole("button", { name: en["card.chip.learning"] }),
  ).toHaveCount(0);
  const known = (await highlighted(page, "lingo-known")).length;

  await textBox(page, "back to its cause.");
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBe(0);
  expect((await highlighted(page, "lingo-known")).length).toBeGreaterThan(
    known,
  );

  // Saved for good: a reload shows them Known.
  await page.reload();
  await expect
    .poll(async () => (await highlighted(page, "lingo-known")).length)
    .toBeGreaterThan(known);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
});

test("reaching the end keeps unsaved words New by default", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await textBox(page, "back to its cause.");
  await page.waitForTimeout(500);
  await page.reload();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
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

test("a Spanish article is highlighted and looked up in English when learning Spanish", async ({
  context,
  extensionId,
}) => {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    // At the lowest level "comer" (about the 1,800th word) is still new.
    patch: {
      learningLang: "es",
      nativeLang: "en",
      knownLevel: 1000,
      highlight: { new: true },
    },
  });
  const page = await openArticle(context, "/article-es.html");
  await expect
    .poll(() => highlighted(page, "lingo-new"))
    .toEqual(expect.arrayContaining(["comiendo", "a escondidas"]));

  await hover(page, "comiendo");
  await expect(page.getByText("comer", { exact: true })).toBeVisible();
  await expect(page.getByText("/koˈmeɾ/", { exact: true })).toBeVisible();
  await expect(page.getByText("to eat", { exact: true })).toHaveAttribute(
    "lang",
    "en",
  );

  await click(page, "comiendo");
  const panel = dictionary(page);
  await expect(panel.getByRole("heading", { name: "comer" })).toBeVisible();
  await panel
    .getByRole("button", { name: en["dict.status.learning"], exact: true })
    .click();
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["comiendo"]);
  expect(await highlighted(page, "lingo-new")).not.toContain("comiendo");
});

test("the popup can ask the page about itself", async ({
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

  expect(await ask({ type: "pageSummary" })).toEqual([
    { supported: true, hostname: "localhost" },
  ]);
  await page.close();
});
