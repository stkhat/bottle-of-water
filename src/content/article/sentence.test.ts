import { describe, expect, it } from "vitest";
import { sentenceAt } from "./sentence";

const TEXT =
  "Most home bakers rush the process. They knead, wait an hour, and bake.  But the bakers who get the most flavor out of their loaves tend to do the opposite.";

const at = (word: string) => {
  const start = TEXT.indexOf(word);
  return sentenceAt(TEXT, start, start + word.length, "en");
};

describe("sentenceAt", () => {
  it("returns the sentence around a span, trimmed", () => {
    expect(at("knead")).toBe("They knead, wait an hour, and bake.");
    expect(at("Most")).toBe("Most home bakers rush the process.");
    expect(at("loaves")).toBe(
      "But the bakers who get the most flavor out of their loaves tend to do the opposite.",
    );
  });

  it("joins the sentences a span crosses", () => {
    expect(at("process. They")).toBe(
      "Most home bakers rush the process. They knead, wait an hour, and bake.",
    );
  });

  it("collapses runs of whitespace", () => {
    expect(sentenceAt("It can  feel   tedious at first.", 15, 22, "en")).toBe(
      "It can feel tedious at first.",
    );
  });
});
