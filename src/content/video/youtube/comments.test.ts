import { describe, expect, it } from "vitest";
import { mergeSettings } from "../../../core/settings";
import { commentsAllowedOn } from "./comments";

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

  it("does not follow the player's L button", () => {
    expect(
      commentsAllowedOn(
        "www.youtube.com",
        settings({ videoOn: { youtube: false } }),
      ),
    ).toBe(true);
  });
});
