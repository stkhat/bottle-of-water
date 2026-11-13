import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Span } from "../../core/classify";
import {
  addPageStyle,
  cleanUpMounts,
  mountInShadowRoot,
} from "../../testing/shadow-root";
import { selectedOffsets } from "../selection-in-root";
import { SubtitleOverlay, type SubtitleOverlayProps } from "./SubtitleOverlay";

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
    const drag = (from: HTMLElement, to: HTMLElement) =>
      userEvent.dragAndDrop(page.elementLocator(from), page.elementLocator(to));

    test("selects words over a player whose text is not selectable, and selects the whole words it is told", async () => {
      // The players' own style, which would carry down into the subtitle.
      addPageStyle("body { user-select: none; -webkit-user-select: none }");
      const onSelectStart = vi.fn();
      const whole = { from: at("today"), to: at("bread") + "bread".length };
      const onSelect = vi.fn(() => whole);
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSelectStart={onSelectStart}
          onSelect={onSelect}
        />,
      );
      await drag(word(screen, "today"), word(screen, "bread"));
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelectStart).toHaveBeenCalledOnce();
      const selected = (onSelect.mock.calls[0] as unknown[])[0] as {
        from: number;
        to: number;
        boxOf(from: number, to: number): unknown;
      };
      // From inside "today" to inside "bread".
      expect(selected.from).toBeGreaterThan(at("today"));
      expect(selected.from).toBeLessThan(at("today") + "today".length);
      expect(selected.to).toBeGreaterThan(at("bread"));
      expect(selected.to).toBeLessThan(at("bread") + "bread".length);
      // The box of the words' first line, inside the line's box.
      const box = selected.boxOf(whole.from, whole.to) as DOMRect;
      const lineBox = line(screen).getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(lineBox.left);
      expect(box.right).toBeLessThanOrEqual(lineBox.right);
      expect(selectedOffsets(line(screen))).toEqual(whole);
    });

    test("a drag that starts inside the selected words selects anew instead of dragging them", async () => {
      const whole = { from: at("today"), to: at("bread") + "bread".length };
      const onSelect = vi.fn((): typeof whole | undefined => whole);
      const screen = await mountInShadowRoot(
        <SubtitleOverlay {...base} onSelect={onSelect} />,
      );
      await drag(word(screen, "today"), word(screen, "bread"));
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(selectedOffsets(line(screen))).toEqual(whole);

      onSelect.mockImplementation(() => undefined);
      await drag(word(screen, "figure out"), word(screen, "from scratch"));
      await expect.poll(() => onSelect.mock.calls.length).toBe(2);
      const selected = (onSelect.mock.calls[1] as unknown[])[0] as {
        from: number;
        to: number;
      };
      expect(selected.from).toBeGreaterThan(at("figure"));
      expect(selected.to).toBeGreaterThan(at("from"));
    });

    test("a drag inside a word opens nothing", async () => {
      const onSelect = vi.fn(() => undefined);
      const onWordClick = vi.fn();
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSelect={onSelect}
          onWordClick={onWordClick}
        />,
      );
      const bread = word(screen, "bread");
      const { width, height } = bread.getBoundingClientRect();
      await userEvent.dragAndDrop(
        page.elementLocator(bread),
        page.elementLocator(bread),
        {
          sourcePosition: { x: 4, y: height / 2 },
          targetPosition: { x: width - 4, y: height / 2 },
        },
      );
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelect.mock.calls[0]).toEqual([
        expect.objectContaining({ from: expect.any(Number) }),
      ]);
      expect(onWordClick).not.toHaveBeenCalled();
    });

    test("a click selects nothing and opens the word", async () => {
      const onSelect = vi.fn(() => undefined);
      const onWordClick = vi.fn();
      const screen = await mountInShadowRoot(
        <SubtitleOverlay
          {...base}
          onSelect={onSelect}
          onWordClick={onWordClick}
        />,
      );
      await userEvent.click(word(screen, "bread"));
      await expect.poll(() => onSelect.mock.calls.length).toBe(1);
      expect(onSelect).toHaveBeenCalledWith(undefined);
      expect(onWordClick).toHaveBeenCalledWith(2);
    });
  });
});
