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

/** Scrolls `text` (inside `within`) to the middle of the viewport and returns its box. */
function textBox(page: Page, text: string, within = "article") {
  return page.evaluate(
    ([text, within]) => {
      const walker = document.createTreeWalker(
        document.querySelector(within)!,
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
    },
    [text, within] as const,
  );
}

async function hover(page: Page, text: string, within?: string) {
  const box = await textBox(page, text, within);
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
  await expect(
    page.getByRole("button", { name: en["hover.details"] }),
  ).toBeVisible();
  await expect(page.getByText("tangy", { exact: true })).toBeVisible();
  await expect(page.getByText(/ぴりっと/)).toBeVisible();
  await expect(page.getByText(en["lookup.status.new"])).toBeVisible();
});

test("only the article gets highlights; words around it still show their card", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  // The aside is analyzed once it scrolls near the viewport: hover again until then.
  await expect(async () => {
    await page.mouse.move(0, 0);
    await hover(page, "crackling", "aside");
    await expect(
      page.getByRole("button", { name: en["hover.details"] }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass();
  const words = await highlighted(page, "lingo-new");
  expect(words).toEqual(expect.arrayContaining(["knead", "tangy"]));
  expect(words).not.toContain("crackling");
  expect(words).not.toContain("sluggish");

  // Settings → Articles → "Highlight only the article" off: the whole page.
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { articleMainOnly: false },
  });
  await expect
    .poll(() => highlighted(page, "lingo-new"))
    .toEqual(expect.arrayContaining(["knead", "crackling", "sluggish"]));
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

/**
 * Selects from inside the first word of `phrase` to inside its last with the Selection
 * API. Mouse selection is covered by the browser tests: in headless Chromium a mouse
 * drag selects nothing on this page, and Shift+click is unreliable on Linux.
 */
async function selectInArticle(page: Page, phrase: string) {
  await textBox(page, phrase);
  await page.evaluate((phrase) => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const start = node.data.indexOf(phrase);
      if (start < 0) continue;
      const end = start + phrase.length - 2;
      getSelection()!.setBaseAndExtent(node, start + 1, node, end);
      return;
    }
    throw new Error(`${phrase} not found`);
  }, phrase);
}

test("a selected phrase is saved and highlighted", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await selectInArticle(page, "rise and fall");
  const selected = page.getByText(en["lookup.status.selected"]);
  await expect(selected).toBeVisible();
  await expect(page.getByText("rise and fall", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: en["hover.addLearning"], exact: true })
    .click();
  await expect(selected).toHaveCount(0);
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["rise and fall"]);
});

test("a selection shows the phrase pattern it matches and is saved under its key", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await selectInArticle(page, "made up her mind");
  await expect(page.getByText(en["lookup.status.selected"])).toBeVisible();
  await expect(
    page.getByText("make up one's mind", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en["hover.addLearning"], exact: true })
    .click();
  // Saved with a slot, it is found with other words in the slot.
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["made up her mind", "made up his mind"]);
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

test("with Spanish as your language, English words have Spanish meanings", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { nativeLang: "es" },
  });
  const page = await openArticle(context, "/article2-en.html");
  // "tangy" comes from a translation table: its English sense is the hint.
  await hover(page, "tangy");
  await expect(page.getByText("acidulado", { exact: true })).toHaveAttribute(
    "lang",
    "es",
  );
  await click(page, "tangy");
  const panel = dictionary(page);
  await expect(panel.getByRole("heading", { name: "tangy" })).toBeVisible();
  await expect(
    panel.getByText("having a sharp, pungent flavor", { exact: true }),
  ).toHaveAttribute("lang", "en");
  await expect(
    panel.getByText("acidulado, acídulo", { exact: true }),
  ).toHaveAttribute("lang", "es");
});

test("the popup can ask the page what Mark all would do, and do it", async ({
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
    hostname: string;
    scope: string;
    unsaved: number;
    done: null;
  }[];
  expect(summary).toMatchObject({
    supported: true,
    hostname: "localhost",
    scope: "page",
    done: null,
  });
  expect(summary!.unsaved).toBeGreaterThan(0);

  expect(await ask({ type: "pageSaveAll", status: "known" })).toEqual([
    {
      supported: true,
      hostname: "localhost",
      scope: "page",
      unsaved: 0,
      done: { count: summary!.unsaved, target: "known" },
    },
  ]);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  expect(await ask({ type: "pageUndo" })).toEqual([summary]);
  await page.close();
});

test("the on-page UI follows the theme: dark in a dark browser under System, light when picked", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  await page.emulateMedia({ colorScheme: "dark" });
  await hover(page, "tangy");
  const head = page.getByText("tangy", { exact: true });
  await expect(head).toBeVisible();
  const ink = () => head.evaluate((el) => getComputedStyle(el).color);
  await expect.poll(ink).toBe("rgb(232, 234, 240)");

  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { theme: "light" },
  });
  await expect.poll(ink).toBe("rgb(20, 24, 43)");
});
