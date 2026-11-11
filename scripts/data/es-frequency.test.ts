import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  frequencyForms,
  frequencyPageTitles,
  parseEsFrequencyWikitext,
} from "./es-frequency.ts";

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
});

describe("frequencyForms", () => {
  it("lowercases single words, drops the rest and keeps each form at its best rank", () => {
    expect(frequencyForms(parseEsFrequencyWikitext(fixture))).toEqual([
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
    expect(frequencyPageTitles(100000)).toHaveLength(10);
    expect(frequencyPageTitles(100000).at(-1)).toBe(`${main}/90001-100000`);
  });
});
