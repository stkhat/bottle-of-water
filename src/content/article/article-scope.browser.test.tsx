import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanUp, highlighted, pointAt, setup } from "./article-testing";

const PAGE = `
  <nav><p>Knead the tangy dough.</p></nav>
  <article>
    <h1>Bake a loaf</h1>
    <p>They knead the dough and bake loaves.</p>
    <p>It can feel tedious at first, and that is fine.</p>
  </article>
  <aside><p>Tedious schedule? Trace each rise and fall back to its cause.</p></aside>`;

const SHOW_ALL = { new: true, learning: true, known: true };
const BODY_NEW = ["knead", "loaf", "loaves", "tedious"];
const AROUND_NEW = [
  "Knead",
  "tangy",
  "Tedious",
  "schedule",
  "Trace",
  "rise",
  "fall",
  "cause",
];

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(cleanUp);

const newWords = () => highlighted("lingo-new").sort();
const historySentences = (
  background: Awaited<ReturnType<typeof setup>>["background"],
) =>
  background
    .sent("recordHistory")
    .flatMap((r) => r.sentences.map((s) => s.text));

describe("only the title and body (Settings → Articles)", () => {
  it("highlights the title and body, and words around them still show a hover card", async () => {
    const { root } = await setup(PAGE, { settings: { highlight: SHOW_ALL } });
    await expect.poll(newWords).toEqual(BODY_NEW);

    await pointAt(root, "schedule");
    await expect
      .element(page.getByRole("button", { name: "Details" }))
      .toBeVisible();
    expect(newWords()).toEqual(BODY_NEW);
  });

  it("keeps only the title and body in the sentence history", async () => {
    const { background } = await setup(PAGE, {
      settings: { highlight: SHOW_ALL },
    });
    await expect.poll(newWords).toEqual(BODY_NEW);
    await expect
      .poll(() => historySentences(background))
      .toEqual([
        "Bake a loaf",
        "They knead the dough and bake loaves.",
        "It can feel tedious at first, and that is fine.",
      ]);
  });

  it("records saved words met in the title and body only", async () => {
    const { background } = await setup(PAGE, {
      settings: { highlight: SHOW_ALL },
      async before(bg) {
        await bg.send({
          type: "saveTerm",
          lang: "en",
          key: "tedious",
          display: "tedious",
          kind: "word",
          status: "learning",
          source: {
            platform: "web",
            url: "https://other.example/",
            title: "Other",
            lang: "en",
          },
          sentence: "So tedious.",
          pos: { textQuote: "So tedious." },
        });
      },
    });
    await expect.poll(() => historySentences(background)).toHaveLength(3);
    expect(
      background
        .sent("recordEncounters")
        .flatMap((r) => r.items.map((i) => i.sentence)),
    ).toEqual(["It can feel tedious at first, and that is fine."]);
  });

  it("covers the whole page once switched off, without analyzing again", async () => {
    const { background, changeSettings } = await setup(PAGE, {
      settings: { highlight: SHOW_ALL },
    });
    await expect.poll(newWords).toEqual(BODY_NEW);
    await expect.poll(() => historySentences(background)).toHaveLength(3);
    const analyzed = background.sent("analyze").length;

    changeSettings({ ...background.settings(), articleMainOnly: false });
    await expect.poll(newWords).toEqual([...BODY_NEW, ...AROUND_NEW].sort());
    expect(background.sent("analyze")).toHaveLength(analyzed);
    await expect
      .poll(() => historySentences(background))
      .toEqual(
        expect.arrayContaining([
          "Knead the tangy dough.",
          "Trace each rise and fall back to its cause.",
        ]),
      );

    changeSettings({ ...background.settings(), articleMainOnly: true });
    await expect.poll(newWords).toEqual(BODY_NEW);
  });

  it("highlights the whole page while switched off", async () => {
    await setup(PAGE, {
      settings: { highlight: SHOW_ALL, articleMainOnly: false },
    });
    await expect.poll(newWords).toEqual([...BODY_NEW, ...AROUND_NEW].sort());
  });
});
