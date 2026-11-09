import { describe, expect, it } from "vitest";
import { buildFreqIndex, rankOf } from "./frequency";

describe("rankOf", () => {
  const index = buildFreqIndex(["you", "i", "the"]);

  it("gives the 1-based rank", () => {
    expect(rankOf("you", index)).toBe(1);
    expect(rankOf("the", index)).toBe(3);
  });
  it("gives Infinity for a word outside the list", () => {
    expect(rankOf("zzyzx", index)).toBe(Infinity);
  });
});
