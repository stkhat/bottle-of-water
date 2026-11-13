import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Span } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import type * as Terms from "./terms";
import { renderTerms } from "./terms";
import { Transcript, type TranscriptProps } from "./Transcript";

// Counts the cards that render (each renders its words once per render).
vi.mock("./terms", async (actual) => {
  const terms = await actual<typeof Terms>();
  return { ...terms, renderTerms: vi.fn(terms.renderTerms) };
});
const rendered = vi.mocked(renderTerms);

const CUES: Cue[] = [
  { startMs: 0, endMs: 1000, text: "Knead the dough." },
  { startMs: 1000, endMs: 2000, text: "Let it rest." },
  { startMs: 2000, endMs: 3000, text: "Bake the loaf." },
];
const span = (
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
const SPANS: Span[][] = [
  [span(CUES[0]!.text, "dough", "new")],
  [span(CUES[1]!.text, "rest", "new")],
  [span(CUES[2]!.text, "loaf", "new")],
];

/** New handlers and a new (equal) highlight object each time, as the store's renders give. */
const props = (patch: Partial<TranscriptProps> = {}): TranscriptProps => ({
  cues: CUES,
  spans: SPANS,
  translations: ["", "", ""],
  showTranslation: true,
  highlight: { new: true, learning: true, known: false },
  current: 0,
  onSeek: () => {},
  onWordEnter: () => {},
  onWordLeave: () => {},
  onWordClick: () => {},
  onSelectStart: () => {},
  onSelect: () => undefined,
  learningLang: "en",
  nativeLang: "ja",
  ...patch,
});

/** The texts of the cards that rendered since the last call. */
function renders() {
  const texts = rendered.mock.calls.map(([text]) => text);
  rendered.mockClear();
  return texts;
}

beforeEach(() => {
  rendered.mockClear();
});
afterEach(cleanUpMounts);

describe("the transcript's cards", () => {
  test("render again only where what they show changed", async () => {
    const screen = await mountInShadowRoot(<Transcript {...props()} />);
    expect(renders()).toEqual(CUES.map((cue) => cue.text));

    // A store change the cards do not show (a hover, a selection): no card renders.
    await screen.rerender(<Transcript {...props()} />);
    expect(renders()).toEqual([]);

    // The playing card moves: the two cards it left and entered.
    await screen.rerender(<Transcript {...props({ current: 1 })} />);
    expect(renders()).toEqual([CUES[0]!.text, CUES[1]!.text]);

    // One cue classified again with a change.
    const spans = [...SPANS];
    spans[2] = [span(CUES[2]!.text, "loaf", "learning")];
    await screen.rerender(<Transcript {...props({ current: 1, spans })} />);
    expect(renders()).toEqual([CUES[2]!.text]);

    // A setting every card shows.
    await screen.rerender(
      <Transcript
        {...props({
          current: 1,
          spans,
          highlight: { new: false, learning: true, known: false },
        })}
      />,
    );
    expect(renders()).toHaveLength(3);
  });

  test("a card that did not render calls the latest handlers", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const screen = await mountInShadowRoot(
      <Transcript {...props({ onWordClick: first })} />,
    );
    await screen.rerender(<Transcript {...props({ onWordClick: latest })} />);
    renders();
    await userEvent.click(screen.getByText("loaf"));
    expect(renders()).toEqual([]);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(2, 0);
  });
});
