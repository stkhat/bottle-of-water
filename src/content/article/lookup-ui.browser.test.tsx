import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  cleanUp,
  clickOn,
  dictionary,
  highlighted,
  pointAt,
  pointTo,
  rectOf,
  setup,
} from "./article-testing";

const ARTICLE = `
  <p>They knead the dough and bake loaves.</p>
  <p>It can feel tedious at first. Once you figure out a schedule, it is tedious no more.</p>
  <p>So you can trace each rise and fall back to its cause.</p>`;

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(cleanUp);

const hoverCard = () => page.getByText("Click the word for details");
/** The hover card's box: the root around its hint. */
const hoverBox = () =>
  hoverCard().element().parentElement!.getBoundingClientRect();

describe("hover card", () => {
  it("appears 250 ms after the pointer rests on a word, above it", async () => {
    const { root } = await setup(`<div style="height: 200px"></div>${ARTICLE}`);
    const started = performance.now();
    await pointAt(root, "tedious");
    await new Promise((r) => setTimeout(r, 150));
    expect(hoverCard().query()).toBeNull();

    await expect.element(hoverCard()).toBeVisible();
    expect(performance.now() - started).toBeGreaterThanOrEqual(250);
    await expect.element(page.getByText("退屈な、面倒な")).toBeVisible();
    await expect.element(page.getByText("/ˈtiːdiəs/")).toBeVisible();
    await expect.element(page.getByText("New · not saved")).toBeVisible();

    // Like the mock: 10px above the word's line and 10px left of the word's box.
    const word = rectOf(root, "tedious");
    const box = hoverBox();
    const lineHeight = 19 * 1.75;
    const lineTop = word.top + word.height / 2 - lineHeight / 2;
    expect(box.bottom).toBeCloseTo(lineTop - 10, 0);
    expect(box.left).toBeCloseTo(word.left - 12, 0);
  });

  it("flips below a word with no room above it", async () => {
    const { root } = await setup(ARTICLE);
    await pointAt(root, "knead");
    await expect.element(hoverCard()).toBeVisible();
    const word = rectOf(root, "knead");
    const lineHeight = 19 * 1.75;
    const lineBottom = word.top + word.height / 2 + lineHeight / 2;
    expect(hoverBox().top).toBeCloseTo(lineBottom + 10, 0);
  });

  it("shows the base form of an inflected word", async () => {
    const { root } = await setup(ARTICLE);
    await pointAt(root, "loaves");
    await expect.element(page.getByText("loaves → loaf")).toBeVisible();
    await expect.element(page.getByText("（パンの）ひと塊")).toBeVisible();
  });

  it("stays while the pointer is in it and goes after it leaves", async () => {
    const { root } = await setup(`<div style="height: 200px"></div>${ARTICLE}`);
    await pointAt(root, "tedious");
    await expect.element(hoverCard()).toBeVisible();
    const box = hoverBox();
    // Up through the line above into the card.
    await pointTo(box.left + 40, box.bottom + 5);
    await pointTo(box.left + 40, box.bottom - 20);
    await new Promise((r) => setTimeout(r, 400));
    expect(hoverCard().query()).not.toBeNull();
    await expect
      .element(page.getByText("tedious", { exact: true }))
      .toBeVisible();

    await pointTo(900, 700);
    await expect.poll(() => hoverCard().query()).toBeNull();
  });

  it("shows nothing over words Lingo does not know", async () => {
    const { root } = await setup("<p>Zorbles wibble the dough.</p>");
    await pointAt(root, "wibble");
    await new Promise((r) => setTimeout(r, 400));
    expect(hoverCard().query()).toBeNull();
  });

  it("+ Learning saves the word and updates the card and the highlights", async () => {
    const { root, background } = await setup(
      `<div style="height: 200px"></div>${ARTICLE}`,
    );
    await pointAt(root, "tedious");
    await page.getByRole("button", { name: "+ Learning" }).click();
    await expect
      .element(page.getByRole("button", { name: "+ Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    const card = page.elementLocator(hoverCard().element().parentElement!);
    await expect
      .element(card.getByText("Learning", { exact: true }))
      .toBeVisible();
    expect(highlighted("lingo-learning")).toEqual(["tedious", "tedious"]);
    expect(background.sent("saveTerm")).toEqual([
      {
        type: "saveTerm",
        lang: "en",
        key: "tedious",
        display: "tedious",
        kind: "word",
        status: "learning",
        source: {
          platform: "web",
          url: location.href,
          title: document.title,
          lang: "en",
        },
        sentence: "It can feel tedious at first.",
        pos: { textQuote: "It can feel tedious at first." },
      },
    ]);
  });
});

describe("dictionary panel", () => {
  it("opens on a click with the entry, links and this page's sentences", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    const panel = dictionary();
    await expect.element(panel).toBeVisible();
    await expect
      .element(panel.getByRole("heading", { name: "tedious" }))
      .toBeVisible();
    await expect.element(panel.getByText("/ˈtiːdiəs/")).toBeVisible();
    await expect.element(panel.getByText("退屈な、面倒な")).toBeVisible();
    await expect
      .element(panel.getByText("退屈な；うんざりする；面倒な"))
      .toBeVisible();
    await expect
      .element(panel.getByRole("link", { name: "Cambridge" }))
      .toHaveAttribute(
        "href",
        "https://dictionary.cambridge.org/dictionary/english/tedious",
      );
    await expect.element(panel.getByText("On this page · 2")).toBeVisible();
    await expect
      .element(
        panel.getByRole("button", { name: "It can feel tedious at first." }),
      )
      .toBeVisible();
    await expect
      .element(
        panel.getByRole("button", {
          name: "Once you figure out a schedule, it is tedious no more.",
        }),
      )
      .toBeVisible();
    await expect.element(panel.getByText("Seen elsewhere · 0")).toBeVisible();
    await expect.element(panel.getByText(/^Not saved yet/)).toBeVisible();
    await expect
      .element(panel.getByRole("button", { name: "Not saved" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("sits on the right, below the page card", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    const box = dictionary().element().getBoundingClientRect();
    expect(box.right).toBeCloseTo(innerWidth - 16, 0);
    expect(box.top).toBeCloseTo(168, 0);
    expect(box.bottom).toBeCloseTo(innerHeight - 16, 0);
    expect(box.width).toBe(340);
  });

  it("outlines the clicked word", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    await expect.element(dictionary()).toBeVisible();
    const outline = document
      .querySelector("lingo-test-ui")!
      .shadowRoot!.querySelector("[data-outline]")!;
    expect(outline).not.toBeNull();
    const word = rectOf(root, "tedious");
    const box = outline.getBoundingClientRect();
    expect(box.left).toBeCloseTo(word.left - 6, 0);
    expect(box.right).toBeCloseTo(word.right + 6, 0);
    expect(getComputedStyle(outline).borderTopColor).toBe("rgb(11, 138, 108)");
  });

  it("changes the status: Learning, Known, then Remove", async () => {
    const { root, background } = await setup(ARTICLE, {
      settings: { highlight: { new: true, learning: true, known: true } },
    });
    await expect.poll(() => highlighted("lingo-new")).toContain("tedious");
    await clickOn(root, "tedious");
    const panel = dictionary();

    await panel.getByRole("button", { name: "Learning" }).click();
    await expect
      .element(panel.getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(highlighted("lingo-learning")).toEqual(["tedious", "tedious"]);
    expect(highlighted("lingo-new")).not.toContain("tedious");
    // Saved: the panel offers Remove and lists occurrences elsewhere (none yet).
    await expect
      .element(panel.getByRole("button", { name: "Remove" }))
      .toBeVisible();
    expect(panel.getByText(/^Not saved yet/).query()).toBeNull();

    await panel.getByRole("button", { name: "Known" }).click();
    await expect
      .element(panel.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(highlighted("lingo-known")).toEqual(
      expect.arrayContaining(["tedious", "tedious"]),
    );
    expect(highlighted("lingo-learning")).toEqual([]);
    expect(background.sent("setStatus")).toEqual([
      { type: "setStatus", id: "en:tedious", status: "known" },
    ]);

    await panel.getByRole("button", { name: "Remove" }).click();
    await expect
      .element(panel.getByRole("button", { name: "Not saved" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(background.sent("removeTerm")).toEqual([
      { type: "removeTerm", id: "en:tedious" },
    ]);
    await expect
      .poll(() => highlighted("lingo-new").filter((w) => w === "tedious"))
      .toHaveLength(2);
  });

  it("lists where a saved word was seen on other pages", async () => {
    const { root, background } = await setup(ARTICLE);
    await background.send({
      type: "saveTerm",
      lang: "en",
      key: "tedious",
      display: "tedious",
      kind: "word",
      status: "learning",
      source: {
        platform: "web",
        url: "https://www.example.org/other",
        title: "Another page",
        lang: "en",
      },
      sentence: "That was tedious.",
      pos: { textQuote: "That was tedious." },
    });
    await clickOn(root, "tedious");
    const panel = dictionary();
    await expect.element(panel.getByText("Seen elsewhere · 1")).toBeVisible();
    await expect.element(panel.getByText("Another page")).toBeVisible();
    await expect.element(panel.getByText("example.org")).toBeVisible();
    await expect.element(panel.getByText("That was tedious.")).toBeVisible();
  });

  it("scrolls to a sentence of this page", async () => {
    const { root } = await setup(ARTICLE);
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    await clickOn(root, "tedious");
    await dictionary()
      .getByRole("button", {
        name: "Once you figure out a schedule, it is tedious no more.",
      })
      .click();
    expect(scroll).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
    expect(scroll.mock.contexts[0]).toBe(root.children[1]);
    scroll.mockRestore();
  });

  it("speaks the headword in American English", async () => {
    const { root } = await setup(ARTICLE);
    const speak = vi
      .spyOn(speechSynthesis, "speak")
      .mockImplementation(() => {});
    await clickOn(root, "loaves");
    await dictionary()
      .getByRole("button", { name: "Play pronunciation" })
      .click();
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0]![0];
    expect(utterance.text).toBe("loaf");
    expect(utterance.lang).toBe("en-US");
    speak.mockRestore();
  });

  it("closes with × and with Escape", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    await dictionary()
      .getByRole("button", { name: "Close dictionary" })
      .click();
    await expect.poll(() => dictionary().query()).toBeNull();

    await clickOn(root, "knead");
    await expect.element(dictionary()).toBeVisible();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await expect.poll(() => dictionary().query()).toBeNull();
  });

  it("ignores clicks on links", async () => {
    const { root } = await setup(
      `<p>Read <a href="#nowhere" onclick="return false">tedious notes</a> here.</p>`,
    );
    await clickOn(root, "tedious");
    await new Promise((r) => setTimeout(r, 200));
    expect(dictionary().query()).toBeNull();
  });
});

describe("page card", () => {
  it("switches highlight categories in the settings", async () => {
    // The whole article is in view: keep the end card from taking the card's place.
    const { background, changeSettings } = await setup(ARTICLE, {
      settings: { offerSaveAllAtEnd: false },
    });
    const chip = page.getByRole("button", { name: "New", exact: true });
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect.element(chip).toHaveAttribute("aria-pressed", "true");
    expect(background.sent("setSettings")).toEqual([
      { type: "setSettings", patch: { highlight: { new: true } } },
    ]);
    expect(highlighted("lingo-new")).toContain("tedious");

    // Settings changed elsewhere (the settings page) show up on the card.
    changeSettings({
      ...background.settings(),
      highlight: { new: false, learning: false, known: true },
    });
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
    await expect
      .element(page.getByRole("button", { name: "Learning", exact: true }))
      .toHaveAttribute("aria-pressed", "false");
  });
});
