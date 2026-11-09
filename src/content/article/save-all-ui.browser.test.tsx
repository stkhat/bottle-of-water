import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  cleanUp,
  clickOn,
  dictionary,
  highlighted,
  setup,
} from "./article-testing";

const ARTICLE = `
  <article>
    <p>They knead the dough and bake loaves.</p>
    <div style="height: 1600px"></div>
    <p id="last">The tangy yeast.</p>
  </article>
  <p>Footer zorble.</p>`;

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(async () => {
  await cleanUp();
  scrollTo(0, 0);
});

const endCard = () =>
  page.getByRole("region", { name: "Save the rest of this page" });
const pageCard = () => page.getByText("English page · EN → JA");
const toEnd = () =>
  document.getElementById("last")!.scrollIntoView({ block: "center" });
const NEW_WORDS = ["knead", "loaves", "tangy", "yeast"];

describe("end of the article", () => {
  it("replaces the page card with the end card once the last paragraph shows", async () => {
    await setup(ARTICLE);
    await expect.element(pageCard()).toBeVisible();
    expect(endCard().query()).toBeNull();

    toEnd();
    await expect.element(endCard()).toBeVisible();
    await expect
      .element(endCard().getByText("You reached the end"))
      .toBeVisible();
    await expect
      .element(endCard().getByText("4 words not saved yet"))
      .toBeVisible();
    expect(pageCard().query()).toBeNull();
  });

  it("sits above the dictionary panel, which it overlaps", async () => {
    const { root } = await setup(ARTICLE);
    toEnd();
    await expect.element(endCard()).toBeVisible();
    await clickOn(root, "tangy");
    await expect.element(dictionary()).toBeVisible();
    const card = endCard().element().getBoundingClientRect();
    expect(dictionary().element().getBoundingClientRect().top).toBeLessThan(
      card.bottom,
    );
    const shadow = document.querySelector("lingo-test-ui")!.shadowRoot!;
    const top = shadow.elementFromPoint(card.left + 20, card.bottom - 4);
    expect(endCard().element().contains(top)).toBe(true);
  });

  it("brings the page card back on × and does not come again", async () => {
    await setup(ARTICLE);
    toEnd();
    await endCard().getByRole("button", { name: "Close" }).click();
    await expect.element(pageCard()).toBeVisible();
    scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 100));
    toEnd();
    await new Promise((r) => setTimeout(r, 300));
    expect(endCard().query()).toBeNull();
  });

  it("is not offered when turned off in the settings", async () => {
    await setup(ARTICLE, { settings: { offerSaveAllAtEnd: false } });
    toEnd();
    await new Promise((r) => setTimeout(r, 400));
    expect(endCard().query()).toBeNull();
    await expect.element(pageCard()).toBeVisible();
  });

  it("is not offered when every word is saved", async () => {
    await setup(`<article><p>The dough.</p><p>Bake it.</p></article>`);
    await new Promise((r) => setTimeout(r, 400));
    expect(endCard().query()).toBeNull();
  });

  it("adds every unsaved new word, and undoes it", async () => {
    const { background } = await setup(ARTICLE, {
      settings: { highlight: { new: true, learning: true, known: false } },
    });
    toEnd();
    await endCard()
      .getByRole("button", { name: "Add all to Learning" })
      .click();
    await expect
      .element(endCard().getByText("4 words added to Learning"))
      .toBeVisible();
    await expect
      .element(endCard().getByText("Every word is saved"))
      .toBeVisible();
    expect(background.sent("saveAll")).toEqual([
      {
        type: "saveAll",
        lang: "en",
        keys: ["knead", "loaf", "tangy", "yeast"],
        status: "learning",
        source: {
          platform: "web",
          url: location.href,
          title: document.title,
          lang: "en",
        },
      },
    ]);
    expect(highlighted("lingo-learning").sort()).toEqual(NEW_WORDS);
    expect(highlighted("lingo-new")).toEqual([]);

    await endCard().getByRole("button", { name: "Undo" }).click();
    await expect
      .element(endCard().getByText("4 words not saved yet"))
      .toBeVisible();
    expect(
      endCard()
        .getByText(/added to Learning/)
        .query(),
    ).toBeNull();
    expect(background.sent("undoSaveAll")).toHaveLength(1);
    expect(highlighted("lingo-new").sort()).toEqual(NEW_WORDS);
    expect(highlighted("lingo-learning")).toEqual([]);
    // Undone in the store too.
    expect(
      (await background.send({ type: "counts", lang: "en" })).learning,
    ).toBe(0);
  });
});

describe("page requests from the popup", () => {
  it("answers with the same state as the end card", async () => {
    const { session } = await setup(ARTICLE);
    toEnd();
    await expect.element(endCard()).toBeVisible();
    expect(await session.handlePageRequest({ type: "pageSummary" })).toEqual({
      supported: true,
      unsaved: 4,
      done: null,
    });

    expect(
      await session.handlePageRequest({ type: "pageSaveAll", status: "known" }),
    ).toEqual({
      supported: true,
      unsaved: 0,
      done: { count: 4, target: "known" },
    });
    await expect
      .element(endCard().getByText("4 words added to Known"))
      .toBeVisible();

    expect(await session.handlePageRequest({ type: "pageUndo" })).toEqual({
      supported: true,
      unsaved: 4,
      done: null,
    });
    await expect
      .element(endCard().getByText("4 words not saved yet"))
      .toBeVisible();
  });
});

const OTHER_PAGE = {
  platform: "web" as const,
  url: "https://example.org/other",
  title: "Other",
  lang: "en",
};

describe("re-occurrences", () => {
  it("records saved terms met on the page, once per sentence", async () => {
    const { background, changeSettings } = await setup(
      `<p>It can feel tedious at first. The dough is tedious.</p><p>So tedious.</p>`,
      {
        async before(background) {
          await background.send({
            type: "saveTerm",
            lang: "en",
            key: "tedious",
            display: "tedious",
            kind: "word",
            status: "learning",
            source: OTHER_PAGE,
            sentence: "That was tedious.",
            pos: { textQuote: "That was tedious." },
          });
        },
      },
    );
    const source = {
      platform: "web",
      url: location.href,
      title: document.title,
      lang: "en",
    };
    const item = (sentence: string) => ({
      termId: "en:tedious",
      sentence,
      pos: { textQuote: sentence },
    });
    await expect
      .poll(() => background.sent("recordEncounters"))
      .toEqual([
        {
          type: "recordEncounters",
          source,
          items: [
            item("It can feel tedious at first."),
            item("The dough is tedious."),
            item("So tedious."),
          ],
        },
      ]);

    // Analyzing again records nothing new.
    await background.send({ type: "setSettings", patch: { knownLevel: 2000 } });
    changeSettings(background.settings());
    await expect
      .poll(() => background.sent("analyze").length)
      .toBeGreaterThan(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(background.sent("recordEncounters")).toHaveLength(1);
  });
});

describe("known level", () => {
  it("classifies the page again when the level changes", async () => {
    const { background, changeSettings } = await setup(
      `<p>They knead the dough.</p>`,
      { settings: { highlight: { new: true, learning: true, known: false } } },
    );
    await expect.poll(() => highlighted("lingo-new")).toEqual(["knead"]);
    await background.send({ type: "setSettings", patch: { knownLevel: 2000 } });
    changeSettings(background.settings());
    await expect
      .poll(() => highlighted("lingo-new").sort())
      .toEqual(["dough", "knead"]);
  });
});
