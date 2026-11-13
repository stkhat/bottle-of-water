// Smoke test of the classifier over the generated pack files (public/packs/, data/packs/).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packSourcePath } from "../../scripts/data/formats.ts";
import { createClassifier, unsavedKeys, type TermIndex } from "./classify";
import { createEnJaDictionary } from "./lexicon/dictionary";
import { createLanguagePack } from "./lexicon/language-pack";
import { createPackLoader } from "./packs/load";
import { blockCasing, documentCasing } from "./text/casing";

const loadPack = createPackLoader(async (path) =>
  JSON.parse(readFileSync(packSourcePath(path), "utf8")),
);

const en = await loadPack("en");
const pack = createLanguagePack("en", {
  lemmas: en.lemmas,
  freq: en.freq,
  ipa: en.ipa,
  vocab: new Set(en.vocab),
  patterns: en.phrases,
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

  it("does not detect pairs of common words that are meant literally", () => {
    const text =
      "I came to Tokyo. I'm going to live in Paris. Very well, let's find out.";
    const spans = classifier.classify(pack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
    });
    const phrases = spans.filter((s) => s.kind === "phrase");
    expect(phrases.map((s) => s.key)).toEqual(["find out"]);
  });

  it("still matches such a pair once it is saved", () => {
    const text = "He came to an hour later.";
    const spans = classifier.classify(pack.tokenize(text), {
      terms: new Map([["come to", "learning"]]),
      knownLevel: 3000,
    });
    const phrases = spans.filter((s) => s.kind === "phrase");
    expect(phrases.map((s) => s.key)).toEqual(["come to"]);
  });
});

describe("phrase patterns over the generated packs", () => {
  const phrases = (text: string, terms: TermIndex = new Map()) =>
    classifier
      .classify(pack.tokenize(text), { terms, knownLevel: 3000 })
      .filter((s) => s.kind === "phrase")
      .map((s) => [text.slice(s.start, s.end), s.key, s.part?.index]);

  it("detects a phrase with a word as written", () => {
    expect(phrases("He spilled the beans.")).toEqual([
      ["spilled the beans", "spill the beans", undefined],
    ]);
  });

  it("gives phrases with an -s form or a possessive their IPA", () => {
    expect(pack.ipa("spill the beans")).toBe("/spɪl ðə ˈbi(ː)nz/");
    expect(pack.ipa("make up one's mind")).toBe("/meɪk ʌp wʌnz maɪnd/");
  });

  it("matches saved phrases with slots and gaps", () => {
    const terms: TermIndex = new Map([
      ["make up one's mind", "learning"],
      ["figure out", "known"],
    ]);
    expect(phrases("She made up her mind and figured it out.", terms)).toEqual([
      ["made up her mind", "make up one's mind", undefined],
      ["figured", "figure out", 0],
      ["out", "figure out", 1],
    ]);
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

const ja = await loadPack("en-ja");
const defs = await loadPack("en-defs");

describe("names over the generated packs (rule D)", () => {
  const withNames = createLanguagePack("en", {
    lemmas: en.lemmas,
    freq: en.freq,
    ipa: en.ipa,
    vocab: new Set(en.vocab),
    patterns: en.phrases,
    pos: en.pos,
    names: en.names,
  });
  const names = createClassifier(withNames);
  const dictionary = createEnJaDictionary({
    ...ja,
    defs: defs.defs,
    pos: en.pos,
    ipa: en.ipa,
  });
  const TEXT = [
    "Yesterday Mark flew to Japan with Frank.",
    "In June, Mark wrote about the Enlightenment. Yes, Frank said, the trip was long.",
    "They saw a mark on the wall in France.",
  ];
  const casing = documentCasing(
    TEXT.map((text) => blockCasing(withNames.tokenize(text), "en")),
  );
  const spans = TEXT.flatMap((text) =>
    names
      .classify(withNames.tokenize(text), {
        terms: new Map(),
        knownLevel: 3000,
        casing,
        capitalMeaning: (key) => dictionary.capitalMeaning(key),
      })
      .map((s) => ({ ...s, text: text.slice(s.start, s.end) })),
  );
  const of = (text: string) => spans.filter((s) => s.text === text);

  it("ignores a name the document always capitalises", () => {
    expect(of("Frank").map((s) => [s.category, s.name])).toEqual([
      ["ignored", true],
      ["ignored", true],
    ]);
  });
  it("keeps a name whose capitalised headword has a meaning, capitalised", () => {
    for (const word of ["Japan", "June", "France"])
      expect(of(word)[0], word).toMatchObject({ capital: true });
    expect(of("Japan")[0]?.category).not.toBe("ignored");
  });
  it("never takes an interjection, a word after a determiner or one written in lower case for a name", () => {
    expect(of("Yes")[0]?.name).toBeUndefined();
    expect(of("Enlightenment")[0]?.name).toBeUndefined();
    // "mark" is in lower case in the document: "Mark" is no name there.
    expect(of("Mark").every((s) => s.name === undefined)).toBe(true);
  });
});

const es = await loadPack("es");

describe("classifier over the generated Spanish pack", () => {
  const esPack = createLanguagePack("es", {
    lemmas: es.lemmas,
    freq: es.freq,
    ipa: es.ipa,
    vocab: new Set(es.vocab),
    patterns: es.phrases,
  });
  const esClassifier = createClassifier(esPack);
  const classify = (text: string) =>
    esClassifier
      .classify(esPack.tokenize(text), { terms: new Map(), knownLevel: 3000 })
      .map((s) => ({ text: text.slice(s.start, s.end), ...s }));

  it("reads an inflected verb as its base", () => {
    expect(classify("Estoy comiendo una manzana")).toContainEqual(
      expect.objectContaining({ text: "comiendo", key: "comer", kind: "word" }),
    );
  });

  it("detects a dictionary phrase in text", () => {
    expect(es.phrases.detect).toContain("a escondidas");
    expect(classify("Se vieron a escondidas en el parque.")).toContainEqual(
      expect.objectContaining({
        text: "a escondidas",
        key: "a escondidas",
        kind: "phrase",
      }),
    );
  });

  it("has no tagger: words keep their keys and get no part of speech", () => {
    expect(esPack.tagger).toBeUndefined();
    const text = "Estoy comiendo una manzana.";
    const withOutlines = esClassifier.classify(esPack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
      outline: () => ({ firstMeaning: true, meaning: true, pos: ["verb"] }),
    });
    expect(withOutlines.some((s) => "pos" in s)).toBe(false);
    expect(withOutlines.map((s) => s.key)).toEqual(
      classify(text).map((s) => s.key),
    );
  });
});

describe("tags over the generated packs (rules A1 and A2)", () => {
  const tagged = createLanguagePack("en", {
    lemmas: en.lemmas,
    freq: en.freq,
    ipa: en.ipa,
    vocab: new Set(en.vocab),
    patterns: en.phrases,
    pos: en.pos,
    names: en.names,
    tagger: en.tagger,
  });
  const classifier = createClassifier(tagged);
  const dictionary = createEnJaDictionary({
    ...ja,
    defs: defs.defs,
    pos: en.pos,
    ipa: en.ipa,
  });
  /** The word's span in `text` with its hover lines. */
  const hover = (text: string, word: string) => {
    const span = classifier
      .classify(tagged.tokenize(text), {
        terms: new Map(),
        knownLevel: 3000,
        outline: (key) => dictionary.outline(key),
      })
      .find((s) => text.slice(s.start, s.end) === word)!;
    return {
      key: span.key,
      pos: span.pos,
      lines: dictionary.entry(span.key, undefined, span.pos)?.lines ?? [],
    };
  };

  it("looks an inflected verb up by its base", () => {
    expect(hover("She decided to stay.", "decided")).toMatchObject({
      key: "decide",
      pos: "verb",
    });
    expect(hover("He was wearing a hat.", "wearing")).toMatchObject({
      key: "wear",
      pos: "verb",
    });
    expect(hover("I saw him yesterday.", "saw").key).toBe("see");
  });
  it("keeps an auxiliary's grammar pointer, and its verb's base", () => {
    const has = hover("She has spent all her money.", "has");
    expect(has.key).toBe("has");
    expect(has.pos).toBeUndefined();
    expect(has.lines[0]).toMatch(/^haveの/);
    expect(hover("She has spent all her money.", "spent").key).toBe("spend");
    expect(hover("The house is being built.", "being").key).toBe("be");
  });
  it("keeps a participle used otherwise than as a verb", () => {
    const established = hover(
      "The company was established in 1990.",
      "established",
    );
    expect(established).toEqual({
      key: "established",
      pos: undefined,
      lines: [expect.stringMatching(/^確立した/)],
    });
    expect(
      hover("Including taxes, it costs ten dollars.", "Including"),
    ).toEqual({
      key: "including",
      pos: undefined,
      lines: ["…を含んで,入れて"],
    });
    expect(hover("It is a demanding job.", "demanding").key).toBe("demanding");
  });
  it("shows the senses of the tagged part of speech first", () => {
    expect(hover("That's fine.", "fine")).toMatchObject({
      pos: "adjective",
      lines: [
        expect.stringContaining("りっぱな"),
        expect.anything(),
        expect.anything(),
      ],
    });
    expect(hover("It was just a joke.", "just").lines[0]).toMatch(/^単に/);
    expect(hover("He looked like his father.", "like").lines[0]).toMatch(
      /に似た/,
    );
    expect(hover("Their first attempt failed.", "attempt").lines[0]).toMatch(
      /^企て/,
    );
  });
});
