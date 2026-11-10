import { describe, expect, it } from "vitest";
import type { OccurrenceView } from "../../messaging/protocol";
import { elsewhereItems, formatTime } from "./elsewhere";

const view = (patch: Partial<OccurrenceView>): OccurrenceView => ({
  sentence: "Add the yeast to warm water first.",
  pos: { timeMs: 100_000 },
  seenAt: 1,
  origin: "saved",
  source: {
    title: "Baking bread from scratch at home",
    platform: "youtube",
    url: "https://www.youtube.com/watch?v=abc",
  },
  link: "https://www.youtube.com/watch?v=abc&t=100s",
  ...patch,
});

describe("formatTime", () => {
  it("writes m:ss, and h:mm:ss from an hour", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(154_900)).toBe("2:34");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });
});

describe("elsewhereItems", () => {
  it("shows a video with its site and time", () => {
    expect(elsewhereItems([view({})])).toEqual([
      {
        title: "Baking bread from scratch at home",
        meta: "YouTube · at 1:40",
        text: "Add the yeast to warm water first.",
        href: "https://www.youtube.com/watch?v=abc&t=100s",
        video: true,
      },
    ]);
  });

  it("shows a web page with its host", () => {
    const [item] = elsewhereItems([
      view({
        pos: { textQuote: "The yeast and bacteria have more time." },
        sentence: "The yeast and bacteria have more time.",
        source: {
          title: "Why patient bakers end up with better bread",
          platform: "web",
          url: "https://www.example.com/bread?id=1",
        },
        link: "https://www.example.com/bread?id=1",
      }),
    ]);
    expect(item).toEqual({
      title: "Why patient bakers end up with better bread",
      meta: "example.com",
      text: "The yeast and bacteria have more time.",
      href: "https://www.example.com/bread?id=1",
      video: false,
    });
  });

  it("names Netflix and falls back to the URL for an untitled page", () => {
    const [netflix, untitled] = elsewhereItems([
      view({
        source: {
          title: "Episode 1",
          platform: "netflix",
          url: "https://www.netflix.com/watch/1",
        },
      }),
      view({
        pos: { textQuote: "x" },
        source: { title: "", platform: "web", url: "http://localhost:4719/a" },
      }),
    ]);
    expect(netflix!.meta).toBe("Netflix · at 1:40");
    expect(untitled!.title).toBe("http://localhost:4719/a");
    expect(untitled!.meta).toBe("localhost");
  });
});
