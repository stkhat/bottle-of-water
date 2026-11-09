import { afterEach, describe, expect, test, vi } from "vitest";
import type { Span } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import { cleanUpMounts, mountInShadowRoot } from "../lookup/testing";
import { Transcript, type TranscriptProps } from "./Transcript";

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

const base: TranscriptProps = {
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
  learningLang: "en",
  nativeLang: "ja",
  height: 300,
};

afterEach(cleanUpMounts);

const cards = (screen: { container: HTMLElement }) => [
  ...screen.container.querySelectorAll<HTMLButtonElement>("[data-cue]"),
];

describe("Transcript", () => {
  test("has the header: L badge, Transcript, Translation switch and Highlight chips", async () => {
    const screen = await mountInShadowRoot(<Transcript {...base} />);
    await expect
      .element(screen.getByRole("complementary", { name: "Transcript" }))
      .toBeVisible();
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
    const screen = await mountInShadowRoot(<Transcript {...base} />);
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
      <Transcript
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
    const screen = await mountInShadowRoot(<Transcript {...base} />);
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
      <Transcript {...base} showTranslation={false} />,
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
    const screen = await mountInShadowRoot(<Transcript {...base} />);
    const figure = screen.getByText("figure out").element();
    expect(getComputedStyle(figure).backgroundColor).toBe("rgb(211, 241, 229)");
    const bunch = screen.getByText("bunch").element();
    expect(getComputedStyle(bunch).boxShadow).toBe("none");
  });

  test("emphasizes the playing card with Now playing", async () => {
    const screen = await mountInShadowRoot(<Transcript {...base} />);
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
      <Transcript {...base} onSeek={onSeek} />,
    );
    await screen.getByRole("button", { name: /^1:09/ }).click();
    expect(onSeek).toHaveBeenCalledWith(3);
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
    const screen = await mountInShadowRoot(<Transcript {...props} />);
    const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
    const pageScroll = scrollY;
    screen.rerender(<Transcript {...props} current={30} />);
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
    const screen = await mountInShadowRoot(<Transcript {...props} />);
    const list = screen.container.querySelector<HTMLElement>("[data-list]")!;
    list.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
    screen.rerender(<Transcript {...props} current={30} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(list.scrollTop).toBe(0);
    // After the pause, the next card brings it back.
    await new Promise((resolve) => setTimeout(resolve, 300));
    screen.rerender(<Transcript {...props} current={31} />);
    await expect.poll(() => list.scrollTop).toBeGreaterThan(0);
  });
});
