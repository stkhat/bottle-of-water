import { describe, expect, it } from "vitest";
import { ipaCoverage } from "./stats.mjs";

describe("ipaCoverage", () => {
  const freq = ["you", "i", "the", "zzyzx"];
  const ipa = { you: "/ju/", the: "/ðə/", zzyzx: "/z/" };

  it("is the share of the top base forms that have IPA", () => {
    expect(ipaCoverage(freq, ipa, 3)).toEqual({
      words: 3,
      withIpa: 2,
      ratio: 2 / 3,
    });
  });
  it("uses the whole list when it is shorter than the top", () => {
    expect(ipaCoverage(freq, ipa, 20000)).toEqual({
      words: 4,
      withIpa: 3,
      ratio: 3 / 4,
    });
  });
});
