import { afterEach, describe, expect, it } from "vitest";
import { tokenize } from "../../core/text/tokenize";
import {
  blockOffset,
  collectBlocks,
  createPageText,
  rangeOf,
  type BlockChange,
  type TextBlock,
} from "./page-text";

const roots: HTMLElement[] = [];

function fixture(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  roots.push(root);
  return root;
}

afterEach(() => roots.splice(0).forEach((r) => r.remove()));

const texts = (blocks: readonly TextBlock[]) => blocks.map((b) => b.text);
const tags = (blocks: readonly TextBlock[]) =>
  blocks.map((b) => b.element.localName);

describe("collectBlocks", () => {
  it("joins text inside nested inline elements into one block", () => {
    const root = fixture(
      "<p>Most <b>home <i>bakers</i></b> rush <a href='#'>the <span>process</span></a>.</p>",
    );
    expect(texts(collectBlocks(root))).toEqual([
      "Most home bakers rush the process.",
    ]);
  });

  it("treats inline-block and inline-flex elements as part of the line", () => {
    const root = fixture(
      "<p>They <span style='display:inline-block'><button>knead</button></span>, wait <span style='display:inline-flex'>an</span> hour.</p>",
    );
    expect(texts(collectBlocks(root))).toEqual(["They knead, wait an hour."]);
  });

  it("groups text by its nearest block-level ancestor, in document order", () => {
    const root = fixture(
      "<h1>Title</h1><div>Lead <p>First</p> tail<ul><li>One</li><li>Two <span style='display:block'>Inner</span></li></ul></div>",
    );
    const blocks = collectBlocks(root);
    expect(tags(blocks)).toEqual(["h1", "div", "p", "li", "li", "span"]);
    // Text around a nested block stays in its own block, split by a line break.
    expect(texts(blocks)).toEqual([
      "Title",
      "Lead \n tail",
      "First",
      "One",
      "Two ",
      "Inner",
    ]);
  });

  it("splits lines at <br>", () => {
    const root = fixture("<p>One line<br>another line</p>");
    expect(texts(collectBlocks(root))).toEqual(["One line\nanother line"]);
  });

  it("turns source line breaks and tabs into spaces, keeping offsets", () => {
    const root = fixture("<p>rise\n   and\tfall</p>");
    const [block] = collectBlocks(root);
    expect(block!.text).toBe("rise    and fall");
    expect(block!.text.length).toBe(block!.pieces[0]!.node.data.length);
  });

  it("skips code, form fields, scripts and other non-prose elements", () => {
    const root = fixture(`
      <p>Kept <code>code</code> text</p>
      <pre>preformatted</pre>
      <script>var script = 1;</script>
      <style>.style {}</style>
      <noscript>noscript</noscript>
      <textarea>textarea</textarea>
      <select><option>option</option></select>
      <input value="input">
      <div contenteditable="true">editable</div>
      <svg><text>svg</text></svg>
      <p>Last</p>`);
    expect(texts(collectBlocks(root)).map((t) => t.trim())).toEqual([
      "Kept  text",
      "Last",
    ]);
  });

  it("skips hidden elements and text", () => {
    const root = fixture(`
      <p>Shown <span style="display:none">gone</span>text</p>
      <p hidden>hidden attribute</p>
      <p style="visibility:hidden">invisible</p>
      <p>Also <span style="visibility:hidden">invisible</span>shown</p>`);
    expect(texts(collectBlocks(root))).toEqual(["Shown text", "Also shown"]);
  });

  it("skips Lingo's own elements", () => {
    const root = fixture(
      "<p>Page text</p><lingo-page-card><p>Lingo</p></lingo-page-card>",
    );
    const host = root.querySelector("lingo-page-card")!;
    host.attachShadow({ mode: "open" }).innerHTML = "<p>Shadow text</p>";
    expect(texts(collectBlocks(root))).toEqual(["Page text"]);
  });

  it("leaves out blocks with only whitespace", () => {
    const root = fixture("<div>  <p>Text</p>  </div><p> </p>");
    expect(texts(collectBlocks(root))).toEqual(["Text"]);
  });

  it("collects nothing under a skipped or hidden ancestor", () => {
    const root = fixture(
      "<pre><span><p>inside pre</p></span></pre><div style='display:none'><p>hidden</p></div>",
    );
    expect(collectBlocks(root.querySelector("pre p")!)).toEqual([]);
    expect(collectBlocks(root.querySelector("div p")!)).toEqual([]);
  });
});

describe("offsets and ranges", () => {
  it("maps every word of a block to a Range with the same text and back", () => {
    const root = fixture(
      "<p>The <b>bakers</b> who get <i>the <u>most</u> flavor</i> out of their loaves<br>tend to do the opposite.</p>",
    );
    const [block] = collectBlocks(root);
    const words = tokenize(block!.text, "en").filter((t) => t.isWord);
    expect(words.length).toBe(16);
    for (const word of words) {
      const range = rangeOf(block!, word.start, word.end);
      expect(range.toString()).toBe(word.text);
      expect(blockOffset(block!, range.startContainer, range.startOffset)).toBe(
        word.start,
      );
      expect(blockOffset(block!, range.endContainer, range.endOffset)).toBe(
        word.end,
      );
    }
  });

  it("maps a span across element boundaries", () => {
    const root = fixture("<p>the <b>rise</b> and <i>fall</i> back</p>");
    const [block] = collectBlocks(root);
    const start = block!.text.indexOf("rise");
    const end = block!.text.indexOf("fall") + 4;
    expect(rangeOf(block!, start, end).toString()).toBe("rise and fall");
  });

  it("has no offset for a node outside the block", () => {
    const root = fixture("<p>one</p><p>two</p>");
    const [first, second] = collectBlocks(root);
    expect(blockOffset(first!, second!.pieces[0]!.node, 0)).toBeUndefined();
  });
});

describe("createPageText", () => {
  function watch(root: HTMLElement) {
    const changes: BlockChange[] = [];
    const text = createPageText(root, {
      onChange: (change) => changes.push(change),
    });
    return { text, changes };
  }

  it("starts with the blocks under the root", () => {
    const root = fixture("<p>One</p><p>Two</p>");
    const { text } = watch(root);
    expect(texts(text.blocks())).toEqual(["One", "Two"]);
    text.disconnect();
  });

  it("re-collects a block whose text changed, keeping the others", async () => {
    const root = fixture("<p>One</p><p id='b'>Two</p><p>Three</p>");
    const { text, changes } = watch(root);
    const [one, , three] = text.blocks();
    root.querySelector("#b")!.firstChild!.textContent = "Second";
    root.querySelector("#b")!.append(" line");
    await expect.poll(() => changes.length).toBe(1);
    expect(texts(changes[0]!.removed)).toEqual(["Two"]);
    expect(texts(changes[0]!.added)).toEqual(["Second line"]);
    expect(texts(text.blocks())).toEqual(["One", "Second line", "Three"]);
    expect(text.blocks()[0]).toBe(one);
    expect(text.blocks()[2]).toBe(three);
    text.disconnect();
  });

  it("collects added elements and drops removed ones, in document order", async () => {
    const root = fixture("<p id='a'>One</p><p id='b'>Two</p>");
    const { text, changes } = watch(root);
    const added = document.createElement("section");
    added.innerHTML = "<h2>New</h2><p>More</p>";
    root.querySelector("#a")!.after(added);
    root.querySelector("#b")!.remove();
    await expect.poll(() => changes.length).toBe(1);
    expect(texts(changes[0]!.removed)).toEqual(["Two"]);
    expect(texts(changes[0]!.added)).toEqual(["New", "More"]);
    expect(texts(text.blocks())).toEqual(["One", "New", "More"]);
    text.disconnect();
  });

  it("batches mutations made within the debounce into one change", async () => {
    const root = fixture("<p>One</p>");
    const { text, changes } = watch(root);
    for (let i = 0; i < 5; i++) {
      const p = document.createElement("p");
      p.textContent = `Line ${i}`;
      root.append(p);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await expect.poll(() => changes.length).toBe(1);
    expect(changes[0]!.added).toHaveLength(5);
    text.disconnect();
  });

  it("ignores Lingo's own elements being added", async () => {
    const root = fixture("<p>One</p>");
    const { text, changes } = watch(root);
    root.append(document.createElement("lingo-page-card"));
    const p = document.createElement("p");
    p.textContent = "Two";
    // A later change proves the observer ran; the Lingo host alone caused none.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(changes).toEqual([]);
    root.append(p);
    await expect.poll(() => changes.length).toBe(1);
    expect(changes[0]!.removed).toEqual([]);
    expect(texts(changes[0]!.added)).toEqual(["Two"]);
    text.disconnect();
  });

  it("stops reporting after disconnect", async () => {
    const root = fixture("<p>One</p>");
    const { text, changes } = watch(root);
    text.disconnect();
    root.append("more");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(changes).toEqual([]);
  });
});
