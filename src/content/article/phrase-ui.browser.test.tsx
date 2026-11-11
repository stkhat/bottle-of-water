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
  selectText,
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
/** A button of the bar, once the bar offers `phrase`. */
async function barButton(phrase: string, name: string) {
  await expect
    .element(page.getByText(`Save “${phrase}” as a phrase`))
    .toBeVisible();
  return page
    .elementLocator(bar().element().parentElement!)
    .getByRole("button", { name });
}

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
    selectText(root, "rise", 0, "fall", 4);
    await (await barButton("rise and fall", "+ Learning")).click();
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

  it("saves the phrase even when the selection is read again while saving", async () => {
    const { root, background } = await setup(ARTICLE, {
      // A slow save: the selection is read again before it is done.
      beforeRequest: async (request) => {
        if (request.type === "saveTerm")
          await new Promise((resolve) => setTimeout(resolve, 300));
      },
    });
    selectText(root, "rise", 0, "fall", 4);
    await (await barButton("rise and fall", "+ Learning")).click();
    document.dispatchEvent(new Event("selectionchange"));
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    await expect.poll(() => bar().query()).toBeNull();
    expect(getSelection()!.isCollapsed).toBe(true);
  });

  it("keys a phrase by its words' base forms", async () => {
    const { root, background } = await setup(ARTICLE);
    selectText(root, "bake", 0, "loaves", 6);
    await (await barButton("bake loaves", "Known")).click();
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
    selectText(root, "rise", 0, "fall", 4);
    await (await barButton("rise and fall", "+ Learning")).click();
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

describe("phrase bar: the pattern a selection stands for", () => {
  const MIND = `
    <div style="height: 120px"></div>
    <p>She made up her mind.</p>
    <p>Later he made up his mind too.</p>`;
  const FIRST = "She made up her mind.";
  const quiet = (ms = 300) => new Promise((r) => setTimeout(r, ms));

  it("saves the selected words under the pattern they stand for", async () => {
    const { root, background, session } = await setup(MIND);
    selectText(root, "made", 0, "mind", 4);
    await expect
      .poll(() => session.app.store.get().phrase?.key)
      .toBe("make up one's mind");
    expect(background.sent("matchSelection")).toEqual([
      {
        type: "matchSelection",
        lang: "en",
        text: FIRST,
        start: FIRST.indexOf("made"),
        end: FIRST.indexOf("."),
      },
    ]);

    await (await barButton("made up her mind", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "make up one's mind",
      display: "made up her mind",
      kind: "phrase",
      status: "learning",
      sentence: FIRST,
    });
    // Saved with a slot, it is found with other words in the slot.
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["made up her mind", "made up his mind"]);
  });

  it("saves the whole pattern's words when the sentence completes the selection", async () => {
    const { root, background } = await setup(MIND);
    selectText(root, "made", 0, "up", 2);
    await (await barButton("made up", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "make up one's mind",
      display: "made up her mind",
      sentence: FIRST,
      pos: { textQuote: FIRST },
    });
  });

  it("waits for the pattern when the bar is pressed before it is known", async () => {
    const { root, background } = await setup(MIND, {
      beforeRequest: async (request) => {
        if (request.type === "matchSelection") await quiet(400);
      },
    });
    selectText(root, "made", 0, "mind", 4);
    await (await barButton("made up her mind", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "make up one's mind",
    });
  });

  it("keeps the words' keys when no pattern matches", async () => {
    const { root, background, session } = await setup(MIND);
    selectText(root, "Later he", 0, "Later he", 8);
    await (await barButton("Later he", "Known")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("matchSelection")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "later he",
      display: "Later he",
    });
    await expect.poll(() => session.app.store.get().phrase).toBeNull();
  });

  it("drops the answer for a selection that has changed", async () => {
    const { root, session } = await setup(MIND, {
      // The first selection's answer comes after the second selection's.
      beforeRequest: async (request) => {
        if (request.type === "matchSelection" && request.text === FIRST)
          await quiet(400);
      },
    });
    selectText(root, "made", 0, "mind", 4);
    await barButton("made up her mind", "+ Learning");
    selectText(root, "Later he", 0, "Later he", 8);
    await barButton("Later he", "+ Learning");
    await quiet(600);
    expect(session.app.store.get().phrase).toMatchObject({ text: "Later he" });
    expect(session.app.store.get().phrase?.key).toBeUndefined();
  });
});
