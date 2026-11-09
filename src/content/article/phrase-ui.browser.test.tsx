import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  cleanUp,
  dictionary,
  dragSelect,
  highlighted,
  pointAt,
  rangeOfText,
  rectOf,
  setup,
} from "./article-testing";

const ARTICLE = `
  <div style="height: 120px"></div>
  <p>They knead the dough and bake loaves.</p>
  <p>So you can trace each rise and fall back to its cause.</p>
  <p>one two three four five six seven eight nine ten</p>`;

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(cleanUp);

const bar = () => page.getByText(/^Save “.*” as a phrase$/);
/** The bar's box: the root around its label. */
const barBox = () => bar().element().parentElement!.getBoundingClientRect();
const barButton = (name: string) =>
  page
    .elementLocator(bar().element().parentElement!)
    .getByRole("button", { name });

describe("phrase bar", () => {
  it("snaps a selection to whole words and shows the bar above it", async () => {
    const { root } = await setup(ARTICLE);
    await dragSelect(root, "rise", 2, "fall", 2);
    await expect
      .element(page.getByText("Save “rise and fall” as a phrase"))
      .toBeVisible();
    expect(getSelection()!.toString()).toBe("rise and fall");
    // The click that ends the drag opens no panel.
    expect(dictionary().query()).toBeNull();

    const words = rectOf(root, "rise and fall");
    const lineTop = words.top + words.height / 2 - (19 * 1.75) / 2;
    expect(barBox().bottom).toBeCloseTo(lineTop - 10, 0);
    expect(barBox().left).toBeCloseTo(words.left - 12, 0);
  });

  it("saves the selected words as a phrase and highlights it", async () => {
    const { root, background } = await setup(ARTICLE);
    await dragSelect(root, "rise", 0, "fall", 4);
    await barButton("+ Learning").click();
    await expect.poll(() => bar().query()).toBeNull();
    expect(getSelection()!.isCollapsed).toBe(true);
    const sentence = "So you can trace each rise and fall back to its cause.";
    expect(background.sent("saveTerm")).toEqual([
      {
        type: "saveTerm",
        lang: "en",
        key: "rise and fall",
        display: "rise and fall",
        kind: "phrase",
        status: "learning",
        source: {
          platform: "web",
          url: location.href,
          title: document.title,
          lang: "en",
        },
        sentence,
        pos: { textQuote: sentence },
      },
    ]);
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["rise and fall"]);
  });

  it("keys a phrase by its words' base forms", async () => {
    const { root, background } = await setup(ARTICLE);
    await dragSelect(root, "bake", 0, "loaves", 6);
    await barButton("Known").click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "bake loaf",
      display: "bake loaves",
      kind: "phrase",
      status: "known",
    });
  });

  it("shows a saved phrase's card with its translation and main word", async () => {
    const { root } = await setup(ARTICLE, {
      translator: { translate: async (text) => `訳: ${text}` },
    });
    await dragSelect(root, "rise", 0, "fall", 4);
    await barButton("+ Learning").click();
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["rise and fall"]);

    await pointAt(root, "and fall");
    await expect
      .element(page.getByText("Phrase", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByText("訳: rise and fall")).toBeVisible();
    await expect.element(page.getByText("rise — 上昇")).toBeVisible();
  });

  it("shows no bar for one word, more than eight, or words across punctuation", async () => {
    const { root } = await setup(ARTICLE);
    const select = (from: string, to: string) => {
      const range = rangeOfText(root, from);
      range.setEnd(
        rangeOfText(root, to).endContainer,
        rangeOfText(root, to).endOffset,
      );
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    };
    const quiet = () => new Promise((r) => setTimeout(r, 300));

    select("dough", "dough");
    await quiet();
    expect(bar().query()).toBeNull();
    select("one", "nine");
    await quiet();
    expect(bar().query()).toBeNull();
    select("loaves", "So");
    await quiet();
    expect(bar().query()).toBeNull();
    select("one", "eight");
    await expect
      .element(
        page.getByText(
          "Save “one two three four five six seven eight” as a phrase",
        ),
      )
      .toBeVisible();
  });

  it("goes away when the selection does", async () => {
    const { root } = await setup(ARTICLE);
    await dragSelect(root, "rise", 0, "fall", 4);
    await expect.element(bar()).toBeVisible();
    getSelection()!.removeAllRanges();
    await expect.poll(() => bar().query()).toBeNull();
  });
});
