// What the specs do on a web page with Lingo on it.
import type { BrowserContext, Page } from "@playwright/test";
import { expect, sendToBackground } from "./fixtures";

/** The text of every range under a highlight name ([] when it is not registered). */
export function highlighted(page: Page, name: string): Promise<string[]> {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

/** Scrolls `text` (inside `within`) into view and returns a point on it. */
export function pointOn(page: Page, text: string, within = "article") {
  return page.evaluate(
    ([text, within]) => {
      const walker = document.createTreeWalker(
        document.querySelector(within)!,
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
    },
    [text, within] as const,
  );
}

export async function showNewWords(
  context: BrowserContext,
  extensionId: string,
) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
}

/** Opens an article fixture and waits for its first analysis (New must be on). */
export async function openArticle(
  context: BrowserContext,
  url = "/article-en.html",
) {
  const page = await context.newPage();
  await page.goto(url);
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
  return page;
}

/** Saves a word or phrase from a video, as the content scripts do. */
export async function saveTerm(
  context: BrowserContext,
  extensionId: string,
  key: string,
  status: "learning" | "known",
) {
  const reply = await sendToBackground(context, extensionId, {
    type: "saveTerm",
    lang: "en",
    key,
    display: key,
    kind: key.includes(" ") ? "phrase" : "word",
    status,
    source: {
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=bake1",
      title: "Baking bread from scratch at home",
      lang: "en",
    },
    sentence: `A sentence with ${key} in it.`,
    pos: { timeMs: 75_000 },
  });
  expect(reply).toMatchObject({ ok: true });
}
