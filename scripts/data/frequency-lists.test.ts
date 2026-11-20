import { describe, expect, it } from "vitest";
import { betterRank, learningForms } from "./frequency-lists.ts";

describe("betterRank", () => {
  it("ranks each form by the better of its ranks", () => {
    // década: written 1, spoken 4; hola: spoken 1, written 5.
    const spoken = ["hola", "que", "oye", "década"];
    const written = ["década", "que", "producir", "año", "hola"];
    expect(betterRank([spoken, written])).toEqual([
      "década",
      "hola",
      "que",
      "oye",
      "producir",
      "año",
    ]);
  });
  it("puts a form both lists rank before one with the same best rank in one list only", () => {
    expect(
      betterRank([
        ["a", "b"],
        ["c", "a"],
      ]),
    ).toEqual(["a", "c", "b"]);
  });
  it("orders forms equal in every rank by the list that gives the best one, the earlier first", () => {
    expect(
      betterRank([
        ["x", "y"],
        ["y", "x"],
      ]),
    ).toEqual(["x", "y"]);
    expect(betterRank([["x"], ["y"]])).toEqual(["x", "y"]);
    expect(betterRank([["y"], ["x"]])).toEqual(["y", "x"]);
  });
  it("gives every form one place, a form repeated in a list at its first rank", () => {
    const merged = betterRank([
      ["de", "la", "de", "el"],
      ["el", "de"],
    ]);
    expect(merged).toEqual(["de", "el", "la"]);
    expect(new Set(merged).size).toBe(merged.length);
  });
  it("keeps one list as it is", () => {
    expect(betterRank([["b", "a", "c"]])).toEqual(["b", "a", "c"]);
  });
});

describe("learningForms", () => {
  it("is the spoken list when the language names no written-text list", () => {
    expect(learningForms({ spoken: ["oui", "non"] })).toEqual(["oui", "non"]);
  });
  it("merges a written-text list by the better rank", () => {
    expect(
      learningForms({ spoken: ["hola", "oye"], text: ["década", "hola"] }),
    ).toEqual(["hola", "década", "oye"]);
  });
});
