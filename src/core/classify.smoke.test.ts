// Smoke test of the classifier over the generated pack files in public/packs/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createClassifier, unsavedKeys, type TermIndex } from "./classify";
import { createEnglishPack } from "./language-pack";
import { createPackLoader } from "./packs/load";

const publicDir = join(import.meta.dirname, "..", "..", "public");
const loadPack = createPackLoader(async (path) =>
  JSON.parse(readFileSync(join(publicDir, path), "utf8")),
);

const en = await loadPack("en");
const pack = createEnglishPack({
  lemmas: en.lemmas,
  freq: en.freq,
  ipa: en.ipa,
  vocab: new Set(en.vocab),
  phrases: new Set(en.phrases),
});
const classifier = createClassifier(pack);

// The article in the UI mock.
const PARAGRAPH =
  "When the mixture ferments slowly in a cool place, the yeast and bacteria have more time to break down starches. The result is a loaf with a deeper, slightly tangy taste and a crust that crackles as it cools.";

function categories(terms: TermIndex = new Map()) {
  const spans = classifier.classify(pack.tokenize(PARAGRAPH), {
    terms,
    knownLevel: 3000,
  });
  const byWord = new Map(
    spans.map((s) => [PARAGRAPH.slice(s.start, s.end), s] as const),
  );
  return { spans, byWord };
}

describe("dictionary phrases over the generated packs", () => {
  it("detects a dictionary phrase in text", () => {
    const text = "We need to figure out how it works.";
    const spans = classifier.classify(pack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
    });
    expect(
      spans
        .filter((s) => s.kind === "phrase")
        .map((s) => [text.slice(s.start, s.end), s.key, s.category]),
    ).toContainEqual(["figure out", "figure out", "new"]);
    expect(spans.map((s) => text.slice(s.start, s.end))).not.toContain(
      "figure",
    );
  });

  it("detects inflected phrases", () => {
    const text = "She gave up and started from scratch.";
    const spans = classifier.classify(pack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
    });
    const phrases = spans.filter((s) => s.kind === "phrase");
    expect(phrases.map((s) => s.key)).toEqual(["give up", "from scratch"]);
  });
});

describe("classifier over the generated packs", () => {
  it("sorts the mock's paragraph into known and new words at level 3000", () => {
    const { spans, byWord } = categories();
    const brief = (word: string) => {
      const span = byWord.get(word);
      return span && `${span.key}:${span.category}`;
    };
    expect(brief("the")).toBe("the:known");
    expect(brief("ferments")).toBe("ferment:new");
    expect(brief("tangy")).toBe("tangy:new");
    expect(brief("starches")).toBe("starch:new");
    expect(brief("crackles")).toBe("crackle:new");
    expect(brief("cools")).toBe("cool:known");
    expect(brief("deeper")).toBe("deep:known");
    expect(brief("slowly")).toBe("slowly:known");
    expect(brief("a")).toBe("a:ignored");
    expect(unsavedKeys(spans)).toEqual([
      "mixture",
      "ferment",
      "yeast",
      "bacteria",
      "break down",
      "starch",
      "loaf",
      "slightly",
      "tangy",
      "crust",
      "crackle",
    ]);
  });

  it("uses saved words and phrases", () => {
    const { byWord, spans } = categories(
      new Map([
        ["ferment", "learning"],
        ["break down", "known"],
      ]),
    );
    expect(byWord.get("ferments")).toMatchObject({
      key: "ferment",
      category: "learning",
    });
    expect(byWord.get("break down")).toMatchObject({
      key: "break down",
      kind: "phrase",
      category: "known",
    });
    expect(unsavedKeys(spans)).not.toContain("ferment");
  });

  it("reads a closed-captions line in capital letters like the same line in lowercase", () => {
    // Netflix's closed captions are in capital letters.
    const terms: TermIndex = new Map([["break down", "learning"]]);
    const keys = (text: string) =>
      classifier
        .classify(pack.tokenize(text), { terms, knownLevel: 3000 })
        .map((s) => [text.slice(s.start, s.end), s.key, s.kind, s.category]);
    const upper = keys(PARAGRAPH.toUpperCase());
    expect(upper.map(([, ...rest]) => rest)).toEqual(
      keys(PARAGRAPH).map(([, ...rest]) => rest),
    );
    // The text keeps its capitals.
    expect(upper).toContainEqual(["FERMENTS", "ferment", "word", "new"]);
    expect(upper).toContainEqual([
      "BREAK DOWN",
      "break down",
      "phrase",
      "learning",
    ]);
  });
});
