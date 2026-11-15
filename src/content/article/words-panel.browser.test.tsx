import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Request } from "../../messaging/protocol";
import {
  cleanUp,
  clickOn,
  dictionary,
  rangeOfText,
  setup,
} from "../../testing/article";

const SHOW_ALL = { new: true, learning: true, known: true };

/** Three places of "knead", the last one far below the first screen. */
const ARTICLE = `
  <article>
    <h1>Patient bakers</h1>
    <p>They knead the dough and wait.</p>
    <p>Then knead it slowly.</p>
    <div style="height: 2400px"></div>
    <p id="far">Knead the dough again until tangy.</p>
    <div style="height: 1200px"></div>
  </article>
  <p>Footer zorble.</p>`;

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(async () => {
  await cleanUp();
  scrollTo(0, 0);
});

const panel = () => page.getByRole("complementary", { name: "Lingo words" });
const heads = () =>
  [
    ...panel()
      .element()
      .querySelectorAll("[data-word-row] > button > span:first-child"),
  ].map((head) => head.textContent);

/** The UI's shadow root (the test host's, open). */
const ui = () => document.querySelector("lingo-test-ui")!.shadowRoot!;
const outlines = () => ui().querySelectorAll("[data-outline]").length;
/** The hover card's "Details" button: there is one only while the card shows. */
const details = () => page.getByRole("button", { name: "Details" });
/** A row's head (its highlighted term). */
const head = (term: string) =>
  [
    ...panel()
      .element()
      .querySelectorAll<HTMLElement>(
        "[data-word-row] > button > span:first-child",
      ),
  ].find((el) => el.textContent === term)!;

async function open(html = ARTICLE) {
  const started = await setup(html, { settings: { highlight: SHOW_ALL } });
  await started.session.handlePageRequest({ type: "pageShowWords" });
  await expect.element(panel()).toBeVisible();
  return started;
}

describe("Words on this page", () => {
  it("opens from the popup's request, analyzing the whole article", async () => {
    const { session, root } = await setup(ARTICLE, {
      settings: { highlight: SHOW_ALL },
    });
    const far = document.getElementById("far")!;
    // Below the first screen: not analyzed yet.
    expect([...session.spans.keys()].some((b) => b.element === far)).toBe(
      false,
    );
    expect(panel().query()).toBeNull();
    const summary = await session.handlePageRequest({ type: "pageShowWords" });
    expect(summary.scope).toBe("page");
    await expect.element(panel()).toBeVisible();
    await expect.poll(heads).toContain("tangy");
    // The footer is not part of the article.
    expect(heads()).not.toContain("zorble");
    expect(root.contains(far)).toBe(true);
  });

  it("looks as in the mock: 360 px at the right, 16 px from the edges", async () => {
    await open();
    const box = panel().element().getBoundingClientRect();
    expect(box.width).toBe(360);
    expect(box.top).toBe(16);
    expect(innerWidth - box.right).toBe(16);
    expect(innerHeight - box.bottom).toBe(16);
    const style = getComputedStyle(panel().element());
    expect(style.borderTopLeftRadius).toBe("12px");
    expect(style.position).toBe("fixed");
    await expect
      .element(panel().getByRole("heading", { name: "Words on this page" }))
      .toBeVisible();
    await expect
      .element(panel().getByRole("group", { name: "Show words" }))
      .toBeVisible();
    await expect
      .element(panel().getByRole("combobox", { name: "Sort" }))
      .toHaveValue("order");
  });

  it("lists each term once over every block, in reading order, with a chip per place", async () => {
    await open();
    await expect.poll(heads).toContain("tangy");
    const list = heads();
    expect(list.indexOf("knead")).toBeGreaterThanOrEqual(0);
    expect(list.indexOf("knead")).toBeLessThan(list.indexOf("tangy"));
    // "the" is known by the level only.
    expect(list).not.toContain("the");
    const knead = panel().getByRole("group", { name: "Places of knead" });
    expect(
      [...knead.element().querySelectorAll("button")].map((b) => [
        b.textContent,
        b.getAttribute("aria-label"),
      ]),
    ).toEqual([
      ["1", "Go to knead, 1 of 3"],
      ["2", "Go to knead, 2 of 3"],
      ["3", "Go to knead, 3 of 3"],
    ]);
    const row = panel().getByRole("button", {
      name: "knead, open in the dictionary",
    });
    expect(row.element().textContent).toBe("knead（生地を）こねる3×");
    // One place: one chip, the only way to go there.
    const tangy = panel().getByRole("group", { name: "Places of tangy" });
    expect(
      [...tangy.element().querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["1"]);
  });

  it("a chip scrolls its place to the middle of the view and outlines it for a moment", async () => {
    const { root } = await open();
    const chip = panel().getByRole("button", { name: "Go to knead, 3 of 3" });
    await chip.click();
    const middle = () => {
      const rect = rangeOfText(root, "Knead", 0).getBoundingClientRect();
      return Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
    };
    await expect.poll(middle, { timeout: 3000 }).toBeLessThan(4);
    expect(outlines()).toBe(1);
    // The outline is over the word, where it is now.
    const word = rangeOfText(root, "Knead", 0).getBoundingClientRect();
    const outline = ui()
      .querySelector("[data-outline]")!
      .getBoundingClientRect();
    expect(outline.left).toBeLessThan(word.left);
    expect(outline.right).toBeGreaterThan(word.right);
    expect(outline.top).toBeLessThan(word.top);
    expect(outline.bottom).toBeGreaterThan(word.bottom);
    await expect.element(chip).toHaveAttribute("aria-pressed", "true");
    const row = chip.element().closest("[data-word-row]")!;
    expect(row.getAttribute("data-selected")).toBe("true");
    await expect.poll(outlines, { timeout: 3000 }).toBe(0);
    // The list goes nowhere else: no dictionary.
    expect(dictionary().query()).toBeNull();
  });

  it("a row opens its term's dictionary panel left of the list, going nowhere and outlining nothing", async () => {
    await open();
    await expect.poll(heads).toContain("tangy");
    await panel()
      .getByRole("button", { name: "tangy, open in the dictionary" })
      .click();
    await expect.element(dictionary()).toBeVisible();
    await expect
      .element(dictionary().getByRole("heading", { name: "tangy" }))
      .toBeVisible();
    const box = dictionary().element().getBoundingClientRect();
    expect(innerWidth - box.right).toBe(16 + 360 + 16);
    // "tangy" is far below: the page stays where it is, and nothing is outlined.
    await new Promise((done) => setTimeout(done, 300));
    expect(scrollY).toBe(0);
    expect(outlines()).toBe(0);
    expect(
      panel().element().querySelector("[data-word-row][data-selected=true]"),
    ).toBeNull();
    // Another row switches the panel to its term.
    await panel()
      .getByRole("button", { name: "knead, open in the dictionary" })
      .click();
    await expect
      .element(dictionary().getByRole("heading", { name: "knead" }))
      .toBeVisible();
  });

  it("a row's head shows its term's card by the head, kept while the pointer is on the card", async () => {
    await open();
    await expect.poll(heads).toContain("tangy");
    const tangy = head("tangy");
    await userEvent.hover(tangy);
    await expect.element(details()).toBeVisible();
    const word = tangy.getBoundingClientRect();
    const card = details().element().parentElement!.parentElement!;
    const box = card.getBoundingClientRect();
    // Over the head (or under it, without room above), never covering it.
    expect(box.bottom <= word.top || box.top >= word.bottom).toBe(true);
    expect(card.textContent).toContain("tangy");
    // From the head onto the card: it stays; its Details opens the panel.
    await userEvent.hover(details());
    await new Promise((done) => setTimeout(done, 400));
    await details().click();
    await expect.element(dictionary()).toBeVisible();
    expect(details().query()).toBeNull();
  });

  it("the head's card goes when the pointer leaves it, or when the list scrolls", async () => {
    await open();
    await expect.poll(heads).toContain("tangy");
    await userEvent.hover(head("tangy"));
    await expect.element(details()).toBeVisible();
    await userEvent.hover(
      panel().getByRole("heading", { name: "Words on this page" }),
    );
    await expect.poll(() => details().query()).toBeNull();

    await userEvent.hover(head("knead"));
    await expect.element(details()).toBeVisible();
    head("knead")
      .closest("[data-word-row]")!
      .parentElement!.dispatchEvent(new Event("scroll"));
    await expect.poll(() => details().query()).toBeNull();
  });

  it("the dictionary panel opens left of it while it is open", async () => {
    const { root } = await open();
    await clickOn(root, "knead");
    await expect.element(dictionary()).toBeVisible();
    const box = dictionary().element().getBoundingClientRect();
    expect(innerWidth - box.right).toBe(16 + 360 + 16);
    expect(box.top).toBe(16);

    await panel().getByRole("button", { name: "Close words" }).click();
    expect(panel().query()).toBeNull();
    await expect
      .poll(
        () => innerWidth - dictionary().element().getBoundingClientRect().right,
      )
      .toBe(16);
  });

  it("follows saves and page changes", async () => {
    const { root } = await open();
    await expect.poll(heads).toContain("tangy");
    const learning = () =>
      panel()
        .getByRole("button", { name: /^Learning/ })
        .element().textContent;
    expect(learning()).toBe("Learning 0");

    await clickOn(root, "knead");
    await dictionary().getByRole("button", { name: "Learning" }).click();
    await expect.poll(learning).toBe("Learning 1");

    const added = document.createElement("p");
    added.textContent = "Knead it once more.";
    document.getElementById("far")!.after(added);
    await expect
      .element(panel().getByRole("button", { name: "Go to knead, 4 of 4" }))
      .toBeVisible();
  });

  it("follows the title-and-body switch and blocks that go away", async () => {
    const { background } = await open(`
      <article>
        <h1>Patient bakers</h1>
        <p>They knead the dough and wait.</p>
        <p id="tangy">Then knead it until tangy.</p>
      </article>
      <div style="height: 2400px"></div>
      <aside><p>Trace each rise and fall back to its cause.</p></aside>`);
    await expect.poll(heads).toContain("tangy");
    expect(heads()).not.toContain("rise");

    // Far below and never analyzed: the list analyzes it once it counts.
    background.changeSettings({ articleMainOnly: false });
    await expect.poll(heads).toContain("rise");

    background.changeSettings({ articleMainOnly: true });
    await expect.poll(heads).not.toContain("rise");
    expect(heads()).toContain("tangy");

    document.getElementById("tangy")!.remove();
    await expect.poll(heads).not.toContain("tangy");
    expect(heads()).toContain("knead");
  });

  it("records the parts it analyzes early only once the reader gets there", async () => {
    const requests: Request[] = [];
    const { session } = await setup(ARTICLE, {
      settings: { highlight: SHOW_ALL },
      beforeRequest: async (request) => {
        requests.push(request);
      },
      before: async (bg) => {
        await bg.send({
          type: "saveTerm",
          lang: "en",
          key: "tangy",
          display: "tangy",
          kind: "word",
          status: "learning",
          source: {
            platform: "web",
            url: "https://example.com/",
            title: "",
            lang: "en",
          },
          sentence: "It tastes tangy.",
          pos: { textQuote: "It tastes tangy." },
        });
      },
    });
    const FAR = "Knead the dough again until tangy.";
    const history = () =>
      requests.flatMap((r) =>
        r.type === "recordHistory" ? r.sentences.map((s) => s.text) : [],
      );
    const encounters = () =>
      requests.flatMap((r) =>
        r.type === "recordEncounters" ? r.items.map((i) => i.sentence) : [],
      );
    await expect.poll(history).toContain("Then knead it slowly.");

    await session.handlePageRequest({ type: "pageShowWords" });
    await expect.poll(heads).toContain("tangy");
    // Analyzed for the list, but not read yet: nothing recorded.
    expect(history()).not.toContain(FAR);
    expect(encounters()).not.toContain(FAR);

    document.getElementById("far")!.scrollIntoView({ block: "center" });
    await expect.poll(history).toContain(FAR);
    await expect.poll(encounters).toContain(FAR);
    expect(history().filter((text) => text === FAR)).toHaveLength(1);
  });

  it("closes with ×", async () => {
    await open();
    await panel().getByRole("button", { name: "Close words" }).click();
    expect(panel().query()).toBeNull();
  });
});
