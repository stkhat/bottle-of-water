import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Span } from "../../core/classify";
import { wordRuns } from "../../core/phrases/key";
import {
  drag,
  middleOf,
  moveTo,
  pointIn,
  press,
  release,
} from "../../testing/mouse";
import {
  addPageStyle,
  cleanUpMounts,
  mountInShadowRoot,
} from "../../testing/shadow-root";
import { selectedOffsets } from "../selection-in-root";
import { SubtitleOverlay, type SubtitleOverlayProps } from "./SubtitleOverlay";
import type { SelectedText } from "./text-selection";

const TEXT =
  "So today we're going to figure out how to make bread from scratch.";
const at = (word: string) => TEXT.indexOf(word);
const span = (
  word: string,
  category: Span["category"],
  kind: Span["kind"] = "word",
): Span => ({
  start: at(word),
  end: at(word) + word.length,
  key: word,
  kind,
  category,
});
const SPANS: Span[] = [
  span("today", "known"),
  span("figure out", "learning", "phrase"),
  span("bread", "new"),
  span("from scratch", "learning", "phrase"),
];

const base: SubtitleOverlayProps = {
  variant: "inVideo",
  text: TEXT,
  spans: SPANS,
  highlight: { new: false, learning: true, known: false },
  translation: "今日はパンを一から作る方法を探っていきます。",
  showTranslation: true,
  size: 100,
  opacity: 80,
  nativeLang: "ja",
  learningLang: "en",
  selected: null,
  onWordEnter: () => {},
  onWordLeave: () => {},
  onWordClick: () => {},
};

afterEach(cleanUpMounts);

const word = (screen: { container: HTMLElement }, text: string) => {
  const found = [
    ...screen.container.querySelectorAll<HTMLElement>("[data-span]"),
  ].find((el) => el.textContent === text);
  if (!found) throw new Error(`no word "${text}"`);
  return found;
};

describe("SubtitleOverlay", () => {
  test("shows the line in the learning language and its translation", async () => {
    const screen = await mountInShadowRoot(<SubtitleOverlay {...base} />);
    const region = screen.getByRole("region", { name: "Subtitle" });
    await expect.element(region).toBeVisible();
    expect(region.element().textContent).toContain(TEXT);
    await expect
      .element(screen.getByText("今日はパンを一から作る方法を探っていきます。"))
      .toHaveAttribute("lang", "ja");
    expect(screen.container.querySelector("[lang=en]")?.textContent).toBe(TEXT);
  });

  test("hides the translation when it is switched off or missing", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} showTranslation={false} />,
    );
    expect(screen.container.textContent).not.toContain("今日は");
    await screen.rerender(<SubtitleOverlay {...base} translation="" />);
    expect(screen.container.querySelectorAll("[lang=ja]")).toHaveLength(0);
  });

  test("colors only the categories that are switched on, brighter over the video", async () => {
    const screen = await mountInShadowRoot(<SubtitleOverlay {...base} />);
    const figure = getComputedStyle(word(screen, "figure out"));
    expect(figure.backgroundColor).toBe("rgba(15, 159, 126, 0.55)");
    expect(figure.boxShadow).toContain("rgb(111, 227, 195)");
    expect(getComputedStyle(word(screen, "bread")).boxShadow).toBe("none");
    expect(getComputedStyle(word(screen, "today")).boxShadow).toBe("none");

    await screen.rerender(
      <SubtitleOverlay
        {...base}
        highlight={{ new: true, learning: false, known: true }}
      />,
    );
    expect(getComputedStyle(word(screen, "figure out")).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(getComputedStyle(word(screen, "bread")).boxShadow).toContain(
      "rgb(141, 180, 255)",
    );
    expect(getComputedStyle(word(screen, "bread")).backgroundColor).toBe(
      "rgba(47, 111, 228, 0.55)",
    );
    expect(getComputedStyle(word(screen, "today")).boxShadow).toContain(
      "rgba(255, 255, 255, 0.6)",
    );
  });

  test("below the video: a light box with the page colors", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} variant="belowVideo" />,
    );
    const line = screen.container.querySelector<HTMLElement>("[lang=en]")!;
    expect(getComputedStyle(line).fontSize).toBe("26px");
    const figure = getComputedStyle(word(screen, "figure out"));
    expect(figure.backgroundColor).toBe("rgb(211, 241, 229)");
    expect(figure.boxShadow).toContain("rgb(15, 159, 126)");
  });

  test("in the video: 24px white text on a dark box", async () => {
    const screen = await mountInShadowRoot(<SubtitleOverlay {...base} />);
    const line = screen.container.querySelector<HTMLElement>("[lang=en]")!;
    const style = getComputedStyle(line);
    expect(style.fontSize).toBe("24px");
    expect(style.color).toBe("rgb(255, 255, 255)");
    expect(style.backgroundColor).toBe("rgba(8, 10, 16, 0.8)");
  });

  test("in fullscreen: larger lines on dark boxes (mock Fullscreen)", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} variant="fullscreen" />,
    );
    const region =
      screen.container.querySelector<HTMLElement>("[role=region]")!;
    expect(getComputedStyle(region).rowGap).toBe("8px");
    const line = getComputedStyle(
      screen.container.querySelector<HTMLElement>("[lang=en]")!,
    );
    expect(line.fontSize).toBe("34px");
    expect(line.lineHeight).toBe("51px");
    expect(line.fontWeight).toBe("500");
    expect(line.padding).toBe("6px 18px");
    expect(line.borderRadius).toBe("10px");
    expect(line.color).toBe("rgb(255, 255, 255)");
    expect(line.backgroundColor).toBe("rgba(8, 10, 16, 0.8)");
    const translation = getComputedStyle(
      screen.container.querySelector<HTMLElement>("[lang=ja]")!,
    );
    expect(translation.fontSize).toBe("24px");
    expect(translation.lineHeight).toBe("36px");
    expect(translation.padding).toBe("4px 14px");
    expect(translation.borderRadius).toBe("10px");
    expect(translation.color).toBe("rgb(233, 235, 240)");
    expect(translation.backgroundColor).toBe("rgba(8, 10, 16, 0.72)");
    // The in-video colors: the learning highlight on the dark box.
    const figure = getComputedStyle(word(screen, "figure out"));
    expect(figure.backgroundColor).toBe("rgba(15, 159, 126, 0.55)");
    expect(figure.boxShadow).toContain("rgb(111, 227, 195)");
  });

  test("outlines the word whose dictionary window is open", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} selected={1} />,
    );
    const figure = getComputedStyle(word(screen, "figure out"));
    expect(figure.outlineStyle).toBe("solid");
    expect(figure.outlineColor).toBe("rgb(111, 227, 195)");
    expect(getComputedStyle(word(screen, "bread")).outlineStyle).toBe("none");
  });

  test("tells when the pointer enters and leaves a word, and when it is clicked", async () => {
    const onWordEnter = vi.fn();
    const onWordLeave = vi.fn();
    const onWordClick = vi.fn();
    const screen = await mountInShadowRoot(
      <SubtitleOverlay
        {...base}
        onWordEnter={onWordEnter}
        onWordLeave={onWordLeave}
        onWordClick={onWordClick}
      />,
    );
    const bread = word(screen, "bread");
    await userEvent.hover(bread);
    expect(onWordEnter).toHaveBeenCalledWith(2, bread);
    // `unhover` moves the pointer to the middle of <body>, which may cross other
    // boundaries on its way, so only "left at least once" is stable across machines.
    await userEvent.unhover(bread);
    expect(onWordLeave).toHaveBeenCalled();
    await userEvent.click(bread);
    expect(onWordClick).toHaveBeenCalledWith(2);
  });

  test("ignores the pointer and clicks a page script makes", async () => {
    const onWordEnter = vi.fn();
    const onWordClick = vi.fn();
    const screen = await mountInShadowRoot(
      <SubtitleOverlay
        {...base}
        onWordEnter={onWordEnter}
        onWordClick={onWordClick}
      />,
    );
    const bread = word(screen, "bread");
    bread.dispatchEvent(new PointerEvent("pointerenter"));
    bread.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    bread.click();
    expect(onWordEnter).not.toHaveBeenCalled();
    expect(onWordClick).not.toHaveBeenCalled();
  });

  test("ignored spans and text between words are plain text", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} spans={[...SPANS, span("make", "ignored")]} />,
    );
    const words = [...screen.container.querySelectorAll("[data-span]")].map(
      (el) => el.textContent,
    );
    expect(words).toEqual(["today", "figure out", "bread", "from scratch"]);
  });

  test("shows the plain line until it is classified", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} spans={null} />,
    );
    expect(screen.container.querySelector("[lang=en]")?.textContent).toBe(TEXT);
    expect(screen.container.querySelectorAll("[data-span]")).toHaveLength(0);
  });

  test("joins the lines of a cue", async () => {
    const screen = await mountInShadowRoot(
      <SubtitleOverlay {...base} text={"It is a tangy\nloaf."} spans={[]} />,
    );
    expect(
      screen.container.querySelector("[lang=en]")!.getBoundingClientRect()
        .height,
    ).toBeLessThan(50);
  });

  describe("size and opacity", () => {
    const lines = (screen: { container: HTMLElement }) => {
      const [line, translation] = [
        ...screen.container.querySelectorAll<HTMLElement>("p"),
      ];
      return {
        line: getComputedStyle(line!),
        tr: getComputedStyle(translation!),
      };
    };

    test("by default the boxes over the video are as in the mock", async () => {
      const screen = await mountInShadowRoot(<SubtitleOverlay {...base} />);
      const { line, tr } = lines(screen);
      expect(line.fontSize).toBe("24px");
      expect(line.backgroundColor).toBe("rgba(8, 10, 16, 0.8)");
      expect(tr.fontSize).toBe("17px");
      expect(tr.backgroundColor).toBe("rgba(8, 10, 16, 0.72)");
    });

    test("size scales the line and the translation, opacity shades their boxes", async () => {
      const screen = await mountInShadowRoot(
        <SubtitleOverlay {...base} size={150} opacity={40} />,
      );
      const { line, tr } = lines(screen);
      expect(line.fontSize).toBe("36px");
      expect(tr.fontSize).toBe("25.5px");
      expect(line.backgroundColor).toBe("rgba(8, 10, 16, 0.4)");
      expect(tr.backgroundColor).toBe("rgba(8, 10, 16, 0.36)");
    });

    test("in fullscreen too", async () => {
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          variant="fullscreen"
          size={50}
          opacity={0}
        />,
      );
      const { line, tr } = lines(screen);
      expect(line.fontSize).toBe("17px");
      expect(tr.fontSize).toBe("12px");
      expect(line.backgroundColor).toBe("rgba(8, 10, 16, 0)");
    });

    test("below the video the text scales but the light box keeps its look", async () => {
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          variant="belowVideo"
          size={120}
          opacity={0}
        />,
      );
      const { line } = lines(screen);
      expect(line.fontSize).toBe("31.2px");
      const box = screen.getByRole("region", { name: "Subtitle" }).element();
      expect(getComputedStyle(box).backgroundColor).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(line.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    });
  });

  describe("selecting words", () => {
    const line = (screen: { container: HTMLElement }) =>
      screen.container.querySelector<HTMLElement>("[lang=en]")!;
    /** Snaps to the whole words of the line, as the content script does. */
    const wholeWords = (text: string) =>
      vi.fn((from: number, to: number) => {
        const runs = wordRuns(text).filter((r) => r.end > from && r.start < to);
        const [first] = runs;
        return first && { from: first.start, to: runs.at(-1)!.end };
      });
    const whole = (first: string, last: string) => ({
      from: at(first),
      to: at(last) + last.length,
    });

    test("selects whole words over a player whose text is not selectable, as the drag goes", async () => {
      // The players' own style, which would carry down into the subtitle.
      addPageStyle("body { user-select: none; -webkit-user-select: none }");
      const onSelectStart = vi.fn();
      const onSnap = wholeWords(TEXT);
      const onSelect = vi.fn(
        (selected?: { from: number; to: number }) =>
          selected && { from: selected.from, to: selected.to },
      );
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSelectStart={onSelectStart}
          onSnap={onSnap}
          onSelect={onSelect}
        />,
      );
      await moveTo(middleOf(word(screen, "today")));
      await press();
      await moveTo(pointIn(word(screen, "figure out"), 0.85));
      // Live: the words so far are selected while the press is held.
      await expect
        .poll(() => selectedOffsets(line(screen)))
        .toEqual(whole("today", "figure out"));
      expect(onSelectStart).toHaveBeenCalledOnce();
      await moveTo(middleOf(word(screen, "bread")));
      await release();
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      const selected = (onSelect.mock.calls[0] as unknown[])[0] as {
        from: number;
        to: number;
        anchor: string;
        boxOf(from: number, to: number): unknown;
      };
      expect(selected).toMatchObject({
        ...whole("today", "bread"),
        anchor: "start",
      });
      // The box of the words' first line, inside the line's box.
      const box = selected.boxOf(at("today"), at("bread") + 5) as DOMRect;
      const lineBox = line(screen).getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(lineBox.left);
      expect(box.right).toBeLessThanOrEqual(lineBox.right);
      expect(selectedOffsets(line(screen))).toEqual(whole("today", "bread"));
    });

    test("a drag past the line's edge keeps to its words, and its click reaches nothing", async () => {
      const onSnap = wholeWords(TEXT);
      const onSelect = vi.fn(
        (selected?: { from: number; to: number }) =>
          selected && { from: selected.from, to: selected.to },
      );
      const onWordClick = vi.fn();
      const pageClick = vi.fn();
      document.addEventListener("click", pageClick);
      onTestFinished(() => document.removeEventListener("click", pageClick));
      // Room around the line, inside the test page.
      const screen = await mountInShadowRoot(
        <div style={{ padding: "100px 70px" }}>
          <SubtitleOverlay
            {...base}
            onSnap={onSnap}
            onSelect={onSelect}
            onWordClick={onWordClick}
          />
        </div>,
      );
      const box = line(screen).getBoundingClientRect();
      // Out past the right end and above the line, where the site's player is.
      await drag([
        pointIn(word(screen, "figure out"), 0.15),
        { x: box.right + 40, y: box.top - 40 },
        { x: box.right + 50, y: box.bottom + 30 },
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelect.mock.calls[0]![0]).toMatchObject({
        from: at("figure"),
        to: at("scratch") + "scratch".length,
      });
      expect(selectedOffsets(line(screen))).toBeDefined();
      expect(pageClick).not.toHaveBeenCalled();
      expect(onWordClick).not.toHaveBeenCalled();

      // Back past the start of its first line: the words before the one pressed.
      await drag([
        middleOf(word(screen, "bread")),
        { x: box.left - 50, y: box.top - 20 },
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(2);
      expect(onSelect.mock.calls[1]![0]).toMatchObject({
        from: 0,
        to: at("bread") + "bread".length,
        anchor: "end",
      });
      expect(pageClick).not.toHaveBeenCalled();
    });

    test("a drag goes across hyphens and commas, word by word", async () => {
      const text = "WH-WHAT? Well, I think so.";
      const onSnap = wholeWords(text);
      const onSelect = vi.fn(
        (selected?: { from: number; to: number }) =>
          selected && { from: selected.from, to: selected.to },
      );
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          text={text}
          spans={[]}
          onSnap={onSnap}
          onSelect={onSelect}
        />,
      );
      const box = line(screen).getBoundingClientRect();
      // From "WH" (the line's start) to the middle of "Well".
      const range = document.createRange();
      const node = line(screen).firstChild!;
      range.setStart(node, text.indexOf("Well"));
      range.setEnd(node, text.indexOf("Well") + 4);
      const well = range.getBoundingClientRect();
      await drag([
        { x: box.left + 18, y: box.top + box.height / 2 },
        { x: well.left + well.width / 2, y: well.top + well.height / 2 },
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSnap).toHaveBeenLastCalledWith(
        0,
        text.indexOf("Well") + 4,
        "start",
      );
      expect(selectedOffsets(line(screen))).toEqual({
        from: 0,
        to: text.indexOf("Well") + 4,
      });
    });

    test("a drag that starts inside the selected words selects anew instead of dragging them", async () => {
      const onSnap = wholeWords(TEXT);
      const onSelect = vi.fn(
        (selected?: { from: number; to: number }) =>
          selected && { from: selected.from, to: selected.to },
      );
      const screen = await mountInShadowRoot(
        <SubtitleOverlay {...base} onSnap={onSnap} onSelect={onSelect} />,
      );
      await drag([
        middleOf(word(screen, "today")),
        middleOf(word(screen, "bread")),
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(selectedOffsets(line(screen))).toEqual(whole("today", "bread"));

      await drag([
        pointIn(word(screen, "figure out"), 0.15),
        pointIn(word(screen, "from scratch"), 0.85),
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(2);
      expect(selectedOffsets(line(screen))).toEqual(whole("figure", "scratch"));
    });

    test("words it cannot keep are not left selected", async () => {
      const onSelect = vi.fn<(selected?: SelectedText) => undefined>();
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSnap={wholeWords(TEXT)}
          onSelect={onSelect}
        />,
      );
      await drag([
        middleOf(word(screen, "today")),
        middleOf(word(screen, "bread")),
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelect.mock.calls[0]![0]).toBeDefined();
      expect(selectedOffsets(line(screen))).toBeUndefined();
    });

    test("a drag inside a word selects that word and opens nothing itself", async () => {
      const onSelect = vi.fn<(selected?: SelectedText) => undefined>();
      const onWordClick = vi.fn();
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSnap={wholeWords(TEXT)}
          onSelect={onSelect}
          onWordClick={onWordClick}
        />,
      );
      const bread = word(screen, "bread").getBoundingClientRect();
      const y = bread.top + bread.height / 2;
      await drag([
        { x: bread.left + 2, y },
        { x: bread.right - 2, y },
      ]);
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelect.mock.calls[0]![0]).toMatchObject(whole("bread", "bread"));
      expect(onWordClick).not.toHaveBeenCalled();
    });

    test("a click selects nothing and opens the word", async () => {
      const onSelect = vi.fn<(selected?: SelectedText) => undefined>();
      const onSelectStart = vi.fn();
      const onWordClick = vi.fn();
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSnap={wholeWords(TEXT)}
          onSelectStart={onSelectStart}
          onSelect={onSelect}
          onWordClick={onWordClick}
        />,
      );
      await userEvent.click(word(screen, "bread"));
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelect).toHaveBeenCalledWith(undefined);
      expect(onSelectStart).not.toHaveBeenCalled();
      expect(onWordClick).toHaveBeenCalledWith(2);
      expect(selectedOffsets(line(screen))).toBeUndefined();
    });
  });
});
