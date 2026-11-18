import { describe, expect, it } from "vitest";
import { contextOf, featuresOf } from "./perceptron";

/** The word-shape feature of the only word of a sentence. */
const shape = (word: string) =>
  featuresOf(2, word, contextOf([word]), "-START-", "-START2-").find(
    (feature) => feature.startsWith("sh "),
  );

describe("featuresOf", () => {
  it("reads the shape of letters of any script, not only ASCII", () => {
    expect(shape("Langle")).toBe("sh Xxx");
    expect(shape("Ángel")).toBe("sh Xxx");
    expect(shape("ÑU")).toBe("sh XX");
    expect(shape("año")).toBe("sh xx");
    // A combining accent belongs to its letter (decomposed "é").
    expect(shape("café")).toBe("sh xx");
    expect(shape("2026")).toBe("sh dd");
    expect(shape("COVID-19")).toBe("sh XX-dd");
  });
});
