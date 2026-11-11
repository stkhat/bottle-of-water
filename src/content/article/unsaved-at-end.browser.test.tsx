import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { cleanUp, highlighted, setup } from "./article-testing";

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

const toEnd = () =>
  document.getElementById("last")!.scrollIntoView({ block: "center" });
const NEW_WORDS = ["knead", "loaves", "tangy", "yeast"];
const SHOW_ALL = { new: true, learning: true, known: true };

describe("unsaved new words at the end of the article", () => {
  it("are marked Known when Settings say so", async () => {
    const { background } = await setup(ARTICLE, {
      settings: { unsavedAtEnd: "known", highlight: SHOW_ALL },
    });
    await expect
      .poll(() => highlighted("lingo-new"))
      .toEqual(["knead", "loaves"]);
    toEnd();
    await expect.poll(() => background.sent("saveAll").length).toBe(1);
    expect(background.sent("saveAll")).toEqual([
      {
        type: "saveAll",
        lang: "en",
        keys: ["knead", "loaf", "tangy", "yeast"],
        status: "known",
        source: {
          platform: "web",
          url: location.href,
          title: document.title,
          lang: "en",
        },
      },
    ]);
    await expect.poll(() => highlighted("lingo-new")).toEqual([]);
    expect(highlighted("lingo-known")).toEqual(
      expect.arrayContaining(NEW_WORDS),
    );
    // Nothing shows on the page, and scrolling back and down again saves nothing more.
    expect(page.getByText("You reached the end").query()).toBeNull();
    scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 100));
    toEnd();
    await new Promise((r) => setTimeout(r, 300));
    expect(background.sent("saveAll")).toHaveLength(1);
  });

  it("leave out words around the article (menus, sidebars, related links)", async () => {
    const { background } = await setup(
      `<nav><p>Trace the schedule.</p></nav>${ARTICLE}`,
      { settings: { unsavedAtEnd: "known", highlight: SHOW_ALL } },
    );
    await expect
      .poll(() => highlighted("lingo-new").sort())
      .toEqual(["knead", "loaves"]);
    toEnd();
    await expect.poll(() => background.sent("saveAll").length).toBe(1);
    expect(background.sent("saveAll")[0]!.keys).toEqual([
      "knead",
      "loaf",
      "tangy",
      "yeast",
    ]);
  });

  it("stay New by default", async () => {
    const { background } = await setup(ARTICLE, {
      settings: { highlight: SHOW_ALL },
    });
    toEnd();
    await expect.poll(() => highlighted("lingo-new").sort()).toEqual(NEW_WORDS);
    await new Promise((r) => setTimeout(r, 300));
    expect(background.sent("saveAll")).toEqual([]);
  });
});
