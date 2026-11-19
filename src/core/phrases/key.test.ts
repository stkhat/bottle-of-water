import { describe, expect, it } from "vitest";
import { kindOfKey } from "../term-id";
import { separatorKey, spacedKey, splitKey, wordsOfKey } from "./key";

describe("separatorKey", () => {
  it("writes whitespace as one space and curly quotes straight", () => {
    expect(separatorKey(" \n ")).toBe(" ");
    expect(separatorKey(",  ")).toBe(", ");
    expect(separatorKey("-")).toBe("-");
    expect(separatorKey(" “")).toBe(' "');
    expect(separatorKey("’ ")).toBe("' ");
  });

  it("takes words written without a space between as separated by one", () => {
    expect(separatorKey("")).toBe(" ");
  });
});

describe("splitKey", () => {
  it("splits a key into its words and what separates them", () => {
    expect(splitKey("figure out", "en")).toEqual({
      words: ["figure", "out"],
      between: [" "],
    });
    expect(splitKey("wh-what", "en")).toEqual({
      words: ["wh", "what"],
      between: ["-"],
    });
    expect(splitKey('well, i think "so', "en")).toEqual({
      words: ["well", "i", "think", "so"],
      between: [", ", " ", ' "'],
    });
  });

  it("keeps a word's apostrophe and inner period", () => {
    expect(splitKey("she-she's", "en").words).toEqual(["she", "she's"]);
    expect(splitKey("u.s", "en").words).toEqual(["u.s"]);
    expect(splitKey("make up one’s mind", "en").words).toEqual([
      "make",
      "up",
      "one's",
      "mind",
    ]);
  });
});

describe("wordsOfKey", () => {
  it("finds a key's words as the segmenter does", () => {
    expect(wordsOfKey("she-she's")).toEqual(["she", "she's"]);
    expect(wordsOfKey("u.s army")).toEqual(["u.s", "army"]);
    expect(wordsOfKey("1,000 people")).toEqual(["1,000", "people"]);
  });
});

describe("spacedKey", () => {
  it("tells keys joined by spaces from keys with other separators", () => {
    expect(spacedKey("figure out")).toBe(true);
    expect(spacedKey("run")).toBe(true);
    expect(spacedKey("wh-what")).toBe(false);
    expect(spacedKey("well, i think")).toBe(false);
  });
});

describe("kindOfKey", () => {
  it("takes a key of several words for a phrase, whatever separates them", () => {
    expect(kindOfKey("run")).toBe("word");
    expect(kindOfKey("u.s")).toBe("word");
    expect(kindOfKey("figure out")).toBe("phrase");
    expect(kindOfKey("wh-what")).toBe("phrase");
    expect(kindOfKey("well, i think")).toBe("phrase");
  });
});
