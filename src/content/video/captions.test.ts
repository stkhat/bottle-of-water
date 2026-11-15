import { describe, expect, it } from "vitest";
import type { TranslationChoice } from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import { captionCards } from "./captions";

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

const manual = (
  cues: Cue[],
  source: TranslationChoice["source"],
  translated: Cue[],
) =>
  captionCards({
    track: { id: "en", lang: "en", kind: "manual", label: "English" },
    cues,
    translation: { source, lang: "ja", cues: translated },
  });

/** Each card's text, its translation and the texts of its lines. */
const cardsOf = ({ state }: ReturnType<typeof captionCards>) =>
  state.cues.map((card, i) => ({
    text: card.text,
    translation: state.translations[i],
    lines: state.lines
      .filter((line) => line.card === i)
      .map((line) => card.text.slice(line.start, line.end)),
  }));

describe("captionCards for a manual track", () => {
  it("joins sentences that one line of a human translation covers", () => {
    const result = manual(
      [
        cue(0, 2000, "They feel fear and doubt."),
        cue(2000, 3500, "They procrastinate."),
        cue(4000, 6000, "So what do they do?"),
      ],
      "siteTrack",
      [
        cue(0, 3500, "恐れや疑いを感じて先延ばしにします"),
        cue(4000, 6000, "ではどうするか？"),
      ],
    );
    expect(cardsOf(result)).toEqual([
      {
        text: "They feel fear and doubt. They procrastinate.",
        translation: "恐れや疑いを感じて先延ばしにします",
        lines: ["They feel fear and doubt.", "They procrastinate."],
      },
      {
        text: "So what do they do?",
        translation: "ではどうするか？",
        lines: ["So what do they do?"],
      },
    ]);
    // Each cue is still a subtitle line with its own times.
    expect(result.state.lines.map((l) => [l.startMs, l.endMs])).toEqual([
      [0, 2000],
      [2000, 3500],
      [4000, 6000],
    ]);
    expect(result.timed?.cues).toHaveLength(2);
  });

  it("does not join past 30 words", () => {
    const long = (n: number) =>
      Array.from({ length: n }, () => "word").join(" ") + ".";
    const result = manual(
      [cue(0, 2000, long(16)), cue(2000, 4000, long(16))],
      "siteTrack",
      [cue(100, 4000, "長い一行")],
    );
    expect(result.state.cues).toHaveLength(2);
    // The line shows on both cards (rule G).
    expect(result.state.translations).toEqual(["長い一行", "長い一行"]);
  });

  it("follows the sentences of the site's machine translation, keeping each cue whole", () => {
    const result = manual(
      [
        cue(0, 2000, "I went to the store"),
        cue(2000, 4000, "and bought some milk."),
        cue(4000, 5000, "Then I went home."),
        cue(5000, 7000, "- Jay Martel.\n- Nice to meet you."),
      ],
      "siteAutoTranslate",
      // YouTube spreads each translated sentence over the cues it covers, keeping the
      // original's line breaks (joined without a space in Japanese).
      [
        cue(0, 2000, "私は\n店に"),
        cue(2000, 4000, "行って牛乳を買った。"),
        cue(4000, 5000, "それから家に帰った。"),
        cue(5000, 7000, "ジェイ・マーテルです。はじめまして。"),
      ],
    );
    expect(cardsOf(result)).toEqual([
      {
        text: "I went to the store and bought some milk.",
        translation: "私は店に行って牛乳を買った。",
        lines: ["I went to the store", "and bought some milk."],
      },
      {
        text: "Then I went home.",
        translation: "それから家に帰った。",
        lines: ["Then I went home."],
      },
      {
        // Two speakers in one cue: one card, each dash line on its own line.
        text: "- Jay Martel.\n- Nice to meet you.",
        translation: "ジェイ・マーテルです。はじめまして。",
        lines: ["- Jay Martel.\n- Nice to meet you."],
      },
    ]);
  });
});
