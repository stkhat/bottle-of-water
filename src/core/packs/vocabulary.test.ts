import { describe, expect, it } from "vitest";
import { vocabularyOf } from "./vocabulary";

describe("vocabularyOf", () => {
  it("is the dictionary's single-word headwords", () => {
    const dict = {
      dough: ["練り粉", ["練り粉"]],
      "figure of speech": ["比喩", ["比喩"]],
      figure: ["数字", ["数字"]],
    } as const;
    expect([...vocabularyOf(dict)].sort()).toEqual(["dough", "figure"]);
  });
});
