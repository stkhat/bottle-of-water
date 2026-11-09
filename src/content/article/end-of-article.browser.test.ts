import { afterEach, describe, expect, it } from "vitest";
import { lastMainBlock } from "./end-of-article";
import { collectBlocks } from "./page-text";

const roots: HTMLElement[] = [];
afterEach(() => roots.splice(0).forEach((r) => r.remove()));

function last(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  roots.push(root);
  return lastMainBlock(root, collectBlocks(root))?.text;
}

describe("lastMainBlock", () => {
  it("takes the last block of the article with the most text", () => {
    expect(
      last(`<nav><p>Home</p></nav>
        <article><p>A short teaser.</p></article>
        <article><h1>Title</h1><p>The long body of the story goes here.</p><p>The end.</p></article>
        <footer><p>Footer text that is long enough to be a block.</p></footer>`),
    ).toBe("The end.");
  });

  it("falls back to main, then to the parent of the longest block", () => {
    expect(
      last(
        `<main><p>The long body of the story.</p><p>Last words.</p></main><p>Footer.</p>`,
      ),
    ).toBe("Last words.");
    expect(
      last(
        `<div><p>The long body of the story goes on and on.</p><p>Last words.</p></div><div><p>Footer.</p></div>`,
      ),
    ).toBe("Last words.");
  });

  it("is undefined without blocks", () => {
    expect(last("<div></div>")).toBeUndefined();
  });
});
