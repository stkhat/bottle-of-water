import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Span } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import {
  addPageStyle,
  cleanUpMounts,
  mountInShadowRoot,
} from "../../testing/shadow-root";
import { selectedOffsets } from "../selection-in-root";
import { VideoPanel, type VideoPanelProps } from "./VideoPanel";
import type { WordRow } from "../words/WordsList";

const CUES: Cue[] = [
  {
    startMs: 52_000,
    endMs: 56_000,
    text: "Hey everyone, welcome back to the channel.",
  },
  {
    startMs: 56_000,
    endMs: 63_000,
    text: "So today we're going to figure out how to make bread from scratch.",
  },
  { startMs: 63_000, endMs: 69_000, text: "I've tried this a bunch of times." },
  {
    startMs: 69_000,
    endMs: 75_000,
    text: "The trick is to let the dough rest overnight.",
  },
];
const spanOf = (
  text: string,
  word: string,
  category: Span["category"],
): Span => ({
  start: text.indexOf(word),
  end: text.indexOf(word) + word.length,
  key: word,
  kind: "word",
  category,
});
const SPANS: (Span[] | null)[] = [
  [],
  [spanOf(CUES[1]!.text, "figure out", "learning")],
  [spanOf(CUES[2]!.text, "bunch", "new")],
  null,
];

const ROWS: WordRow[] = [
  {
    id: "word\nfigure out",
    head: "figure out",
    category: "learning",
    count: 2,
    short: "見つけ出す",
    shortLang: "ja",
    places: ["0:56", "1:20"],
    pressed: -1,
  },
  {
    id: "word\nbunch",
    head: "bunch",
    category: "new",
    count: 1,
    short: "束",
    shortLang: "ja",
    places: ["1:03"],
    pressed: -1,
  },
];

const base: VideoPanelProps<WordRow> = {
  tab: "transcript",
  onTab: () => {},
  words: ROWS,
  wordsFilter: "all",
  wordsCounts: { all: 2, new: 1, learning: 1, known: 0 },
  onWordsFilter: () => {},
  wordsSort: "order",
  onWordsSort: () => {},
  onJumpWord: () => {},
  cues: CUES,
  spans: SPANS,
  translations: [
    "みなさん、チャンネルへおかえりなさい。",
    "今日はパンを一から作る方法を探っていきます。",
    "",
    "コツは生地を一晩寝かせることです。",
  ],
  showTranslation: true,
  onToggleTranslation: () => {},
  highlight: { new: false, learning: true, known: false },
  onToggleHighlight: () => {},
  current: 1,
  onSeek: () => {},
  onWordEnter: () => {},
  onWordLeave: () => {},
  onWordClick: () => {},
  onListScroll: () => {},
  learningLang: "en",
  nativeLang: "ja",
  height: 300,
};

afterEach(cleanUpMounts);

const cards = (screen: { container: HTMLElement }) => [
  ...screen.container.querySelectorAll<HTMLElement>("[data-cue]"),
];

/**
 * Waits until the list stops scrolling: it scrolls smoothly to the playing card once
 * mounted, and a drag made meanwhile presses where the words were (slow runners).
 */
async function listAtRest(screen: { container: HTMLElement }) {
  const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
  let last = Number.NaN;
  await expect
    .poll(async () => {
      await new Promise(requestAnimationFrame);
      const same = list.scrollTop === last;
      last = list.scrollTop;
      return same;
    })
    .toBe(true);
}

describe("the Transcript tab", () => {
  test("has the header: L badge, the tabs, Translation switch and Highlight chips", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    await expect
      .element(screen.getByRole("complementary", { name: "Lingo" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("tab", { name: "Transcript" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(screen.getByText("L", { exact: true })).toBeVisible();
    await expect
      .element(
        screen.getByRole("switch", {
          name: "Show translation in the transcript",
        }),
      )
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("button", { name: "New" }))
      .toHaveAttribute("aria-pressed", "false");
    await expect
      .element(screen.getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  test("chips use Main's look: white with a solid border when on, dashed when off", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    const on = getComputedStyle(
      screen.getByRole("button", { name: "Learning" }).element(),
    );
    expect(on.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(on.borderTopColor).toBe("rgb(140, 146, 163)");
    expect(on.borderTopStyle).toBe("solid");
    expect(on.fontWeight).toBe("600");
    const off = getComputedStyle(
      screen.getByRole("button", { name: "New" }).element(),
    );
    expect(off.borderTopStyle).toBe("dashed");
    expect(off.borderTopColor).toBe("rgb(201, 205, 214)");
  });

  test("the switch and the chips ask to change the settings", async () => {
    const onToggleTranslation = vi.fn();
    const onToggleHighlight = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel
        {...base}
        onToggleTranslation={onToggleTranslation}
        onToggleHighlight={onToggleHighlight}
      />,
    );
    await screen
      .getByRole("switch", { name: "Show translation in the transcript" })
      .click();
    expect(onToggleTranslation).toHaveBeenCalledTimes(1);
    await screen.getByRole("button", { name: "Known" }).click();
    expect(onToggleHighlight).toHaveBeenCalledWith("known");
  });

  test("each card shows the time, the line and its translation", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    const [first, , third] = cards(screen);
    expect(first!.textContent).toBe(
      "0:52Hey everyone, welcome back to the channel.みなさん、チャンネルへおかえりなさい。",
    );
    expect(first!.querySelector("[lang=ja]")).not.toBeNull();
    // No translation line without a translation.
    expect(third!.querySelector("[lang=ja]")).toBeNull();
  });

  test("the translation switch off hides the translations", async () => {
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} showTranslation={false} />,
    );
    expect(screen.container.querySelectorAll("[lang=ja]")).toHaveLength(0);
    await expect
      .element(
        screen.getByRole("switch", {
          name: "Show translation in the transcript",
        }),
      )
      .toHaveAttribute("aria-checked", "false");
  });

  test("highlights the terms of the switched-on categories", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    const figure = screen.getByText("figure out").element();
    expect(getComputedStyle(figure).backgroundColor).toBe("rgb(211, 241, 229)");
    const bunch = screen.getByText("bunch").element();
    expect(getComputedStyle(bunch).boxShadow).toBe("none");
  });

  test("emphasizes the playing card with Now playing", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    const playing = cards(screen)[1]!;
    expect(playing.getAttribute("aria-current")).toBe("true");
    expect(playing.textContent).toContain("0:56 · Now playing");
    expect(getComputedStyle(playing).backgroundColor).toBe(
      "rgb(230, 246, 240)",
    );
    expect(cards(screen)[0]!.hasAttribute("aria-current")).toBe(false);
    expect(cards(screen)[0]!.textContent).not.toContain("Now playing");
  });

  test("clicking a card seeks to it", async () => {
    const onSeek = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} onSeek={onSeek} />,
    );
    await screen.getByRole("button", { name: /^1:09/ }).click();
    expect(onSeek).toHaveBeenCalledWith(3);
  });

  test("Enter or Space on a focused card seeks to it", async () => {
    const onSeek = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} onSeek={onSeek} />,
    );
    cards(screen)[3]!.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSeek).toHaveBeenLastCalledWith(3);
    cards(screen)[1]!.focus();
    await userEvent.keyboard(" ");
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });

  test("a word tells when the pointer enters and leaves it; clicking it opens it, not a seek", async () => {
    const onWordEnter = vi.fn();
    const onWordLeave = vi.fn();
    const onWordClick = vi.fn();
    const onSeek = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel
        {...base}
        onWordEnter={onWordEnter}
        onWordLeave={onWordLeave}
        onWordClick={onWordClick}
        onSeek={onSeek}
      />,
    );
    const bunch = screen.getByText("bunch").element() as HTMLElement;
    await userEvent.hover(bunch);
    expect(onWordEnter).toHaveBeenCalledWith(2, 0, bunch);
    await userEvent.unhover(bunch);
    expect(onWordLeave).toHaveBeenCalled();
    await userEvent.click(bunch);
    expect(onWordClick).toHaveBeenCalledWith(2, 0);
    expect(onSeek).not.toHaveBeenCalled();
    // Elsewhere on the card still seeks.
    await screen.getByText("1:03").click();
    expect(onSeek).toHaveBeenCalledWith(2);
  });

  test("ignores the pointer and clicks a page script makes on a word", async () => {
    const onWordEnter = vi.fn();
    const onWordClick = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel
        {...base}
        onWordEnter={onWordEnter}
        onWordClick={onWordClick}
      />,
    );
    const bunch = screen.getByText("bunch").element();
    bunch.dispatchEvent(new PointerEvent("pointerenter"));
    bunch.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onWordEnter).not.toHaveBeenCalled();
    expect(onWordClick).not.toHaveBeenCalled();
  });

  test("selecting words in a card's line tells which card and where, selects the whole words, and does not seek", async () => {
    // The site's own style, which would carry down into the transcript.
    addPageStyle("body { user-select: none; -webkit-user-select: none }");
    const text = CUES[2]!.text;
    const onSelectStart = vi.fn();
    const whole = { from: text.indexOf("tried"), to: text.indexOf("of") + 2 };
    const onSelect = vi.fn(() => whole);
    const onSeek = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel
        {...base}
        onSelectStart={onSelectStart}
        onSelect={onSelect}
        onSeek={onSeek}
      />,
    );
    const line = cards(screen)[2]!.querySelector<HTMLElement>("[lang=en]")!;
    const bunch = screen.getByText("bunch").element() as HTMLElement;
    await listAtRest(screen);
    const { height } = line.getBoundingClientRect();
    // From inside "I've" to the middle of "bunch".
    await userEvent.dragAndDrop(
      page.elementLocator(line),
      page.elementLocator(bunch),
      { sourcePosition: { x: 6, y: height / 2 } },
    );
    await expect.poll(() => onSelect.mock.calls.length).toBe(1);
    expect(onSelectStart).toHaveBeenCalledExactlyOnceWith(2);
    expect(onSelect).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ from: expect.any(Number) }),
    );
    const { from, to } = (onSelect.mock.calls[0] as unknown[])[1] as {
      from: number;
      to: number;
    };
    expect(from).toBeLessThan(text.indexOf("tried"));
    expect(to).toBeGreaterThan(text.indexOf("bunch"));
    expect(to).toBeLessThan(text.indexOf("bunch") + "bunch".length);
    expect(selectedOffsets(line)).toEqual(whole);
    expect(onSeek).not.toHaveBeenCalled();
  });

  test("a drag inside a word of a card opens nothing", async () => {
    const onSelect = vi.fn(() => undefined);
    const onWordClick = vi.fn();
    const onSeek = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel
        {...base}
        onSelect={onSelect}
        onWordClick={onWordClick}
        onSeek={onSeek}
      />,
    );
    await listAtRest(screen);
    const bunch = screen.getByText("bunch").element() as HTMLElement;
    const { width, height } = bunch.getBoundingClientRect();
    await userEvent.dragAndDrop(
      page.elementLocator(bunch),
      page.elementLocator(bunch),
      {
        sourcePosition: { x: 2, y: height / 2 },
        targetPosition: { x: width - 2, y: height / 2 },
      },
    );
    await expect.poll(() => onSelect.mock.calls.length).toBe(1);
    expect(onWordClick).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });

  test("tells when its list scrolls", async () => {
    const onListScroll = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} height={200} onListScroll={onListScroll} />,
    );
    const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
    list.scrollTop = 40;
    await expect.poll(() => onListScroll.mock.calls.length).toBeGreaterThan(0);
  });

  test("holds its auto-scroll while a word's card shows", async () => {
    const many: Cue[] = Array.from({ length: 40 }, (_, i) => ({
      startMs: i * 1000,
      endMs: i * 1000 + 1000,
      text: `Line number ${i}.`,
    }));
    const props = {
      ...base,
      cues: many,
      spans: many.map(() => []),
      translations: many.map(() => ""),
      current: 0,
    };
    const screen = await mountInShadowRoot(
      <VideoPanel {...props} holdScroll />,
    );
    const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
    await screen.rerender(<VideoPanel {...props} holdScroll current={30} />);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(list.scrollTop).toBe(0);
    // Once the card goes, the next card brings the list along.
    await screen.rerender(<VideoPanel {...props} current={31} />);
    await expect.poll(() => list.scrollTop).toBeGreaterThan(0);
  });

  test("scrolls the playing card into view inside its list, not the page", async () => {
    const many: Cue[] = Array.from({ length: 40 }, (_, i) => ({
      startMs: i * 1000,
      endMs: i * 1000 + 1000,
      text: `Line number ${i}.`,
    }));
    const props = {
      ...base,
      cues: many,
      spans: many.map(() => []),
      translations: many.map(() => ""),
      current: 0,
    };
    const screen = await mountInShadowRoot(<VideoPanel {...props} />);
    const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
    const pageScroll = scrollY;
    await screen.rerender(<VideoPanel {...props} current={30} />);
    await expect.poll(() => list.scrollTop).toBeGreaterThan(0);
    const card = cards(screen)[30]!.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    await expect
      .poll(() => {
        const c = cards(screen)[30]!.getBoundingClientRect();
        return c.top >= box.top && c.bottom <= box.bottom;
      })
      .toBe(true);
    expect(card).toBeDefined();
    expect(scrollY).toBe(pageScroll);
  });

  test("does not fight the user's scrolling for a few seconds", async () => {
    const many: Cue[] = Array.from({ length: 40 }, (_, i) => ({
      startMs: i * 1000,
      endMs: i * 1000 + 1000,
      text: `Line number ${i}.`,
    }));
    const props = {
      ...base,
      cues: many,
      spans: many.map(() => []),
      translations: many.map(() => ""),
      current: 0,
      userScrollPauseMs: 300,
    };
    const screen = await mountInShadowRoot(<VideoPanel {...props} />);
    const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
    list.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
    await screen.rerender(<VideoPanel {...props} current={30} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(list.scrollTop).toBe(0);
    // After the pause, the next card brings it back.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await screen.rerender(<VideoPanel {...props} current={31} />);
    await expect.poll(() => list.scrollTop).toBeGreaterThan(0);
  });
});

describe("the tabs", () => {
  test("a segmented control of Transcript and Words beside the L badge", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    const list = screen.getByRole("tablist", { name: "Lingo panel" });
    const tabs = [...list.element().querySelectorAll("[role=tab]")];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Transcript", "Words"]);
    const selected = getComputedStyle(tabs[0]!);
    expect(selected.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(selected.fontWeight).toBe("600");
    expect(selected.height).toBe("32px");
    const other = getComputedStyle(tabs[1]!);
    expect(other.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(other.color).toBe("rgb(58, 64, 86)");
    expect(getComputedStyle(list.element()).backgroundColor).toBe(
      "rgb(241, 242, 245)",
    );
    // Both tabs share the row equally.
    const [a, b] = tabs.map((tab) => tab.getBoundingClientRect().width);
    expect(a).toBe(b);
  });

  test("× at the right of the tabs closes the column", async () => {
    const onClose = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} onClose={onClose} />,
    );
    const close = screen.getByRole("button", { name: "Close transcript" });
    await expect.element(close).toHaveAttribute("title", "Close transcript");
    const list = screen.getByRole("tablist", { name: "Lingo panel" }).element();
    expect(list.nextElementSibling).toBe(close.element());
    const box = close.element().getBoundingClientRect();
    expect([box.width, box.height]).toEqual([36, 36]);
    // Mock Main: its right edge 10px in from the column's.
    const aside = screen.container.querySelector("aside")!;
    expect(aside.getBoundingClientRect().right - box.right).toBeCloseTo(11, 0);
    expect(getComputedStyle(close.element()).color).toBe("rgb(58, 64, 86)");
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("no × without onClose", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    await expect
      .element(screen.getByRole("tablist", { name: "Lingo panel" }))
      .toBeVisible();
    expect(
      screen.container.querySelector("[aria-label='Close transcript']"),
    ).toBeNull();
  });

  test("each tab controls its panel", async () => {
    const screen = await mountInShadowRoot(<VideoPanel {...base} />);
    const transcript = screen.getByRole("tab", { name: "Transcript" });
    const panel = screen.getByRole("tabpanel", { name: "Transcript" });
    expect(transcript.element().getAttribute("aria-controls")).toBe(
      panel.element().id,
    );
    expect(panel.element().querySelectorAll("[data-cue]")).toHaveLength(4);
    const words = screen.getByRole("tab", { name: "Words" }).element();
    const hidden = screen.container.querySelector<HTMLElement>(
      `#${words.getAttribute("aria-controls")}`,
    )!;
    expect(hidden.hidden).toBe(true);
  });

  test("clicking a tab picks it", async () => {
    const onTab = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} onTab={onTab} />,
    );
    await screen.getByRole("tab", { name: "Words" }).click();
    expect(onTab).toHaveBeenCalledWith("words");
  });

  test("the arrow keys move between the tabs; only the selected one is in the tab order", async () => {
    const onTab = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel {...base} onTab={onTab} />,
    );
    const transcript = screen.getByRole("tab", { name: "Transcript" });
    const words = screen.getByRole("tab", { name: "Words" });
    expect(transcript.element().tabIndex).toBe(0);
    expect(words.element().tabIndex).toBe(-1);

    (transcript.element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onTab).toHaveBeenLastCalledWith("words");
    await screen.rerender(<VideoPanel {...base} tab="words" onTab={onTab} />);
    expect(screen.container.getRootNode()).toBeInstanceOf(ShadowRoot);
    expect((screen.container.getRootNode() as ShadowRoot).activeElement).toBe(
      words.element(),
    );
    expect(words.element().tabIndex).toBe(0);
    expect(transcript.element().tabIndex).toBe(-1);

    await userEvent.keyboard("{ArrowLeft}");
    expect(onTab).toHaveBeenLastCalledWith("transcript");
    await screen.rerender(
      <VideoPanel {...base} tab="transcript" onTab={onTab} />,
    );
    expect((screen.container.getRootNode() as ShadowRoot).activeElement).toBe(
      transcript.element(),
    );
    // Wraps around.
    await userEvent.keyboard("{ArrowLeft}");
    expect(onTab).toHaveBeenLastCalledWith("words");
  });

  test("the Words tab shows the filter chips, the sort and the rows instead of the transcript", async () => {
    const onWordsFilter = vi.fn();
    const onWordsSort = vi.fn();
    const onJumpWord = vi.fn();
    const screen = await mountInShadowRoot(
      <VideoPanel
        {...base}
        tab="words"
        wordsFilter="learning"
        onWordsFilter={onWordsFilter}
        wordsSort="az"
        onWordsSort={onWordsSort}
        onJumpWord={onJumpWord}
      />,
    );
    await expect
      .element(screen.getByRole("tab", { name: "Words" }))
      .toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Words" });
    await expect.element(panel).toBeVisible();
    expect(screen.container.querySelectorAll("[data-cue]")).toHaveLength(0);
    expect(
      screen
        .getByRole("switch", { name: "Show translation in the transcript" })
        .query(),
    ).toBeNull();
    expect(screen.getByText("Highlight").query()).toBeNull();
    await expect
      .element(screen.getByRole("button", { name: "Learning 1" }))
      .toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", { name: "New 1" }).click();
    expect(onWordsFilter).toHaveBeenCalledWith("new");
    const sort = screen.getByRole("combobox", { name: "Sort" });
    await expect.element(sort).toHaveValue("az");
    // Under the filter chips.
    const chips = screen.getByRole("group", { name: "Show words" }).element();
    expect(sort.element().getBoundingClientRect().top).toBeGreaterThan(
      chips.getBoundingClientRect().bottom,
    );
    await userEvent.selectOptions(sort, "count");
    expect(onWordsSort).toHaveBeenCalledWith("count");
    await screen.getByRole("button", { name: "bunch, jump to 1:03" }).click();
    expect(onJumpWord).toHaveBeenCalledWith(
      expect.objectContaining({ head: "bunch" }),
      0,
    );
    await screen.getByRole("button", { name: "Jump to 1:20" }).click();
    expect(onJumpWord).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: "figure out" }),
      1,
    );
  });
});
