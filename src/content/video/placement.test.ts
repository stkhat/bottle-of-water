import { describe, expect, it } from "vitest";
import { dictionaryFrame, menuPlacement } from "./placement";

/** Mock Main: the 880×495 video at (24, 112) on the 1440×900 artboard. */
const PLAYER = { left: 24, top: 112, right: 904, bottom: 607 };
/** Mock Main: the transcript column (its content starts at 1088, under the header). */
const TRANSCRIPT = { left: 1088, top: 56, right: 1440, bottom: 900 };
const VIEWPORT = { width: 1440, height: 900 };

describe("dictionaryFrame", () => {
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
    expect(menuPlacement(PLAYER, buttons)).toEqual({ right: 100, bottom: 60 });
  });

  it("stays inside the player", () => {
    const buttons = { left: 860, top: 560, right: 900, bottom: 600 };
    expect(menuPlacement(PLAYER, buttons).right).toBe(8);
  });
});
