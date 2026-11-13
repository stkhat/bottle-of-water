import { describe, expect, it } from "vitest";
import {
  alwaysCapitalised,
  blockCasing,
  capitalHere,
  casingChanges,
  documentCasing,
  readCasing,
  wordCases,
  type DocumentCasing,
} from "./casing";
import { tokenize } from "./tokenize";

const casingOf = (...blocks: string[]) =>
  documentCasing(blocks.map((text) => blockCasing(tokenize(text, "en"), "en")));

/** Each word of a block with its verdicts: "^" at a start, "[]" inside a label. */
const cases = (text: string) =>
  wordCases(tokenize(text, "en"), "en").map(
    (w) => `${w.atStart ? "^" : ""}${w.label ? "[]" : ""}${w.key}`,
  );

describe("wordCases", () => {
  it("marks sentence starts, possessives and labels", () => {
    expect(cases("Then Mark's dog ran. It stopped [barks] Near home.")).toEqual(
      [
        "^then",
        "mark",
        "dog",
        "ran",
        "^it",
        "stopped",
        "[]barks",
        "^near",
        "home",
      ],
    );
  });
  it("takes a word after a dialogue dash, a colon or a quote as a start", () => {
    expect(cases("- Aww. -Yes. Well - Oh no: Fine")).toEqual([
      "^aww",
      "^yes",
      "^well",
      "^oh",
      "no",
      "^fine",
    ]);
    expect(cases('He said "Great" then')).toEqual([
      "^he",
      "said",
      "^great",
      "then",
    ]);
    // A hyphen inside a word is no dash.
    expect(cases("the Coca-Cola bottle.")).toEqual([
      "^the",
      "coca",
      "cola",
      "bottle",
    ]);
  });
  it("takes every word of a block in Title Case as a start", () => {
    expect(cases("Japan Unveils New Plan For Trains")).toEqual([
      "^japan",
      "^unveils",
      "^new",
      "^plan",
      "^for",
      "^trains",
    ]);
  });
  it("marks ALL-CAPS words next to other ALL-CAPS words as a run", () => {
    const runs = wordCases(tokenize("NICE JOB, MAN. The US team", "en"), "en")
      .filter((w) => w.written === "upper")
      .map((w) => [w.key, w.capsRun]);
    expect(runs).toEqual([
      ["nice", true],
      ["job", true],
      ["man", true],
      ["us", false],
    ]);
  });
});

describe("documentCasing", () => {
  it("is mixed for ordinary writing, with the words capitalised inside sentences", () => {
    expect(
      casingOf("Yesterday Mark met Helen.", "Mark waved. The mark stayed."),
    ).toEqual({ mode: "mixed", words: { mark: [1, 1], helen: [1, 0] } });
  });
  it("is upper when most words are in capitals, with no words", () => {
    expect(casingOf("MARK MET HELEN.", "THEN Mark LEFT.")).toEqual({
      mode: "upper",
      words: {},
    });
  });
  it("is lower when almost no word inside a sentence is capitalised", () => {
    expect(
      casingOf("so mark met helen at the station and they talked for hours"),
    ).toEqual({ mode: "lower", words: {} });
  });
  it("takes no evidence from labels, ALL-CAPS words, plural acronyms or starts", () => {
    expect(
      casingOf("Then we saw [Mark] and the NASA AEDs near Helen."),
    ).toEqual({ mode: "mixed", words: { helen: [1, 0] } });
  });
});

describe("the verdicts", () => {
  const casing = casingOf(
    "Yesterday Mark met Helen in Japan.",
    "Japan is big. Helen saw a mark.",
  );
  const word = (text: string, key: string) =>
    wordCases(tokenize(text, "en"), "en").find((w) => w.key === key)!;

  it("tell a word always capitalised from one also written in lower case", () => {
    expect(alwaysCapitalised(casing, "helen")).toBe(true);
    expect(alwaysCapitalised(casing, "japan")).toBe(true);
    expect(alwaysCapitalised(casing, "mark")).toBe(false);
    expect(alwaysCapitalised(casingOf("MARK MET HELEN."), "helen")).toBe(false);
  });
  it("count a capital inside a sentence, an acronym, and a start the document writes that way", () => {
    expect(capitalHere(casing, word("He met Mark.", "mark"))).toBe(true);
    expect(capitalHere(casing, word("Japan is big.", "japan"))).toBe(true);
    expect(capitalHere(casing, word("Mark left.", "mark"))).toBe(false);
    expect(capitalHere(casing, word("the US team", "us"))).toBe(true);
    expect(capitalHere(casing, word("GIVE US MORE", "us"))).toBe(false);
    expect(capitalHere(casing, word("we [Mark] left", "mark"))).toBe(false);
  });
  it("say nothing in a caseless document", () => {
    const upper: DocumentCasing = { mode: "upper", words: {} };
    expect(capitalHere(upper, word("He met Mark.", "mark"))).toBe(false);
  });
});

describe("casingChanges", () => {
  it("names the words whose verdicts changed, or all when the mode changed", () => {
    const before = casingOf("Yesterday Mark met Helen.");
    const after = casingOf("Yesterday Mark met Helen.", "A mark stayed.");
    expect(casingChanges(before, after)).toEqual(new Set(["mark"]));
    expect(casingChanges(before, before)).toEqual(new Set());
    expect(casingChanges(before, casingOf("MARK MET HELEN."))).toBe("all");
  });
});

describe("readCasing", () => {
  it("reads a casing a message carries, and nothing else", () => {
    const casing = casingOf("Yesterday Mark met Helen.");
    expect(readCasing(JSON.parse(JSON.stringify(casing)))).toEqual(casing);
    expect(readCasing({ mode: "loud", words: {} })).toBeUndefined();
    expect(readCasing({ mode: "mixed", words: { a: [1] } })).toBeUndefined();
    expect(readCasing(undefined)).toBeUndefined();
    expect(
      readCasing({ mode: "lower", words: {}, unpunctuated: true }),
    ).toEqual({ mode: "lower", words: {}, unpunctuated: true });
    expect(
      readCasing({ mode: "lower", words: {}, unpunctuated: 1 }),
    ).toBeUndefined();
  });
});

describe("documentCasing: punctuation", () => {
  const words = (n: number) => Array.from({ length: n }, () => "so").join(" ");
  it("finds a document of 50 words or more with fewer than one comma per 50 unpunctuated", () => {
    expect(casingOf(words(60), words(60)).unpunctuated).toBe(true);
    expect(
      casingOf(`${words(30)}, ${words(30)},`, words(40)).unpunctuated,
    ).toBeUndefined();
  });
  it("takes a shorter document for punctuated", () => {
    expect(casingOf(words(49)).unpunctuated).toBeUndefined();
  });
});
