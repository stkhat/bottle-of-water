import { afterEach, describe, expect, test, vi } from "vitest";
import type { Span } from "../../core/classify";
import { cleanUpMounts, mountInShadowRoot } from "../lookup/testing";
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
    screen.rerender(<SubtitleOverlay {...base} translation="" />);
    expect(screen.container.querySelectorAll("[lang=ja]")).toHaveLength(0);
  });

  test("colors only the categories that are switched on, brighter over the video", async () => {
    const screen = await mountInShadowRoot(<SubtitleOverlay {...base} />);
    const figure = getComputedStyle(word(screen, "figure out"));
    expect(figure.backgroundColor).toBe("rgba(15, 159, 126, 0.55)");
    expect(figure.boxShadow).toContain("rgb(111, 227, 195)");
    expect(getComputedStyle(word(screen, "bread")).boxShadow).toBe("none");
    expect(getComputedStyle(word(screen, "today")).boxShadow).toBe("none");

    screen.rerender(
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
    bread.dispatchEvent(new PointerEvent("pointerenter"));
    expect(onWordEnter).toHaveBeenCalledWith(2, bread);
    bread.dispatchEvent(new PointerEvent("pointerleave"));
    expect(onWordLeave).toHaveBeenCalledTimes(1);
    bread.click();
    expect(onWordClick).toHaveBeenCalledWith(2);
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
});
