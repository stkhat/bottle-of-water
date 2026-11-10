import { describe, expect, it } from "vitest";
import {
  createClassifier,
  unsavedKeys,
  type Span,
  type TermIndex,
  type TermStatus,
} from "./classify";
import { createEnglishPack } from "./language-pack";

// Ranks: the 1, you 2, out 3, look 4, up 5, good 6, well 7, life 8, live 9, on 10,
// figure 11, to 12, dough 13, ferment 14, tangy 15.
const freq = [
  "the",
  "you",
  "out",
  "look",
  "up",
  "good",
  "well",
  "life",
  "live",
  "on",
  "figure",
  "to",
  "dough",
  "ferment",
  "tangy",
];
const pack = createEnglishPack({
  lemmas: {
    ferments: "ferment",
    figured: "figure",
    figures: "figure",
    looked: "look",
    better: ["good", "well"],
    lives: ["life", "live"],
    gave: "give",
  },
  freq,
  ipa: {},
  vocab: new Set([
    ...freq,
    ...["better", "yeast", "a", "i"],
    ...["give", "from", "scratch", "it", "we", "start"],
  ]),
  // Dictionary phrases, detected without being saved.
  phrases: new Set(["figure out", "from scratch", "give up"]),
});
const classifier = createClassifier(pack);

const terms = (entries: Record<string, TermStatus> = {}): TermIndex =>
  new Map(Object.entries(entries));

function classify(
  text: string,
  saved: Record<string, TermStatus> = {},
  knownLevel = 10,
): (Span & { text: string })[] {
  const spans = classifier.classify(pack.tokenize(text), {
    terms: terms(saved),
    knownLevel,
  });
  return spans.map((span) => ({
    ...span,
    text: text.slice(span.start, span.end),
  }));
}

const brief = (spans: { text: string; key: string; category: string }[]) =>
  spans.map(({ text, key, category }) => `${text}:${key}:${category}`);

describe("classify words", () => {
  it("classifies an inflected form by its saved base form", () => {
    expect(classify("It ferments.", { ferment: "learning" })).toContainEqual({
      start: 3,
      end: 11,
      key: "ferment",
      kind: "word",
      category: "learning",
      text: "ferments",
    });
    expect(brief(classify("ferments", { ferment: "known" }))).toEqual([
      "ferments:ferment:known",
    ]);
  });

  it("treats unsaved words ranked within the level as known, the rest as new", () => {
    expect(brief(classify("the dough ferments", {}, 13))).toEqual([
      "the:the:known",
      "dough:dough:known",
      "ferments:ferment:new",
    ]);
  });

  it("treats a word ranked exactly at the level as known", () => {
    expect(brief(classify("dough", {}, 13))).toEqual(["dough:dough:known"]);
    expect(brief(classify("dough", {}, 12))).toEqual(["dough:dough:new"]);
  });

  it("treats an unranked vocabulary word as new", () => {
    expect(brief(classify("yeast", {}, 20000))).toEqual(["yeast:yeast:new"]);
  });

  it("ignores words outside the vocabulary, numbers and single letters", () => {
    expect(brief(classify("Zzyzx has 3,000 loaves", {}, 20000))).toEqual([
      "Zzyzx:zzyzx:ignored",
      "has:has:ignored",
      "3,000:3,000:ignored",
      "loaves:loaves:ignored",
    ]);
    expect(brief(classify("I saw a 1st", {}, 20000))).toEqual([
      "I:i:ignored",
      "saw:saw:ignored",
      "a:a:ignored",
      "1st:1st:ignored",
    ]);
  });

  it("gives no spans for spaces and punctuation", () => {
    expect(classify("“…”, —")).toEqual([]);
  });

  it("uses a saved base of a form with several, preferring learning", () => {
    expect(brief(classify("better", { well: "known" }))).toEqual([
      "better:well:known",
    ]);
    expect(
      brief(classify("better", { good: "known", well: "learning" })),
    ).toEqual(["better:well:learning"]);
  });

  it("keys an unsaved form with several bases by the first, ranked by the most common", () => {
    // better: [better (unranked), good (6), well (7)]
    expect(brief(classify("better", {}, 6))).toEqual(["better:better:known"]);
    expect(brief(classify("better", {}, 5))).toEqual(["better:better:new"]);
  });

  it("reads curly apostrophes like straight ones", () => {
    const pack2 = createEnglishPack({
      lemmas: {},
      freq: ["don't"],
      ipa: {},
      vocab: new Set(["don't"]),
      phrases: new Set(),
    });
    const spans = createClassifier(pack2).classify(pack2.tokenize("Don’t"), {
      terms: terms(),
      knownLevel: 1,
    });
    expect(spans.map((s) => `${s.key}:${s.category}`)).toEqual(["don't:known"]);
  });
});

describe("classify phrases", () => {
  it("matches a saved phrase on the base forms of consecutive words", () => {
    expect(classify("I figured out", { "figure out": "learning" })).toEqual([
      {
        start: 0,
        end: 1,
        key: "i",
        kind: "word",
        category: "ignored",
        text: "I",
      },
      {
        start: 2,
        end: 13,
        key: "figure out",
        kind: "phrase",
        category: "learning",
        text: "figured out",
      },
    ]);
    expect(
      brief(classify("She figures  out", { "figure out": "known" })),
    ).toEqual(["She:she:ignored", "figures  out:figure out:known"]);
  });

  it("matches when any combination of base forms is saved", () => {
    expect(brief(classify("lives on", { "live on": "learning" }))).toEqual([
      "lives on:live on:learning",
    ]);
  });

  it("prefers the longest saved phrase", () => {
    const saved: Record<string, TermStatus> = {
      "look up": "known",
      "look up to": "learning",
    };
    expect(brief(classify("looked up to you", saved))).toEqual([
      "looked up to:look up to:learning",
      "you:you:known",
    ]);
    expect(brief(classify("looked up you", saved))).toEqual([
      "looked up:look up:known",
      "you:you:known",
    ]);
  });

  it("suppresses the words inside a phrase even when they are saved", () => {
    const spans = classify("figured out", {
      "figure out": "learning",
      figure: "known",
    });
    expect(brief(spans)).toEqual(["figured out:figure out:learning"]);
  });

  it("does not match across punctuation", () => {
    expect(
      brief(classify("figured, out", { "figure out": "learning" })),
    ).toEqual(["figured:figure:new", "out:out:known"]);
  });

  it("does not match a partial phrase", () => {
    expect(brief(classify("look up", { "look up to": "learning" }))).toEqual([
      "look:look:known",
      "up:up:known",
    ]);
  });
});

describe("classify dictionary phrases", () => {
  it("detects an unsaved dictionary phrase as new", () => {
    expect(classify("We start from scratch")).toContainEqual({
      start: 9,
      end: 21,
      key: "from scratch",
      kind: "phrase",
      category: "new",
      text: "from scratch",
    });
  });

  it("does not apply the known level to a detected phrase", () => {
    // give and up are both ranked within the level.
    expect(brief(classify("give up", {}, 20000))).toEqual([
      "give up:give up:new",
    ]);
  });

  it("uses the status of a saved phrase that is also a dictionary phrase", () => {
    expect(
      brief(classify("from scratch", { "from scratch": "learning" })),
    ).toEqual(["from scratch:from scratch:learning"]);
    expect(brief(classify("figured out", { "figure out": "known" }))).toEqual([
      "figured out:figure out:known",
    ]);
  });

  it("matches a dictionary phrase on its words' base forms", () => {
    expect(brief(classify("I gave up"))).toEqual([
      "I:i:ignored",
      "gave up:give up:new",
    ]);
  });

  it("gives the words inside a detected phrase no spans, even saved known ones", () => {
    expect(brief(classify("from scratch", { scratch: "known" }))).toEqual([
      "from scratch:from scratch:new",
    ]);
  });

  it("does not detect a phrase with a word saved as learning inside it", () => {
    expect(brief(classify("from scratch", { scratch: "learning" }))).toEqual([
      "from:from:new",
      "scratch:scratch:learning",
    ]);
    // Other dictionary phrases in the same run still match.
    expect(
      brief(classify("gave up from scratch", { give: "learning" })),
    ).toEqual([
      "gave:give:learning",
      "up:up:known",
      "from scratch:from scratch:new",
    ]);
  });

  it("matches a saved phrase even with a word saved as learning inside it", () => {
    expect(
      brief(classify("gave up", { give: "learning", "give up": "known" })),
    ).toEqual(["gave up:give up:known"]);
  });

  it("does not match a dictionary phrase with a word between its words", () => {
    expect(brief(classify("figure it out"))).toEqual([
      "figure:figure:new",
      "it:it:new",
      "out:out:known",
    ]);
  });

  it("prefers a longer saved phrase to a shorter dictionary phrase", () => {
    expect(
      brief(classify("gave up on you", { "give up on": "learning" })),
    ).toEqual(["gave up on:give up on:learning", "you:you:known"]);
  });
});

describe("unsavedKeys", () => {
  it("lists each new key once, leaving out known, saved and ignored words", () => {
    const spans = classifier.classify(
      pack.tokenize("Tangy dough ferments; the tangy yeast ferments zzyzx."),
      { terms: terms({ dough: "learning" }), knownLevel: 10 },
    );
    expect(unsavedKeys(spans)).toEqual(["tangy", "ferment", "yeast"]);
  });

  it("includes detected dictionary phrases", () => {
    const spans = classifier.classify(pack.tokenize("We gave up tangy yeast"), {
      terms: terms(),
      knownLevel: 10,
    });
    expect(unsavedKeys(spans)).toEqual(["we", "give up", "tangy", "yeast"]);
  });
});
