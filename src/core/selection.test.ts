import { describe, expect, it } from "vitest";
import type { Span } from "./classify";
import { selectionKey, snapWords } from "./selection";
import { tokenize } from "./text/tokenize";

/** Word spans of `text` (key = lowercased word). */
function wordSpans(text: string): Span[] {
  return tokenize(text, "en")
    .filter((t) => t.isWord)
    .map((t) => ({
      start: t.start,
      end: t.end,
      key: t.text.toLowerCase(),
      kind: "word",
      category: "new",
    }));
}

/** Snaps the text from the start of `from` to the end of `to`. */
function select(
  text: string,
  spans: readonly Span[],
  from: string,
  to: string,
) {
  return snapWords(
    text,
    spans,
    text.indexOf(from),
    text.indexOf(to) + to.length,
  );
}

const textOf = (text: string, s: { start: number; end: number } | undefined) =>
  s && text.slice(s.start, s.end);

const TEXT =
  "Keep notes, so you can trace each rise and fall back to its cause.";

describe("snapWords", () => {
  it("snaps a selection to whole words", () => {
    const spans = wordSpans(TEXT);
    const snapped = snapWords(
      TEXT,
      spans,
      TEXT.indexOf("rise") + 2,
      TEXT.indexOf("fall") + 2,
    );
    expect(textOf(TEXT, snapped)).toBe("rise and fall");
    expect(snapped!.spans.map((s) => s.key)).toEqual(["rise", "and", "fall"]);
  });

  it("takes 2 to 8 words", () => {
    const text = "one two three four five six seven eight nine ten";
    const spans = wordSpans(text);
    expect(select(text, spans, "one", "one")).toBeUndefined();
    expect(select(text, spans, "one", "two")?.spans).toHaveLength(2);
    expect(select(text, spans, "one", "eight")?.spans).toHaveLength(8);
    expect(select(text, spans, "one", "nine")).toBeUndefined();
  });

  it("counts the words of a saved phrase inside the selection", () => {
    const text = "a b c d e f g figure out";
    const start = text.indexOf("figure");
    const spans: Span[] = [
      ...wordSpans(text).filter((s) => s.start < start),
      {
        start,
        end: text.length,
        key: "figure out",
        kind: "phrase",
        category: "learning",
      },
    ];
    // "b" … "figure out" is 8 words; "a" … is 9.
    expect(select(text, spans, "b", "out")).toBeDefined();
    expect(select(text, spans, "a", "out")).toBeUndefined();
  });

  it("snaps to the words of a detected phrase, not to the whole phrase", () => {
    const start = TEXT.indexOf("fall back");
    const end = start + "fall back".length;
    const words = wordSpans(TEXT);
    // "fell back" would be keyed "fall back": the keys are base forms.
    const spans: Span[] = [
      ...words.filter((s) => s.end <= start),
      { start, end, key: "fall back", kind: "phrase", category: "new" },
      ...words.filter((s) => s.start >= end),
    ];
    const from = TEXT.indexOf("rise") + 2;
    const snapped = snapWords(TEXT, spans, from, start + 2);
    expect(textOf(TEXT, snapped)).toBe("rise and fall");
    expect(snapped!.spans.map((s) => s.key)).toEqual(["rise", "and", "fall"]);

    const whole = snapWords(TEXT, spans, from, start + "fall b".length);
    expect(whole!.spans.map((s) => s.key)).toEqual([
      "rise",
      "and",
      "fall",
      "back",
    ]);
  });

  /** `text`'s word spans with `words` as one saved phrase span. */
  function withPhrase(
    text: string,
    words: string,
    phrase: Partial<Span> = {},
  ): Span[] {
    const start = text.indexOf(words);
    const end = start + words.length;
    const all = wordSpans(text);
    return [
      ...all.filter((s) => s.end <= start),
      {
        start,
        end,
        key: words,
        kind: "phrase",
        category: "learning",
        ...phrase,
      },
      ...all.filter((s) => s.start >= end),
    ];
  }
  const withFallBack = (phrase: Partial<Span> = {}) =>
    withPhrase(TEXT, "fall back", phrase);

  it("snaps to the words of a saved phrase the selection only partly covers", () => {
    const spans = withFallBack();
    const fall = TEXT.indexOf("fall");
    const fromRise = select(TEXT, spans, "rise", "fall");
    expect(textOf(TEXT, fromRise)).toBe("rise and fall");
    expect(selectionKey(TEXT, fromRise!.spans)).toBe("rise and fall");
    const fromBack = snapWords(
      TEXT,
      spans,
      fall + "fall b".length,
      TEXT.indexOf("its") + 1,
    );
    expect(textOf(TEXT, fromBack)).toBe("back to its");
    expect(selectionKey(TEXT, fromBack!.spans)).toBe("back to its");
  });

  it("keeps a saved phrase whole when the selection covers all of it", () => {
    const snapped = select(TEXT, withFallBack(), "and", "back");
    expect(textOf(TEXT, snapped)).toBe("and fall back");
    expect(snapped!.spans.map((s) => s.key)).toEqual(["and", "fall back"]);
  });

  it("does not widen past 8 words for a long saved phrase it partly covers", () => {
    const text = "one two three four five six seven eight nine ten";
    const spans = withPhrase(text, "three four five six seven eight nine", {
      category: "known",
    });
    const snapped = select(text, spans, "two", "four");
    expect(textOf(text, snapped)).toBe("two three four");
  });

  it("widens to a whole saved phrase whose key has a slot filled by another word", () => {
    const text = "So she made up her mind at last.";
    const spans = withPhrase(text, "made up her mind", {
      key: "make up one's mind",
      slot: true,
    });
    const snapped = select(text, spans, "she", "made");
    expect(textOf(text, snapped)).toBe("she made up her mind");
    expect(selectionKey(text, snapped!.spans)).toBe("she make up one's mind");
  });

  it("widens to a whole saved phrase whose key has a word count other than its text's", () => {
    const snapped = select(
      TEXT,
      withFallBack({ key: "fall back on" }),
      "rise",
      "fall",
    );
    expect(textOf(TEXT, snapped)).toBe("rise and fall back");
  });

  it("widens to every part of a saved phrase with a gap, counting each part's words", () => {
    const text = "a b c d e figure it out now";
    const at = (word: string) => text.indexOf(word);
    const whole = { start: at("figure"), end: at("out") + "out".length };
    const part = (word: string, i: number): Span => ({
      start: at(word),
      end: at(word) + word.length,
      key: "figure out",
      kind: "phrase",
      category: "learning",
      part: { index: i, count: 2, ...whole },
    });
    const spans = wordSpans(text).map((s) => {
      const word = text.slice(s.start, s.end);
      return word === "figure"
        ? part(word, 0)
        : word === "out"
          ? part(word, 1)
          : s;
    });

    const snapped = select(text, spans, "it", "now");
    expect(textOf(text, snapped)).toBe("figure it out now");
    expect(snapped!.spans.map((s) => s.key)).toEqual([
      "figure out",
      "it",
      "figure out",
      "now",
    ]);
    expect(selectionKey(text, snapped!.spans)).toBe("figure it out now");

    const fromFigure = snapWords(text, spans, at("figure") + 2, at("it") + 1);
    expect(textOf(text, fromFigure)).toBe("figure it out");
    // "a" … "out" is 8 words; "a" … "now" is 9.
    expect(select(text, spans, "a", "out")).toBeDefined();
    expect(select(text, spans, "a", "now")).toBeUndefined();
  });

  it("rejects words across punctuation or a line break", () => {
    const spans = wordSpans(TEXT);
    expect(select(TEXT, spans, "notes", "you")).toBeUndefined();
    const lines = "one two\nthree";
    expect(select(lines, wordSpans(lines), "two", "three")).toBeUndefined();
  });

  it("rejects a collapsed selection", () => {
    expect(snapWords(TEXT, wordSpans(TEXT), 3, 3)).toBeUndefined();
  });
});

describe("selectionKey", () => {
  it("keys a selection by its words' keys", () => {
    const snapped = select(TEXT, wordSpans(TEXT), "rise", "fall");
    expect(selectionKey(TEXT, snapped!.spans)).toBe("rise and fall");
  });
});
