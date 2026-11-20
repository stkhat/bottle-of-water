import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  frequencyForms,
  frequencyPageTitles,
  parseEsFrequencyWikitext,
} from "./es-frequency.ts";
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

// The written-text list, Wiktionary's "Mixed 730K": one `[[target|label]]` per line.
const fixture = readFileSync(
  join(import.meta.dirname, "fixtures", "es-frequency.wikitext"),
  "utf8",
);

describe("parseEsFrequencyWikitext", () => {
  const entries = parseEsFrequencyWikitext(fixture);

  it("reads one entry per link line, in rank order, as written", () => {
    expect(entries.slice(0, 4)).toEqual(["de", "la", "El", "el"]);
  });
  it("keeps entries with spaces and other characters", () => {
    expect(entries).toContain("El lugar");
    expect(entries).toContain("EE.UU.");
  });
  it("reads links without a label", () => {
    expect(entries).toContain("año");
  });
  it("skips the header's subpage list and the section headings", () => {
    expect(entries).toHaveLength(13);
    expect(entries.at(-1)).toBe("pequeños");
  });
  it("gives the forms the subtitle list's are read as", () => {
    expect(frequencyForms(entries)).toEqual([
      "de",
      "la",
      "el",
      "comiendo",
      "casas",
      "brasil",
      "hablo",
      "año",
      "pequeños",
    ]);
  });
});

describe("frequencyPageTitles", () => {
  const main = "Wiktionary:Frequency_lists/Spanish/Mixed_730K";

  it("needs only the main page for the first 10,000 ranks", () => {
    expect(frequencyPageTitles(10000)).toEqual([main]);
  });
  it("adds a subpage per further 10,000 ranks", () => {
    expect(frequencyPageTitles(10001)).toEqual([main, `${main}/10001-20000`]);
    expect(frequencyPageTitles(150000)).toHaveLength(15);
    expect(frequencyPageTitles(150000).at(-1)).toBe(`${main}/140001-150000`);
  });
});
