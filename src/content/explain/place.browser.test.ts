import { afterEach, describe, expect, it } from "vitest";
import enJson3 from "../../core/subtitles/fixtures/youtube/en.json3?raw";
import articleHtml from "../../../e2e/pages/article-en.html?raw";
import type { Span } from "../../core/classify";
import { marked } from "../../core/explain/prompt";
import { isSoundLabel } from "../../core/subtitles/cues";
import { parseYouTubeJson3 } from "../../core/subtitles/youtube-json3";
import { collectBlocks, type TextBlock } from "../article/page-text";
import { captionCards } from "../video/captions";
import { flatCue } from "../video/words";
import { commentThread } from "../video/youtube/comments";
import { articlePlace, videoPlace } from "./place";

const roots: HTMLElement[] = [];

function fixture(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  roots.push(root);
  return root;
}

afterEach(() => roots.splice(0).forEach((r) => r.remove()));

/** A span over the `nth` occurrence of `word` in `text`. */
function spanOf(text: string, word: string, key = word, nth = 0): Span {
  let start = -1;
  for (let i = 0; i <= nth; i++) start = text.indexOf(word, start + 1);
  if (start < 0) throw new Error(`"${word}" not in "${text}"`);
  return {
    start,
    end: start + word.length,
    key,
    kind: "word",
    category: "new",
  };
}

describe("videoPlace (the YouTube fixture's cards)", () => {
  const { state } = captionCards({
    track: { id: "en", lang: "en", kind: "manual", label: "English" },
    cues: parseYouTubeJson3(enJson3),
    translation: { source: "none", lang: "ja", cues: [] },
  });
  const cards = state.cues;
  const flat = (text: string) => flatCue(text, "en");
  const spoken = cards
    .map((card, i) => ({ i, text: flat(card.text) }))
    .filter(({ text }) => text.trim() !== "" && !isSoundLabel(text));

  it("takes the card and the five spoken cards on each side, nearest next to it", () => {
    const wordOf = (text: string) =>
      text.split(/\s+/).find((w) => /^\p{L}{4,}$/u.test(w));
    const at = spoken
      .slice(Math.floor(spoken.length / 2))
      .find((s) => wordOf(s.text))!;
    const word = wordOf(at.text)!;
    const raw = cards[at.i]!.text;
    const span = spanOf(raw, word);
    // Not classified yet: no span, no place.
    expect(videoPlace(cards, [], { cue: at.i, span: 0 }, flat)).toBeUndefined();
    const spans = cards.map((_, i) => (i === at.i ? [span] : null));
    const found = videoPlace(cards, spans, { cue: at.i, span: 0 }, flat)!;
    expect(found.sentence).toBe(at.text);
    expect(found.marks).toHaveLength(1);
    const { start, end } = found.marks[0]!;
    expect(found.sentence.slice(start, end)).toBe(word);
    const k = spoken.indexOf(at);
    expect(found.before).toEqual(spoken.slice(k - 5, k).map((s) => s.text));
    expect(found.after).toEqual(spoken.slice(k + 1, k + 6).map((s) => s.text));
  });

  it("has fewer lines at the start of the video", () => {
    const first = spoken[0]!;
    const word = first.text.split(/\s+/)[0]!;
    const spans = cards.map((_, i) =>
      i === first.i ? [spanOf(cards[first.i]!.text, word)] : null,
    );
    const found = videoPlace(cards, spans, { cue: first.i, span: 0 }, flat)!;
    expect(found.before).toEqual([]);
    expect(found.after).toHaveLength(5);
  });
});

describe("videoPlace (marks)", () => {
  const cards = [
    { startMs: 0, endMs: 1, text: "[Music]" },
    { startMs: 1, endMs: 2, text: "Hello there." },
    { startMs: 2, endMs: 3, text: "We figured\nit out." },
    { startMs: 3, endMs: 4, text: "Good night." },
  ];
  const flat = (text: string) => flatCue(text, "en");
  const text = cards[2]!.text;

  it("marks each part of a phrase with a gap in the flat text, and skips sound labels", () => {
    const whole = { start: 3, end: text.length - 1 };
    const parts: Span[] = [
      {
        ...spanOf(text, "figured", "figure out"),
        kind: "phrase",
        part: { index: 0, count: 2, ...whole },
      },
      spanOf(text, "it"),
      {
        ...spanOf(text, "out", "figure out"),
        kind: "phrase",
        part: { index: 1, count: 2, ...whole },
      },
    ];
    const place = videoPlace(
      cards,
      [null, null, parts, null],
      { cue: 2, span: 2 },
      flat,
    )!;
    expect(place.sentence).toBe("We figured it out.");
    expect(marked(place.sentence, place.marks)).toBe(
      "We [[figured]] it [[out]].",
    );
    expect(place.before).toEqual(["Hello there."]);
    expect(place.after).toEqual(["Good night."]);
  });

  it("marks selected words", () => {
    const place = videoPlace(
      cards,
      [],
      { cue: 2, span: -1, selected: { start: 3, end: 17, key: "figure out" } },
      flat,
    )!;
    expect(marked(place.sentence, place.marks)).toBe("We [[figured it out]].");
  });
});

describe("articlePlace", () => {
  const body = articleHtml.slice(
    articleHtml.indexOf("<body>") + 6,
    articleHtml.indexOf("</body>"),
  );

  function page() {
    const root = fixture(body);
    const blocks = collectBlocks(root);
    const blockWith = (text: string) =>
      blocks.find((b) => b.text.includes(text))!;
    return { blocks, blockWith };
  }

  it("takes the sentence, then the block's other sentences, then the blocks before and after (the article fixture)", () => {
    const { blocks, blockWith } = page();
    const block = blockWith("It can feel tedious");
    const span = spanOf(block.text, "tedious");
    const place = articlePlace({ block, span }, [span], blocks, "en");
    expect(place.sentence).toBe("It can feel tedious at first.");
    expect(marked(place.sentence, place.marks)).toBe(
      "It can feel [[tedious]] at first.",
    );
    expect(place.before).toEqual([
      "Most home bakers rush the process.",
      "They knead, wait an hour, and bake.",
      "But the bakers who get the most flavor out of their loaves tend to do the opposite: they slow everything down and let time do the heavy lifting.",
      "When the mixture ferments slowly in a cool place, the yeast and bacteria have more time to break down starches.",
      "The result is a loaf with a deeper, slightly tangy taste and a crust that crackles as it cools.",
    ]);
    expect(place.after).toEqual([
      "You have to plan a day ahead, and there is no way to speed things up once you have started.",
      "Still, once you figure out a schedule that fits your week, the extra hours mostly take care of themselves.",
      "After a month of side-by-side tests, Maya finally made up her mind to bake only sourdough.",
      "Her neighbor made up his mind a week later.",
      "If you are starting from scratch, begin with a simple recipe and change one thing at a time.",
    ]);
  });

  it("marks each part of a phrase with a gap, in the collapsed sentence", () => {
    const { blocks, blockWith } = page();
    const block = blockWith("made up her mind");
    const { text } = block;
    const made = text.indexOf("made up her mind");
    const whole = { start: made, end: made + "made up her mind".length };
    const parts: Span[] = [
      {
        start: made,
        end: made + 7,
        key: "make up mind",
        kind: "phrase",
        category: "new",
        part: { index: 0, count: 2, ...whole },
      },
      { ...spanOf(text, "her"), category: "known" },
      {
        start: whole.end - 4,
        end: whole.end,
        key: "make up mind",
        kind: "phrase",
        category: "new",
        part: { index: 1, count: 2, ...whole },
      },
      // The same phrase in the next sentence is another place.
      { ...spanOf(text, "made up", "make up mind", 1), kind: "phrase" },
    ];
    const place = articlePlace({ block, span: parts[2]! }, parts, blocks, "en");
    expect(marked(place.sentence, place.marks)).toBe(
      "After a month of side-by-side tests, Maya finally [[made up]] her [[mind]] to bake only sourdough.",
    );
    expect(place.after[0]).toBe("Her neighbor made up his mind a week later.");
  });

  it("takes a comment's thread only", () => {
    const comment = (text: string) =>
      `<ytd-comment-view-model><span id="content-text">${text}</span></ytd-comment-view-model>`;
    const root = fixture(`
      <style>ytd-comment-thread-renderer, ytd-comment-view-model, ytd-comment-replies-renderer { display: block }</style>
      <ytd-comment-thread-renderer>${comment("Another thread. It is loud.")}</ytd-comment-thread-renderer>
      <ytd-comment-thread-renderer>
        ${comment("Great talk. The bread looks tedious to make.")}
        <ytd-comment-replies-renderer>
          ${comment("It is not hard. Try it once.")}
          ${comment("Agreed!")}
        </ytd-comment-replies-renderer>
      </ytd-comment-thread-renderer>
      <ytd-comment-thread-renderer>${comment("Third thread here.")}</ytd-comment-thread-renderer>`);
    const blocks: TextBlock[] = collectBlocks(root);
    const block = blocks.find((b) => b.text.includes("tedious"))!;
    const span = spanOf(block.text, "tedious");
    const thread = commentThread(block.element)!;
    expect(thread.localName).toBe("ytd-comment-thread-renderer");
    const place = articlePlace({ block, span }, [span], blocks, "en", thread);
    expect(place.sentence).toBe("The bread looks tedious to make.");
    expect(place.before).toEqual(["Great talk."]);
    expect(place.after).toEqual(["It is not hard.", "Try it once.", "Agreed!"]);
    // Without the thread, the page's other comments count too.
    expect(articlePlace({ block, span }, [span], blocks, "en").before).toEqual([
      "Another thread.",
      "It is loud.",
      "Great talk.",
    ]);
  });
});
