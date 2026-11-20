import { describe, expect, it } from "vitest";
import { frequencyForms } from "./es-frequency.ts";
import { frequencyWordsUrl, parseFrequencyWords } from "./frequency-words.ts";

// hermitdave's lists: one "<form> <count>" per line, in rank order, in lower case.
const list = [
  "de 14459520",
  "que 14421005",
  "qué 4029000",
  "sr. 290000",
  "hola 1010000",
  "ok 200000",
  "",
  "año 90000",
  "de 10",
].join("\n");

describe("parseFrequencyWords", () => {
  it("reads one form per line, in rank order, as written", () => {
    expect(parseFrequencyWords(list)).toEqual([
      "de",
      "que",
      "qué",
      "sr.",
      "hola",
      "ok",
      "año",
      "de",
    ]);
  });
});

describe("frequencyForms", () => {
  it("keeps single words, accents included, each at its best rank", () => {
    expect(frequencyForms(parseFrequencyWords(list))).toEqual([
      "de",
      "que",
      "qué",
      "hola",
      "ok",
      "año",
    ]);
  });
  it("lowercases", () => {
    expect(frequencyForms(["Hola", "EE.UU."])).toEqual(["hola"]);
  });
});

describe("frequencyWordsUrl", () => {
  it("names the language's full 2018 list at the pinned commit", () => {
    expect(frequencyWordsUrl("es")).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/hermitdave\/FrequencyWords\/[0-9a-f]{40}\/content\/2018\/es\/es_full\.txt$/,
    );
  });
});
