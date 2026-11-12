import { afterEach, describe, expect, it } from "vitest";
import { findMainContent } from "./main-content";
import { collectBlocks } from "./page-text";

const roots: HTMLElement[] = [];
afterEach(() => roots.splice(0).forEach((r) => r.remove()));

const BODY = [
  "Most home bakers rush the process, kneading and baking within an hour.",
  "When the dough ferments slowly in a cool place, the flavor grows deeper.",
  "It can feel tedious at first, but the extra hours take care of themselves.",
];
const paragraphs = BODY.map((p) => `<p>${p}</p>`).join("");
/** Prose about half as long as `BODY`. */
const LONG_SIDE =
  "Bakeries across the country report queues out of the door since Monday morning.";
const REFS = Array.from(
  { length: 8 },
  (_, i) =>
    `<li>Author ${i}. A long cited title about bread number ${i}. Journal of Baking, ${2000 + i}.</li>`,
).join("");

/** The texts of the blocks counted as main content, and the last of them. */
function main(html: string, title = "") {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  roots.push(root);
  const blocks = collectBlocks(root);
  const found = findMainContent(root, blocks, title);
  return {
    texts: blocks.filter((b) => found.contains(b)).map((b) => b.text),
    last: found.last?.text,
  };
}

describe("findMainContent", () => {
  it("keeps the article and leaves out the navigation, sidebar and footer", () => {
    const { texts, last } = main(`
      <header><span>The Weekend Table</span><nav><a href="#">Recipes</a></nav></header>
      <article><h1>Why patient bakers win</h1><span>6 min read</span>${paragraphs}</article>
      <aside><h2>Popular now</h2><p>A sidebar paragraph that is long enough to count as prose.</p></aside>
      <footer><p>Footer text that is long enough to be a paragraph of prose.</p></footer>`);
    // The article's own text ("6 min read") is its block, which comes before the h1's.
    expect(texts).toEqual(["6 min read", "Why patient bakers win", ...BODY]);
    expect(last).toBe(BODY[2]);
  });

  it("prefers the body over teaser articles when the body has no <article>", () => {
    const { texts } = main(`
      <div class="content">${paragraphs}</div>
      <div class="rail">
        <article><h3><a href="#">Another story about sourdough</a></h3><p>A teaser that is long enough to be prose.</p></article>
        <article><h3><a href="#">Yet another story</a></h3><p>Short teaser text here.</p></article>
      </div>`);
    expect(texts).toEqual(BODY);
  });

  it("keeps the page title when the h1 sits outside the body's container", () => {
    const { texts } = main(
      `<div class="masthead"><h1>Why patient bakers win</h1></div>
       <div class="story">${paragraphs}</div>
       <div class="more"><h2>Other title</h2></div>`,
      "Why patient bakers win | The Weekend Table",
    );
    expect(texts).toEqual(["Why patient bakers win", ...BODY]);
  });

  it("leaves out a site logo h1 that does not match the page title", () => {
    const { texts } = main(
      `<header><h1>The Weekend Table</h1></header><div>${paragraphs}</div>`,
      "Why patient bakers win",
    );
    expect(texts).toEqual(BODY);
  });

  it("leaves out related-story and share blocks inside the article", () => {
    const { texts } = main(`
      <article><h1>Title</h1>${paragraphs}
        <div class="related-stories"><h2>Related</h2><p>Some related story text that is long enough.</p></div>
        <div class="ShareBar"><span>Share this</span></div>
        <section class="newsletter_signup"><p>Sign up to get our newsletter every week, free.</p></section>
      </article>`);
    expect(texts).toEqual(["Title", ...BODY]);
  });

  it("leaves out blocks that are mostly links, but not the title", () => {
    const { texts, last } = main(`
      <article><h1><a href="#">Linked title</a></h1>${paragraphs}
        <p>Read more: <a href="#">Why your sourdough starter keeps dying</a></p>
        <h2>See also</h2><ul><li><a href="#">Bread</a></li><li><a href="#">Yeast</a></li></ul>
        <p>A closing line with <a href="#">one link</a> in a longer sentence of prose.</p>
      </article>`);
    expect(texts).toEqual([
      "Linked title",
      ...BODY,
      "See also",
      "A closing line with one link in a longer sentence of prose.",
    ]);
    expect(last).toBe(
      "A closing line with one link in a longer sentence of prose.",
    );
  });

  it("does not drop the whole body for a wrapper class that looks like boilerplate", () => {
    const { texts } = main(
      `<div class="layout has-sidebar"><div class="entry share-enabled">${paragraphs}</div></div>`,
    );
    expect(texts).toEqual(BODY);
  });

  it("leaves out references, even when they hold more text than the body", () => {
    const { texts } = main(`
      <main><h1>Bread</h1><div class="parser-output">${paragraphs}
        <h2>References</h2>
        <div class="reflist"><ol class="references">${REFS}</ol></div>
      </div></main>`);
    expect(texts).toEqual(["Bread", ...BODY, "References"]);
  });

  it("uses main when the body sits in it", () => {
    const { texts } = main(`
      <nav><p>Main menu entries that are long enough to be prose, really.</p></nav>
      <main><h1>Bread</h1><div class="body">${paragraphs}</div><p>Short.</p></main>`);
    expect(texts).toEqual(["Bread", ...BODY, "Short."]);
  });

  it("keeps every post of a live page, not only the longest one", () => {
    const posts = [
      ["Ovens sold out", BODY[0]!, BODY[1]!, BODY[2]!],
      ["Flour prices rise", BODY[1]!, BODY[2]!],
      ["Bakers react", BODY[2]!, BODY[0]!],
      ["What we know", BODY[0]!],
    ];
    const { texts, last } = main(`
      <main>
        <h1>Bread week: live</h1>
        <div class="summary"><ul><li><p>${LONG_SIDE}</p></li></ul></div>
        <ol>${posts
          .map(
            ([heading, ...ps]) =>
              `<li><article><h3>${heading}</h3>${ps.map((p) => `<p>${p}</p>`).join("")}</article></li>`,
          )
          .join("")}</ol>
        <aside><p>A sidebar paragraph that is long enough to count as prose.</p></aside>
      </main>
      <footer><p>Footer text that is long enough to be a paragraph of prose.</p></footer>`);
    expect(texts).toEqual(["Bread week: live", LONG_SIDE, ...posts.flat()]);
    expect(last).toBe(BODY[0]);
  });

  it("keeps every chapter of a body split into sections", () => {
    const chapters = [BODY, BODY.slice(1), BODY.slice(0, 2)];
    const { texts } = main(`
      <div class="story">${chapters
        .map(
          (ps, i) =>
            `<section><h2>Part ${i + 1}</h2><div class="text">${ps.map((p) => `<p>${p}</p>`).join("")}</div></section>`,
        )
        .join("")}</div>
      <div class="more"><p>${LONG_SIDE}</p></div>`);
    expect(texts).toEqual(
      chapters.flatMap((ps, i) => [`Part ${i + 1}`, ...ps]),
    );
  });

  it("does not widen the body for a single long block beside it", () => {
    const { texts } = main(`
      <div class="content">${paragraphs}</div>
      <div class="rail"><p>${LONG_SIDE}</p></div>`);
    expect(texts).toEqual(BODY);
  });

  it("counts everything as main when nothing reads as prose", () => {
    const { texts, last } = main(
      `<ul><li><a href="#">Home</a></li><li>Short item</li></ul>`,
    );
    expect(texts).toEqual(["Home", "Short item"]);
    expect(last).toBe("Short item");
  });

  it("finds nothing without blocks", () => {
    expect(main("<div></div>")).toEqual({ texts: [], last: undefined });
  });
});
