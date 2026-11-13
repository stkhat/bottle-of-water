import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  cleanUp,
  clickOn,
  dictionary,
  highlighted,
  pointAt,
  pointTo,
  rectOf,
  setup,
} from "../../testing/article";
import { testBackground } from "../../testing/background";

const ARTICLE = `
  <p>They knead the dough and bake loaves.</p>
  <p>It can feel tedious at first. Once you figure out a schedule, it is tedious no more.</p>
  <p>So you can trace each rise and fall back to its cause.</p>`;

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(cleanUp);

/** The hover card's "Details" button: there is one only while the card shows. */
const details = () => page.getByRole("button", { name: "Details" });
const hoverCard = details;
/** The hover card's root: the box around the row of buttons. */
const cardRoot = () => details().element().parentElement!.parentElement!;
const hoverBox = () => cardRoot().getBoundingClientRect();

describe("hover card", () => {
  it("appears 250 ms after the pointer rests on a word, above it", async () => {
    const { root } = await setup(`<div style="height: 200px"></div>${ARTICLE}`);
    const started = performance.now();
    await pointAt(root, "tedious");
    await new Promise((r) => setTimeout(r, 150));
    expect(hoverCard().query()).toBeNull();

    await expect.element(hoverCard()).toBeVisible();
    expect(performance.now() - started).toBeGreaterThanOrEqual(250);
    // The hover card shows the senses (here one), the panel the short meaning.
    await expect
      .element(page.getByText("退屈な；うんざりする；面倒な"))
      .toBeVisible();
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
    await expect.element(page.getByText("（パンなどの）ひと塊")).toBeVisible();
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

  it("shows a word known by its frequency as Known; Known saves it", async () => {
    const { root, background } = await setup(ARTICLE);
    await pointAt(root, "feel");
    await expect.element(hoverCard()).toBeVisible();
    const card = page.elementLocator(cardRoot());
    await expect
      .element(card.getByText("Known", { exact: true }).first())
      .toBeVisible();
    expect(card.getByText("New · not saved").query()).toBeNull();
    const known = card.getByRole("button", { name: "Known" });
    await expect.element(known).toHaveAttribute("aria-pressed", "true");
    await known.click();
    await expect.poll(() => background.sent("saveTerm").length).toBe(1);
    expect(background.sent("saveTerm")[0]).toMatchObject({
      key: "feel",
      status: "known",
    });
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
    const card = page.elementLocator(cardRoot());
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

  it("sits in the top right corner", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    await expect.element(dictionary()).toBeVisible();
    const box = dictionary().element().getBoundingClientRect();
    expect(box.right).toBeCloseTo(innerWidth - 16, 0);
    expect(box.top).toBeCloseTo(16, 0);
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
    await expect.element(panel.getByText("example.org · Today")).toBeVisible();
    await expect.element(panel.getByText("That was tedious.")).toBeVisible();
  });

  it("lists sentences kept from another page for an unsaved word", async () => {
    const address = location.href;
    const title = document.title;
    const visit = (page: string, pageTitle: string) => {
      const url = new URL(address);
      url.searchParams.set("lingo-page", page);
      history.replaceState(null, "", url);
      document.title = pageTitle;
    };
    const background = testBackground();
    try {
      visit("a", "Bread notes");
      await setup("<p>Kneading by hand is tedious work.</p>", { background });
      await expect
        .poll(
          async () => (await background.send({ type: "historyStatus" })).pages,
        )
        .toBe(1);
      await cleanUp();

      visit("b", "Another page");
      const { root } = await setup(ARTICLE, { background });
      await clickOn(root, "tedious");
      const panel = dictionary();
      await expect.element(panel.getByText("Seen elsewhere · 1")).toBeVisible();
      await expect.element(panel.getByText("Bread notes")).toBeVisible();
      await expect
        .element(panel.getByText(`${location.hostname} · Today`))
        .toBeVisible();
      await expect
        .element(panel.getByText("Kneading by hand is tedious work."))
        .toBeVisible();
      expect(panel.getByText(/^Not saved yet/).query()).toBeNull();
      await expect
        .element(panel.getByRole("button", { name: "Not saved" }))
        .toHaveAttribute("aria-pressed", "true");
    } finally {
      await cleanUp();
      await background.close();
      history.replaceState(null, "", address);
      document.title = title;
    }
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
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dictionary().query()).toBeNull();
  });

  it("a press elsewhere on the page closes it; a press on another word switches to it", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    await expect
      .element(dictionary().getByRole("heading", { name: "tedious" }))
      .toBeVisible();
    // Pressing in the panel keeps it.
    await dictionary().getByRole("heading", { name: "tedious" }).click();
    await clickOn(root, "knead");
    await expect
      .element(dictionary().getByRole("heading", { name: "knead" }))
      .toBeVisible();

    // A press a page script makes is not the user's.
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(dictionary().query()).not.toBeNull();

    // Past the end of the first line: no word there.
    const line = rectOf(root, "loaves.");
    await userEvent.pointer({
      coords: { x: line.right + 40, y: line.top + line.height / 2 },
      keys: "[MouseLeft]",
    });
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

  it("opens from the hover card's Details, also for a word in a link", async () => {
    const { root } = await setup(
      `<p>Read <a href="#nowhere" onclick="return false">tedious notes</a> here.</p>`,
    );
    await pointAt(root, "tedious");
    await expect.element(details()).toBeVisible();
    expect(page.getByText("Click the word for details").query()).toBeNull();
    await details().click();
    await expect.element(dictionary()).toBeVisible();
    await expect
      .element(dictionary().getByText("退屈な、面倒な").first())
      .toBeVisible();
    await expect.poll(() => details().query()).toBeNull();
    expect(location.hash).not.toBe("#nowhere");
  });
});

describe("events a page script makes", () => {
  /** The init of a mouse event at the middle of a word, as a page script could make it. */
  function at(root: Node, text: string): MouseEventInit {
    const rect = rectOf(root, text);
    return {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: rect.left + 3,
      clientY: rect.top + rect.height / 2,
    };
  }
  const target = (root: Node, text: string) =>
    document.elementFromPoint(
      at(root, text).clientX!,
      at(root, text).clientY!,
    )!;

  it("a synthetic click opens no dictionary; the user's click does", async () => {
    const { root } = await setup(ARTICLE);
    target(root, "tedious").dispatchEvent(
      new MouseEvent("click", at(root, "tedious")),
    );
    (target(root, "tedious") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 200));
    expect(dictionary().query()).toBeNull();

    await clickOn(root, "tedious");
    await expect.element(dictionary()).toBeVisible();
  });

  it("a synthetic pointer move shows no hover card; the user's does", async () => {
    const { root } = await setup(`<div style="height: 200px"></div>${ARTICLE}`);
    target(root, "tedious").dispatchEvent(
      new PointerEvent("pointermove", at(root, "tedious")),
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(hoverCard().query()).toBeNull();

    await pointAt(root, "tedious");
    await expect.element(hoverCard()).toBeVisible();
  });

  it("a synthetic Escape leaves the dictionary open", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    await expect.element(dictionary()).toBeVisible();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(dictionary().query()).not.toBeNull();
  });

  it("a synthetic click on the dictionary's status buttons changes nothing", async () => {
    const { root, background } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    const learning = dictionary().getByRole("button", {
      name: "Learning",
      exact: true,
    });
    await expect.element(learning).toBeVisible();
    learning
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    (learning.element() as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 200));
    expect(background.sent("saveTerm")).toEqual([]);

    await learning.click();
    await expect.poll(() => background.sent("saveTerm").length).toBe(1);
  });

  it("a page script's .click() on the dictionary's close button leaves it open", async () => {
    const { root } = await setup(ARTICLE);
    await clickOn(root, "tedious");
    const close = dictionary().getByRole("button", {
      name: "Close dictionary",
    });
    await expect.element(close).toBeVisible();
    (close.element() as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 100));
    expect(dictionary().query()).not.toBeNull();

    await close.click();
    await expect.element(dictionary()).not.toBeInTheDocument();
  });
});

describe("the page", () => {
  it("has no Lingo card, and highlights follow settings changed elsewhere", async () => {
    const { background } = await setup(ARTICLE);
    background.changeSettings({
      highlight: { new: true, learning: true, known: false },
    });
    await expect.poll(() => highlighted("lingo-new")).toContain("tedious");
    expect(page.getByRole("button", { name: "New", exact: true }).query()).toBe(
      null,
    );
    expect(page.getByText("You reached the end").query()).toBe(null);
  });
});

describe("dictionary phrases", () => {
  const PHRASES = `
    <div style="height: 200px"></div>
    <p>They bake it from scratch.</p>
    <p>Once you figure out the schedule, bake it.</p>`;
  const withNew = {
    highlight: { new: true, learning: true, known: false },
  };

  it("highlights a detected phrase as one new term with its Japanese meaning", async () => {
    const { root } = await setup(PHRASES, { settings: withNew });
    await expect
      .poll(() => highlighted("lingo-new"))
      .toEqual(["from scratch", "figure out", "schedule"]);

    await pointAt(root, "scratch");
    await expect.element(hoverCard()).toBeVisible();
    await expect
      .element(page.getByText("Phrase", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("最初から", { exact: true }))
      .toHaveAttribute("lang", "ja");

    await clickOn(root, "scratch");
    const panel = dictionary();
    await expect
      .element(panel.getByRole("heading", { name: "from scratch" }))
      .toBeVisible();
    await expect
      .element(panel.getByText("ゼロから"))
      .toHaveAttribute("lang", "ja");
  });

  it("translates a phrase's English definition: the card's meaning, then the panel's senses with their English", async () => {
    const translated: string[] = [];
    const background = testBackground(withNew);
    try {
      const { root } = await setup(PHRASES, {
        background,
        translator: {
          translate: async (text) => {
            translated.push(text);
            return `訳: ${text}`;
          },
        },
      });
      await pointAt(root, "figure");
      await expect.element(hoverCard()).toBeVisible();
      await expect
        .element(page.getByText("訳: To come to understand", { exact: true }))
        .toHaveAttribute("lang", "ja");
      await expect
        .element(page.getByText("Machine translation", { exact: true }))
        .toBeVisible();

      await clickOn(root, "figure");
      const panel = dictionary();
      await expect
        .element(panel.getByRole("heading", { name: "figure out" }))
        .toBeVisible();
      await expect
        .element(
          panel.getByText(
            "訳: To come to understand; to discover or find a solution.",
          ),
        )
        .toHaveAttribute("lang", "ja");
      await expect
        .element(
          panel.getByText(
            "To come to understand; to discover or find a solution.",
            { exact: true },
          ),
        )
        .toHaveAttribute("lang", "en");
      // Once, on the Meanings heading: the short line has no mark of its own.
      await expect
        .element(panel.getByText("Machine translation", { exact: true }))
        .toBeVisible();
      await expect
        .element(panel.getByText("訳: To come to understand", { exact: true }))
        .toHaveAttribute("lang", "ja");
      expect(translated).toEqual([
        "To come to understand",
        "To come to understand; to discover or find a solution.",
      ]);

      // Another page: the translations come from the cache, without the translator.
      await cleanUp();
      const again = await setup(PHRASES, {
        background,
        translator: { translate: () => new Promise(() => {}) },
      });
      await clickOn(again.root, "figure");
      await expect
        .element(
          dictionary().getByText(
            "訳: To come to understand; to discover or find a solution.",
          ),
        )
        .toBeVisible();
      await expect
        .element(
          dictionary().getByText("訳: To come to understand", { exact: true }),
        )
        .toBeVisible();
    } finally {
      await cleanUp();
      await background.close();
    }
  });

  it("shows a phrase's English definition as English without a translator", async () => {
    const { root } = await setup(PHRASES, { settings: withNew });
    await pointAt(root, "figure");
    await expect.element(hoverCard()).toBeVisible();
    await expect
      .element(page.getByText("To come to understand", { exact: true }))
      .toHaveAttribute("lang", "en");
    expect(page.getByText("Machine translation").query()).toBeNull();

    await clickOn(root, "figure");
    const panel = dictionary();
    await expect
      .element(panel.getByRole("heading", { name: "figure out" }))
      .toBeVisible();
    await expect
      .element(panel.getByText("To come to understand", { exact: true }))
      .toHaveAttribute("lang", "en");
    await expect
      .element(
        panel.getByText(
          "To come to understand; to discover or find a solution.",
        ),
      )
      .toHaveAttribute("lang", "en");
    expect(panel.getByText("Machine translation").query()).toBeNull();
  });
});
