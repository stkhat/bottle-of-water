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
} from "../../testing/article";

const ARTICLE = `
  <div style="height: 120px"></div>
  <p>They knead the dough and bake loaves.</p>
  <p>So you can trace each rise and fall back to its cause.</p>
  <p>one two three four five six seven eight nine ten</p>`;

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(cleanUp);

/** The selection card's status: there is one only while the card shows. */
const selectedStatus = () => page.getByText("Selected · not saved");
/** The card's "Details" button: hover cards stay away while the selection card shows. */
const details = () => page.getByRole("button", { name: "Details" });
/** The card's root: the box around the row of buttons. */
const cardRoot = () => details().element().parentElement!.parentElement!;
const card = () => page.elementLocator(cardRoot());
/** A button of the selection card, once the card is for `head`. */
async function cardButton(head: string, name: string) {
  await expect.element(selectedStatus()).toBeVisible();
  await expect.element(card().getByText(head, { exact: true })).toBeVisible();
  return card().getByRole("button", { name, exact: true });
}
const quiet = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe("selection card", () => {
  it("snaps a selection to whole words and shows the phrase's card above it", async () => {
    const { root } = await setup(ARTICLE);
    await dragSelect(root, "rise", 2, "fall", 2);
    await expect.element(selectedStatus()).toBeVisible();
    expect(getSelection()!.toString()).toBe("rise and fall");
    await expect
      .element(card().getByText("Phrase", { exact: true }))
      .toBeVisible();
    await expect
      .element(card().getByText("rise and fall", { exact: true }))
      .toBeVisible();
    await expect.element(card().getByText("rise — 上昇")).toBeVisible();
    for (const name of ["+ Learning", "Known", "Details"])
      await expect
        .element(card().getByRole("button", { name, exact: true }))
        .toBeVisible();
    // The click that ends the drag opens no panel.
    expect(dictionary().query()).toBeNull();

    // Where a hovered phrase's card sits: 10px above its line, 10px left of it.
    const words = rectOf(root, "rise and fall");
    const lineTop = words.top + words.height / 2 - (19 * 1.75) / 2;
    const box = cardRoot().getBoundingClientRect();
    expect(box.bottom).toBeCloseTo(lineTop - 10, 0);
    expect(box.left).toBeCloseTo(words.left - 12, 0);
    expect(box.width).toBe(290);
  });

  it("saves the selected words as a phrase and highlights it", async () => {
    const { root, background } = await setup(ARTICLE);
    selectText(root, "rise", 0, "fall", 4);
    await (await cardButton("rise and fall", "+ Learning")).click();
    await expect.poll(() => selectedStatus().query()).toBeNull();
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
        if (request.type === "saveTerm") await quiet();
      },
    });
    selectText(root, "rise", 0, "fall", 4);
    await (await cardButton("rise and fall", "+ Learning")).click();
    document.dispatchEvent(new Event("selectionchange"));
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    await expect.poll(() => selectedStatus().query()).toBeNull();
    expect(getSelection()!.isCollapsed).toBe(true);
  });

  it("keys a phrase by its words' base forms", async () => {
    const { root, background } = await setup(ARTICLE);
    selectText(root, "bake", 0, "loaves", 6);
    await (await cardButton("bake loaves", "Known")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "bake loaf",
      display: "bake loaves",
      kind: "phrase",
      status: "known",
    });
  });

  it("shows the literal translation with the Machine translation mark", async () => {
    const { root } = await setup(ARTICLE, {
      translator: { translate: async (text) => `訳: ${text}` },
    });
    selectText(root, "rise", 0, "fall", 4);
    await cardButton("rise and fall", "+ Learning");
    await expect
      .element(card().getByText("訳: rise and fall"))
      .toHaveAttribute("lang", "ja");
    await expect
      .element(card().getByText("Machine translation", { exact: true }))
      .toBeVisible();
  });

  it("leaves out the translation and the mark without a translator", async () => {
    const { root } = await setup(ARTICLE);
    selectText(root, "rise", 0, "fall", 4);
    await cardButton("rise and fall", "+ Learning");
    expect(cardRoot().textContent).not.toContain("Machine translation");
    // Head, then straight to the notes.
    const head = card().getByText("rise and fall", { exact: true }).element();
    expect(head.nextElementSibling!.hasAttribute("data-divider")).toBe(true);
  });

  it("shows a saved phrase's card with its translation and main word", async () => {
    const { root } = await setup(ARTICLE, {
      translator: { translate: async (text) => `訳: ${text}` },
    });
    selectText(root, "rise", 0, "fall", 4);
    await (await cardButton("rise and fall", "+ Learning")).click();
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["rise and fall"]);

    await pointAt(root, "and fall");
    await expect
      .element(page.getByText("Phrase", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("Learning", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByText("訳: rise and fall")).toBeVisible();
    await expect.element(page.getByText("rise — 上昇")).toBeVisible();
  });

  it("keeps hover cards away while it shows", async () => {
    const { root } = await setup(ARTICLE);
    selectText(root, "rise", 0, "fall", 4);
    await cardButton("rise and fall", "+ Learning");
    await pointAt(root, "knead");
    await quiet(500);
    expect(details().elements()).toHaveLength(1);
    expect(page.getByText("Word", { exact: true }).query()).toBeNull();
  });

  it("opens the dictionary panel for the phrase from Details", async () => {
    const { root, background } = await setup(ARTICLE);
    selectText(root, "rise", 0, "fall", 4);
    await (await cardButton("rise and fall", "Details")).click();
    const panel = dictionary();
    await expect
      .element(panel.getByRole("heading", { name: "rise and fall" }))
      .toBeVisible();
    await expect
      .element(panel.getByRole("button", { name: "Not saved" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(selectedStatus().query()).toBeNull();
    expect(getSelection()!.isCollapsed).toBe(true);

    await panel.getByRole("button", { name: "Learning", exact: true }).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "rise and fall",
      display: "rise and fall",
      kind: "phrase",
      status: "learning",
    });
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["rise and fall"]);
    await expect
      .element(panel.getByRole("button", { name: "Learning", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(panel.getByText("On this page · 1")).toBeVisible();
  });

  it("shows no card for one word, more than eight, or words across punctuation", async () => {
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

    select("dough", "dough");
    await quiet();
    expect(selectedStatus().query()).toBeNull();
    select("one", "nine");
    await quiet();
    expect(selectedStatus().query()).toBeNull();
    select("loaves", "So");
    await quiet();
    expect(selectedStatus().query()).toBeNull();
    select("one", "eight");
    await cardButton("one two three four five six seven eight", "Known");
  });

  it("selects anew from a drag that starts inside the selected words", async () => {
    const { root } = await setup(ARTICLE);
    await dragSelect(root, "rise", 2, "fall", 2);
    await cardButton("rise and fall", "+ Learning");
    expect(getSelection()!.toString()).toBe("rise and fall");
    await dragSelect(root, "and fall", 1, "back", 2);
    await cardButton("and fall back", "+ Learning");
    expect(getSelection()!.toString()).toBe("and fall back");
  });

  it("goes away when the selection does", async () => {
    const { root } = await setup(ARTICLE);
    await dragSelect(root, "rise", 0, "fall", 4);
    await expect.element(selectedStatus()).toBeVisible();
    getSelection()!.removeAllRanges();
    await expect.poll(() => selectedStatus().query()).toBeNull();
  });
});

describe("selection card: the pattern a selection stands for", () => {
  const MIND = `
    <div style="height: 120px"></div>
    <p>She made up her mind.</p>
    <p>Later he made up his mind too.</p>`;
  const FIRST = "She made up her mind.";

  it("shows the pattern's card: its key, meaning and main word", async () => {
    const { root, background, session } = await setup(MIND);
    selectText(root, "made", 0, "mind", 4);
    await cardButton("make up one's mind", "+ Learning");
    expect(session.app.store.get().phrase?.card.key).toBe("make up one's mind");
    // Its senses, one per line.
    for (const meaning of ["決心する", "決める"])
      await expect
        .element(card().getByText(meaning, { exact: true }))
        .toHaveAttribute("lang", "ja");
    await expect.element(card().getByText("make — 作る")).toBeVisible();
    expect(cardRoot().textContent).not.toContain("Machine translation");
    expect(background.sent("matchSelection")).toEqual([
      {
        type: "matchSelection",
        lang: "en",
        text: FIRST,
        start: FIRST.indexOf("made"),
        end: FIRST.indexOf("."),
      },
    ]);
  });

  it("saves the selected words under the pattern they stand for", async () => {
    const { root, background } = await setup(MIND);
    selectText(root, "made", 0, "mind", 4);
    await (await cardButton("make up one's mind", "+ Learning")).click();
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
    await (await cardButton("make up one's mind", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "make up one's mind",
      display: "made up her mind",
      sentence: FIRST,
      pos: { textQuote: FIRST },
    });
  });

  it("waits for the pattern when the phrase is saved before it is known", async () => {
    let asked = false;
    const { root, background, session } = await setup(MIND, {
      beforeRequest: async (request) => {
        if (request.type !== "matchSelection") return;
        asked = true;
        await quiet(400);
      },
    });
    selectText(root, "made", 0, "mind", 4);
    await expect.poll(() => asked).toBe(true);
    session.app.savePhrase("learning");
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "make up one's mind",
    });
  });

  it("keeps the words' keys when no pattern matches", async () => {
    const { root, background, session } = await setup(MIND);
    selectText(root, "Later he", 0, "Later he", 8);
    await (await cardButton("Later he", "Known")).click();
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
    await quiet(150);
    selectText(root, "Later he", 0, "Later he", 8);
    await cardButton("Later he", "+ Learning");
    await quiet(600);
    expect(session.app.store.get().phrase?.card).toMatchObject({
      key: "later he",
      head: "Later he",
    });
  });

  it("opens the pattern in the panel from Details and saves it from there", async () => {
    const { root, background } = await setup(MIND);
    selectText(root, "made", 0, "mind", 4);
    await (await cardButton("make up one's mind", "Details")).click();
    const panel = dictionary();
    await expect
      .element(panel.getByRole("heading", { name: "make up one's mind" }))
      .toBeVisible();
    await expect
      .element(panel.getByRole("button", { name: "Not saved" }))
      .toHaveAttribute("aria-pressed", "true");

    await panel.getByRole("button", { name: "Learning", exact: true }).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "make up one's mind",
      display: "made up her mind",
      kind: "phrase",
      status: "learning",
      sentence: FIRST,
    });
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["made up her mind", "made up his mind"]);
    await expect.element(panel.getByText("On this page · 2")).toBeVisible();
  });
});

describe("selection card: words partly over a highlighted phrase", () => {
  const CRUST = `
    <div style="height: 120px"></div>
    <p>She gave up the crust.</p>`;

  it("saves the selected words, not the phrase, and highlights them instead of it", async () => {
    const { root, background } = await setup(CRUST, {
      settings: { highlight: { new: true, learning: true, known: false } },
    });
    await expect.poll(() => highlighted("lingo-new")).toContain("gave up");
    selectText(root, "up the", 0, "crust", 5);
    await (await cardButton("up the crust", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "up the crust",
      display: "up the crust",
      kind: "phrase",
      status: "learning",
    });
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["up the crust"]);
    expect(highlighted("lingo-new")).not.toContain("gave up");
  });

  it("saves words partly over a saved phrase and draws them when they are longer", async () => {
    const { root, background } = await setup(CRUST, {
      before: async (bg) => {
        await bg.send({
          type: "saveTerm",
          lang: "en",
          key: "give up",
          display: "gave up",
          kind: "phrase",
          status: "learning",
          source: {
            platform: "web",
            url: "https://example.com/",
            title: "",
            lang: "en",
          },
          sentence: "They gave up.",
          pos: { textQuote: "They gave up." },
        });
      },
    });
    await expect.poll(() => highlighted("lingo-learning")).toEqual(["gave up"]);
    selectText(root, "up the", 0, "crust", 5);
    expect(getSelection()!.toString()).toBe("up the crust");
    await (await cardButton("up the crust", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(2);
    expect(background.sent("saveTerm")[1]).toMatchObject({
      key: "up the crust",
    });
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["up the crust"]);
  });

  it("saves words selected over the phrase and past it under their own keys", async () => {
    const { root, background } = await setup(CRUST);
    selectText(root, "gave", 0, "crust", 5);
    await (await cardButton("gave up the crust", "+ Learning")).click();
    await expect.poll(() => background.sent("saveTerm")).toHaveLength(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "give up the crust",
      display: "gave up the crust",
    });
    await expect
      .poll(() => highlighted("lingo-learning"))
      .toEqual(["gave up the crust"]);
  });
});
