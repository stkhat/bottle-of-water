import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
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
      .querySelectorAll("[data-word-row] > button > span > span:first-child"),
  ].map((head) => head.textContent);

/** The UI's shadow root (the test host's, open). */
const ui = () => document.querySelector("lingo-test-ui")!.shadowRoot!;
const outlines = () => ui().querySelectorAll("[data-outline]").length;

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
      name: "knead, go to the first one",
    });
    expect(row.element().textContent).toContain("knead3×");
    // One place: no chips.
    expect(
      panel().getByRole("group", { name: "Places of tangy" }).query(),
    ).toBeNull();
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

  it("a row goes to the first place", async () => {
    const { root } = await open();
    await panel().getByRole("button", { name: "Go to knead, 3 of 3" }).click();
    await expect.poll(() => scrollY, { timeout: 3000 }).toBeGreaterThan(1000);
    await panel()
      .getByRole("button", { name: "knead, go to the first one" })
      .click();
    await expect
      .poll(
        () => {
          const rect = rangeOfText(root, "knead", 0).getBoundingClientRect();
          return rect.top > 0 && rect.bottom < innerHeight;
        },
        { timeout: 3000 },
      )
      .toBe(true);
    await expect
      .element(panel().getByRole("button", { name: "Go to knead, 1 of 3" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(dictionary().query()).toBeNull();
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

  it("closes with ×", async () => {
    await open();
    await panel().getByRole("button", { name: "Close words" }).click();
    expect(panel().query()).toBeNull();
  });
});
