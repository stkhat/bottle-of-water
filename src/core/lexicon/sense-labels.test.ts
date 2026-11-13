import { describe, expect, it } from "vitest";
import { decodeSenseLabels, encodeSenseLabels } from "./sense-labels";

describe("sense labels", () => {
  const labels = [
    { pos: "noun", posBy: "weak" as const },
    { pos: "verb" },
    { pos: "adjective", core: true as const },
    { pos: "adjective", posBy: "gap" as const, core: true as const },
    {},
    { core: true as const },
  ];
  it("writes one code per sense", () => {
    expect(encodeSenseLabels(labels)).toBe("n~ v a* a?* - -*");
  });
  it("reads back what it wrote", () => {
    expect(decodeSenseLabels(encodeSenseLabels(labels))).toEqual(labels);
  });
  it("writes a part of speech it has no letter for as none", () => {
    expect(encodeSenseLabels([{ pos: "phrase" }, { pos: "pronoun" }])).toBe(
      "- o",
    );
  });
});
