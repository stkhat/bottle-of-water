import { afterEach, describe, expect, it } from "vitest";
import type { Category, Span } from "../../core/classify";
import { collectBlocks, type TextBlock } from "./page-text";
import {
  createHighlighter,
  highlightCss,
  HIGHLIGHT_NAMES,
  type Highlighter,
} from "./highlighter";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((c) => c()));

function fixture(html: string): TextBlock[] {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  cleanups.push(() => root.remove());
  return collectBlocks(root);
}

function highlighter(on = { new: true, learning: true, known: true }) {
  const h = createHighlighter(on);
  cleanups.push(() => h.destroy());
  return h;
}

/** Spans for the given words of a block, by their first occurrence. */
function spans(block: TextBlock, words: Record<string, Category>): Span[] {
  return Object.entries(words).map(([word, category]) => {
    const start = block.text.indexOf(word);
    return {
      start,
      end: start + word.length,
      key: word,
      kind: "word",
      category,
    };
  });
}

/** The text of every range registered under a highlight name, sorted. */
function registered(name: string): string[] | undefined {
  const highlight = CSS.highlights.get(name);
  if (!highlight) return undefined;
  return [...highlight].map((range) => (range as Range).toString()).sort();
}

const TEXT =
  "<p>They <b>knead</b>, wait an hour, and bake the loaves.</p><p>The yeast and bacteria have more time.</p>";

describe("createHighlighter", () => {
  it("registers each category's ranges under its own name", () => {
    const [first, second] = fixture(TEXT);
    const h = highlighter();
    h.set(
      first!,
      spans(first!, {
        knead: "new",
        loaves: "known",
        bake: "learning",
        wait: "ignored",
      }),
    );
    h.set(second!, spans(second!, { yeast: "known", bacteria: "new" }));
    expect(registered("lingo-new")).toEqual(["bacteria", "knead"]);
    expect(registered("lingo-learning")).toEqual(["bake"]);
    expect(registered("lingo-known")).toEqual(["loaves", "yeast"]);
    expect(HIGHLIGHT_NAMES).toEqual({
      new: "lingo-new",
      learning: "lingo-learning",
      known: "lingo-known",
    });
  });

  it("highlights a phrase as one range across elements", () => {
    const [block] = fixture(
      "<p>Trace each <i>rise</i> and <b>fall</b> back.</p>",
    );
    const h = highlighter();
    const start = block!.text.indexOf("rise");
    h.set(block!, [
      {
        start,
        end: start + 13,
        key: "rise and fall",
        kind: "phrase",
        category: "learning",
      },
    ]);
    expect(registered("lingo-learning")).toEqual(["rise and fall"]);
  });

  it("replaces a block's ranges when it is set again, and drops them on remove", () => {
    const [first, second] = fixture(TEXT);
    const h = highlighter();
    h.set(first!, spans(first!, { knead: "new", loaves: "new" }));
    h.set(second!, spans(second!, { yeast: "new" }));
    h.set(first!, spans(first!, { knead: "learning" }));
    expect(registered("lingo-new")).toEqual(["yeast"]);
    expect(registered("lingo-learning")).toEqual(["knead"]);
    h.remove(second!);
    expect(registered("lingo-new")).toEqual([]);
    expect(registered("lingo-learning")).toEqual(["knead"]);
  });

  it("registers only the categories switched on, and follows changes", () => {
    const [block] = fixture(TEXT);
    const h = highlighter({ new: false, learning: true, known: false });
    h.set(
      block!,
      spans(block!, { knead: "new", bake: "learning", loaves: "known" }),
    );
    expect(registered("lingo-new")).toBeUndefined();
    expect(registered("lingo-learning")).toEqual(["bake"]);
    expect(registered("lingo-known")).toBeUndefined();

    h.setEnabled({ new: true, learning: false, known: true });
    expect(registered("lingo-new")).toEqual(["knead"]);
    expect(registered("lingo-learning")).toBeUndefined();
    expect(registered("lingo-known")).toEqual(["loaves"]);

    // Ranges set while a category is off show when it comes back on.
    h.set(block!, spans(block!, { wait: "learning" }));
    h.setEnabled({ new: false, learning: true, known: false });
    expect(registered("lingo-learning")).toEqual(["wait"]);
  });

  it("styles the highlights from one adopted stylesheet and adds nothing to the DOM", () => {
    const [block] = fixture(TEXT);
    const before = document.adoptedStyleSheets.length;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) =>
      mutations.push(...records),
    );
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    const h: Highlighter = highlighter();
    h.set(block!, spans(block!, { knead: "new" }));
    h.setEnabled({ new: false, learning: true, known: true });

    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
    expect(mutations).toEqual([]);
    expect(document.adoptedStyleSheets.length).toBe(before + 1);
    const sheet = document.adoptedStyleSheets.at(-1)!;
    const selectors = [...sheet.cssRules].map(
      (r) => (r as CSSStyleRule).selectorText,
    );
    expect(selectors.sort()).toEqual([
      "::highlight(lingo-known)",
      "::highlight(lingo-learning)",
      "::highlight(lingo-new)",
    ]);
  });

  it("paints the mock's colors", () => {
    highlighter();
    const sheet = document.adoptedStyleSheets.at(-1)!;
    const rule = (name: string) =>
      [...sheet.cssRules].find(
        (r) => (r as CSSStyleRule).selectorText === `::highlight(${name})`,
      ) as CSSStyleRule;
    const learning = rule("lingo-learning").style;
    expect(learning.backgroundColor).toBe("rgb(211, 241, 229)");
    expect(learning.textDecorationColor).toBe("rgb(15, 159, 126)");
    expect(learning.textDecorationLine).toBe("underline");
    expect(rule("lingo-new").style.textDecorationColor).toBe(
      "rgb(47, 111, 228)",
    );
    expect(rule("lingo-new").style.backgroundColor).toBe("rgb(234, 240, 253)");
    expect(rule("lingo-known").style.textDecorationColor).toBe(
      "rgb(163, 168, 183)",
    );
    // Every underline sits flush with the bottom of the text.
    expect(learning.textUnderlineOffset).toBe("0.2em");
    expect(rule("lingo-new").style.textUnderlineOffset).toBe("0.2em");
    expect(rule("lingo-known").style.textUnderlineOffset).toBe("0.2em");
    expect(learning.textDecorationThickness).toBe("2px");
  });

  it("removes its stylesheet and highlights on destroy", () => {
    const [block] = fixture(TEXT);
    const before = document.adoptedStyleSheets.length;
    const h = createHighlighter({ new: true, learning: true, known: true });
    h.set(block!, spans(block!, { knead: "new" }));
    h.destroy();
    expect(document.adoptedStyleSheets.length).toBe(before);
    expect(registered("lingo-new")).toBeUndefined();
  });
});

describe("highlightCss", () => {
  it("uses background colors only where highlights cannot be underlined", () => {
    const css = highlightCss(false);
    expect(css).not.toContain("text-decoration");
    expect(css).toMatch(/::highlight\(lingo-new\)\s*\{[^}]*background-color/);
    expect(css).toMatch(/::highlight\(lingo-known\)\s*\{[^}]*background-color/);
  });
});
