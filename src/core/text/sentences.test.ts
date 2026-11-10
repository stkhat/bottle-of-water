import { describe, expect, it } from "vitest";
import { collapseSpaces, splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits English text into sentences with whitespace collapsed", () => {
    expect(
      splitSentences(
        "Most home bakers rush the process. They knead,  \t wait an hour, and bake!  Why?",
        "en",
      ),
    ).toEqual([
      "Most home bakers rush the process.",
      "They knead, wait an hour, and bake!",
      "Why?",
    ]);
  });

  it("splits Spanish text, inverted marks included", () => {
    expect(
      splitSentences("Llegó tarde. ¿Vienes mañana? ¡Claro que sí!", "es"),
    ).toEqual(["Llegó tarde.", "¿Vienes mañana?", "¡Claro que sí!"]);
  });

  it("keeps abbreviations and numbers the segmenter does not break at", () => {
    expect(
      splitSentences(
        "The U.S. economy grew 3.5 percent, e.g. in May. It was fine.",
        "en",
      ),
    ).toEqual([
      "The U.S. economy grew 3.5 percent, e.g. in May.",
      "It was fine.",
    ]);
  });

  it("drops empty and whitespace-only pieces", () => {
    expect(splitSentences("  \n  One.   \n\n Two.  ", "en")).toEqual([
      "One.",
      "Two.",
    ]);
    expect(splitSentences("", "en")).toEqual([]);
    expect(splitSentences(" \n\t ", "es")).toEqual([]);
  });
});

describe("collapseSpaces", () => {
  it("turns runs of whitespace into single spaces and trims", () => {
    expect(collapseSpaces("  It can \n feel\t tedious.  ")).toBe(
      "It can feel tedious.",
    );
  });
});
