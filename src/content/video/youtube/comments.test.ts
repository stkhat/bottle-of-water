import { describe, expect, it } from "vitest";
import { mergeSettings } from "../../../core/settings";
import { commentsAllowedOn, shortsPanelFrame } from "./comments";

const settings = (patch: object = {}) => mergeSettings(patch);

describe("commentsAllowedOn", () => {
  it("runs on YouTube by default", () => {
    expect(commentsAllowedOn("www.youtube.com", settings())).toBe(true);
  });

  it("stays off when the comments or YouTube are switched off", () => {
    expect(
      commentsAllowedOn(
        "www.youtube.com",
        settings({ sites: { youtubeComments: false } }),
      ),
    ).toBe(false);
    expect(
      commentsAllowedOn(
        "www.youtube.com",
        settings({ sites: { youtube: false } }),
      ),
    ).toBe(false);
  });

  it("stays off on a blocked host", () => {
    expect(
      commentsAllowedOn(
        "www.youtube.com",
        settings({ disabledSites: ["www.youtube.com"] }),
      ),
    ).toBe(false);
    expect(
      commentsAllowedOn(
        "www.youtube.com",
        settings({ neverRunOn: ["youtube.com"] }),
      ),
    ).toBe(false);
  });

  it("stays off while Lingo is switched off", () => {
    expect(
      commentsAllowedOn("www.youtube.com", settings({ enabled: false })),
    ).toBe(false);
  });

  it("does not follow the player's L button", () => {
    expect(
      commentsAllowedOn(
        "www.youtube.com",
        settings({ videoOn: { youtube: false } }),
      ),
    ).toBe(true);
  });
});

describe("shortsPanelFrame", () => {
  const viewport = { width: 1440, height: 900 };

  it("puts the panel 16px left of a Short's comments panel, as tall as it (mock)", () => {
    expect(
      shortsPanelFrame({ left: 820, top: 72, bottom: 876 }, viewport),
    ).toEqual({ top: 72, right: 636, bottom: 24 });
  });

  it("keeps the panel on screen beside a panel far to the left", () => {
    expect(
      shortsPanelFrame({ left: 200, top: 72, bottom: 876 }, viewport).right,
    ).toBe(1440 - 340 - 8);
  });
});
