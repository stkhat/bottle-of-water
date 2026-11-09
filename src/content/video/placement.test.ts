import { describe, expect, it } from "vitest";
import { dictionaryFrame, menuPlacement } from "./placement";

/** Mock Main: the 880×495 video at (24, 112) on the 1440×900 artboard. */
const PLAYER = { left: 24, top: 112, right: 904, bottom: 607 };
const VIEWPORT = { width: 1440, height: 900 };

describe("dictionaryFrame", () => {
  it("in the video: beside the right part of the video, above the subtitle (mock Main)", () => {
    expect(dictionaryFrame(PLAYER, "inVideo", VIEWPORT)).toEqual({
      left: 740,
      top: 70,
      height: 339,
    });
  });

  it("below the video: taller (mock Main)", () => {
    expect(dictionaryFrame(PLAYER, "belowVideo", VIEWPORT)).toEqual({
      left: 700,
      top: 80,
      height: 530,
    });
  });

  it("stays below the site's header and inside the viewport", () => {
    const high = { left: 0, top: 56, right: 1300, bottom: 787 };
    expect(
      dictionaryFrame(high, "inVideo", { width: 1400, height: 900 }),
    ).toEqual({
      left: 1032,
      top: 64,
      height: 340,
    });
    const small = { width: 800, height: 500 };
    const frame = dictionaryFrame(PLAYER, "belowVideo", small);
    expect(frame.left).toBe(800 - 360 - 8);
    expect(frame.top + frame.height).toBeLessThanOrEqual(500 - 8);
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
