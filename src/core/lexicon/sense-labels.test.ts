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
    expect(encodeSenseLabels([{ pos: "proverb" }, { pos: "pronoun" }])).toBe(
      "- o",
    );
  });
  it("has letters for a phrase's own parts of speech", () => {
    const phrase = [
      { pos: "phrase" },
      { pos: "prepositional phrase" },
      { pos: "interjection" },
    ];
    expect(encodeSenseLabels(phrase)).toBe("h P i");
    expect(decodeSenseLabels("h P i")).toEqual(phrase);
  });
});
