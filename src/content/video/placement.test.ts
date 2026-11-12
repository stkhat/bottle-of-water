import { describe, expect, it } from "vitest";
import {
  dictionaryFrame,
  menuBelowPlacement,
  menuPlacement,
  verticalDictionaryFrame,
} from "./placement";

/** Mock Main: the 880×495 video at (24, 112) on the 1440×900 artboard. */
const PLAYER = { left: 24, top: 112, right: 904, bottom: 607 };
/** Mock Main: the transcript column (its content starts at 1088, under the header). */
const TRANSCRIPT = { left: 1088, top: 56, right: 1440, bottom: 900 };
const VIEWPORT = { width: 1440, height: 900 };

describe("dictionaryFrame", () => {
  it("beside the transcript sidebar: its right edge at the sidebar, 72px from the top, 420px tall (mock FullWindow)", () => {
    // The 1440×900 window: the player 1048px wide, the sidebar 16px in from the edges.
    const player = { left: 0, top: 0, right: 1048, bottom: 900 };
    const sidebar = { left: 1064, top: 16, right: 1424, bottom: 884 };
    expect(dictionaryFrame(player, "sidebar", VIEWPORT, sidebar)).toEqual({
      left: 704,
      top: 72,
      height: 420,
    });
    // A short window: it stops 8px above the bottom.
    expect(
      dictionaryFrame(player, "sidebar", { width: 1440, height: 400 }, sidebar)
        .height,
    ).toBe(320);
  });

  it("in the video: over the right part of the video, 12px into the transcript, above the subtitle (mock Main)", () => {
    expect(dictionaryFrame(PLAYER, "inVideo", VIEWPORT, TRANSCRIPT)).toEqual({
      left: 740,
      top: 70,
      height: 339,
    });
  });

  it("below the video: taller, and clear of the transcript (mock Main)", () => {
    expect(dictionaryFrame(PLAYER, "belowVideo", VIEWPORT, TRANSCRIPT)).toEqual(
      {
        left: 700,
        top: 80,
        height: 530,
      },
    );
  });

  it("follows the transcript's column, however far it is from the video", () => {
    // YouTube at 1400px wide: the side column starts 16px after the video.
    const player = { left: 16, top: 12, right: 983, bottom: 737 };
    const transcript = { left: 999, top: 12, right: 1384, bottom: 737 };
    const viewport = { width: 1400, height: 900 };
    const inVideo = dictionaryFrame(player, "inVideo", viewport, transcript);
    expect(inVideo.left + 360).toBe(999 + 12);
    const below = dictionaryFrame(player, "belowVideo", viewport, transcript);
    expect(below.left + 360).toBe(999 - 28);
  });

  it("without a transcript beside the video: ends at the video's right edge", () => {
    expect(dictionaryFrame(PLAYER, "inVideo", VIEWPORT, null).left).toBe(
      904 - 360,
    );
    expect(dictionaryFrame(PLAYER, "belowVideo", VIEWPORT).left).toBe(
      904 - 40 - 360,
    );
    // A transcript under the video (YouTube's theater mode) is not beside it.
    const under = { left: 940, top: 620, right: 1380, bottom: 900 };
    expect(dictionaryFrame(PLAYER, "inVideo", VIEWPORT, under).left).toBe(
      904 - 360,
    );
  });

  it("stays below the site's header and inside the viewport", () => {
    const high = { left: 0, top: 56, right: 1300, bottom: 787 };
    expect(
      dictionaryFrame(
        high,
        "inVideo",
        { width: 1400, height: 900 },
        {
          left: 1380,
          top: 56,
          right: 1400,
          bottom: 900,
        },
      ),
    ).toEqual({
      left: 1032,
      top: 64,
      height: 340,
    });
    const small = { width: 800, height: 500 };
    const frame = dictionaryFrame(PLAYER, "belowVideo", small, TRANSCRIPT);
    expect(frame.left).toBe(800 - 360 - 8);
    expect(frame.top + frame.height).toBeLessThanOrEqual(500 - 8);
    const narrow = { left: 0, top: 112, right: 300, bottom: 400 };
    expect(dictionaryFrame(narrow, "inVideo", VIEWPORT).left).toBe(8);
  });

  it("in fullscreen: top right, 32px from the edges, 360×420 (mock Fullscreen)", () => {
    const screen = { left: 0, top: 0, right: 1440, bottom: 900 };
    expect(dictionaryFrame(screen, "fullscreen", VIEWPORT, null)).toEqual({
      left: 1440 - 32 - 360,
      top: 32,
      height: 420,
    });
    // A small screen: inside it.
    expect(
      dictionaryFrame(screen, "fullscreen", { width: 380, height: 300 }),
    ).toEqual({ left: 8, top: 32, height: 260 });
  });

  it("is never shorter than 240px", () => {
    const short = { left: 24, top: 112, right: 504, bottom: 382 };
    expect(dictionaryFrame(short, "inVideo", VIEWPORT).height).toBe(240);
  });
});

describe("menuPlacement", () => {
  it("opens above the buttons, its right edge 38px right of theirs (mock Main)", () => {
    // Mock: the group's right edge 138px from the video's, its top 47px above the bottom.
    const buttons = {
      left: 24 + 667,
      top: 607 - 47,
      right: 904 - 138,
      bottom: 607 - 5,
    };
    // 100px left of the video's right edge, 60px above its bottom.
    expect(menuPlacement(PLAYER, buttons, VIEWPORT)).toEqual({
      right: 1440 - 904 + 100,
      bottom: 900 - 607 + 60,
    });
  });

  it("stays inside the player", () => {
    const buttons = { left: 860, top: 560, right: 900, bottom: 600 };
    expect(menuPlacement(PLAYER, buttons, VIEWPORT).right).toBe(1440 - 904 + 8);
  });
});

/** Mock `YouTube Shorts — subtitles`: the 405×720 Short at (517, 72), its buttons at 934–982. */
const SHORT = { left: 517, top: 72, right: 922, bottom: 792 };
const ACTION_BAR = { left: 934, top: 476, right: 982, bottom: 700 };

describe("verticalDictionaryFrame", () => {
  it("opens right of the Short's buttons, level with the video (mock)", () => {
    expect(verticalDictionaryFrame(SHORT, ACTION_BAR, VIEWPORT)).toEqual({
      left: 1000,
      top: 72,
      height: 560,
    });
  });

  it("goes beside the video without the buttons, and stays on a narrow screen", () => {
    expect(verticalDictionaryFrame(SHORT, null, VIEWPORT).left).toBe(940);
    expect(
      verticalDictionaryFrame(SHORT, ACTION_BAR, { width: 1100, height: 600 }),
    ).toEqual({ left: 1100 - 360 - 8, top: 72, height: 600 - 8 - 72 });
  });
});

describe("menuBelowPlacement", () => {
  it("opens 12px under the buttons, 16px in from the Short's right edge (mock)", () => {
    const buttons = { left: 760, top: 88, right: 842, bottom: 132 };
    expect(menuBelowPlacement(SHORT, buttons, VIEWPORT)).toEqual({
      right: 1440 - 922 + 16,
      top: 144,
    });
  });
});
