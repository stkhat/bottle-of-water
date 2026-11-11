import { describe, expect, it } from "vitest";
import type { OccurrenceView } from "../../messaging/protocol";
import { elsewhereItems, occurrenceItem } from "./elsewhere";

/** Nov 8 and Nov 10, 2026, at noon local time. */
const NOV_8 = new Date(2026, 10, 8, 12).getTime();
const NOV_10 = new Date(2026, 10, 10, 12).getTime();

const view = (patch: Partial<OccurrenceView>): OccurrenceView => ({
  sentence: "Add the yeast to warm water first.",
  pos: { timeMs: 100_000 },
  seenAt: NOV_8,
  origin: "saved",
  source: {
    title: "Baking bread from scratch at home",
    platform: "youtube",
    url: "https://www.youtube.com/watch?v=abc",
  },
  link: "https://www.youtube.com/watch?v=abc&t=100s",
  ...patch,
});

describe("occurrenceItem and elsewhereItems", () => {
  it("shows a video with its site, time and the day it was seen", () => {
    expect(elsewhereItems([view({})], NOV_10)).toEqual([
      {
        title: "Baking bread from scratch at home",
        meta: "YouTube · at 1:40 · Nov 8",
        text: "Add the yeast to warm water first.",
        href: "https://www.youtube.com/watch?v=abc&t=100s",
        video: true,
      },
    ]);
  });

  it("shows a web page with its host and the day it was seen", () => {
    const [item] = elsewhereItems(
      [
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
      ],
      NOV_10,
    );
    expect(item).toEqual({
      title: "Why patient bakers end up with better bread",
      meta: "example.com · Nov 8",
      text: "The yeast and bacteria have more time.",
      href: "https://www.example.com/bread?id=1",
      video: false,
    });
  });

  it("says Today for a sentence seen today", () => {
    expect(elsewhereItems([view({})], NOV_8 + 1000)[0]!.meta).toBe(
      "YouTube · at 1:40 · Today",
    );
  });

  it("names Netflix and falls back to the URL for an untitled page", () => {
    const [netflix, untitled] = [
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
    ].map(occurrenceItem);
    expect(netflix!.meta).toBe("Netflix · at 1:40");
    expect(untitled!.title).toBe("http://localhost:4719/a");
    expect(untitled!.meta).toBe("localhost");
  });
});
