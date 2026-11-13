import { describe, expect, it } from "vitest";
import {
  createClassifier,
  unsavedKeys,
  type ClassifyOptions,
  type Span,
  type TermIndex,
  type TermStatus,
} from "./classify";
import type { CapitalMeaning, EntryOutline } from "./lexicon/dictionary";
import { createLanguagePack } from "./lexicon/language-pack";
import { blockCasing, documentCasing } from "./text/casing";

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
const pack = createLanguagePack("en", {
  lemmas: {
    ferments: "ferment",
    figured: "figure",
    figures: "figure",
    looked: "look",
    better: ["good", "well"],
    lives: ["life", "live"],
    gave: "give",
    made: "make",
    spilled: "spill",
    // Only "bean" is in the vocabulary: `spill the beans` matches "beans" as written.
    beans: "bean",
  },
  freq,
  ipa: {},
  vocab: new Set([
    ...freq,
    ...["better", "yeast", "a", "i"],
    ...["give", "from", "scratch", "it", "we", "start"],
    ...["make", "mind", "spill", "bean"],
  ]),
  patterns: {
    // Dictionary phrases, detected without being saved.
    detect: [
      "figure out",
      "from scratch",
      "give up",
      "give up on",
      "spill the beans",
    ],
    // Matched only when saved.
    more: ["make up one's mind"],
    // Phrasal verbs: saved, they match with words between their parts.
    gap: ["figure out"],
  },
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
    const pack2 = createLanguagePack("en", {
      lemmas: {},
      freq: ["don't"],
      ipa: {},
      vocab: new Set(["don't"]),
      patterns: { detect: [], more: [], gap: [] },
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

describe("classify phrases with slots and gaps", () => {
  it("matches a saved phrase with a slot as one span", () => {
    expect(
      classify("She made up his mind.", { "make up one's mind": "learning" }),
    ).toContainEqual({
      start: 4,
      end: 20,
      key: "make up one's mind",
      kind: "phrase",
      category: "learning",
      text: "made up his mind",
    });
  });

  it("does not detect a pattern that is matched only when saved", () => {
    expect(brief(classify("made up his mind"))).toEqual([
      "made:make:new",
      "up:up:known",
      "his:his:ignored",
      "mind:mind:new",
    ]);
  });

  it("splits a saved phrase with a gap into parts, and the gap keeps its words", () => {
    const whole = { start: 0, end: 13 };
    expect(classify("figure it out", { "figure out": "learning" })).toEqual([
      {
        start: 0,
        end: 6,
        key: "figure out",
        kind: "phrase",
        category: "learning",
        part: { index: 0, count: 2, ...whole },
        text: "figure",
      },
      {
        start: 7,
        end: 9,
        key: "it",
        kind: "word",
        category: "new",
        text: "it",
      },
      {
        start: 10,
        end: 13,
        key: "figure out",
        kind: "phrase",
        category: "learning",
        part: { index: 1, count: 2, ...whole },
        text: "out",
      },
    ]);
  });

  it("classifies the words in a gap as words, saved ones included", () => {
    expect(
      brief(
        classify("We figured the dough out, then gave up", {
          "figure out": "known",
          dough: "learning",
        }),
      ),
    ).toEqual([
      "We:we:new",
      "figured:figure out:known",
      "the:the:known",
      "dough:dough:learning",
      "out:figure out:known",
      "then:then:ignored",
      "gave up:give up:new",
    ]);
  });

  it("gives a saved phrase with a gap of no words one span", () => {
    expect(classify("figured out", { "figure out": "learning" })).toEqual([
      {
        start: 0,
        end: 11,
        key: "figure out",
        kind: "phrase",
        category: "learning",
        text: "figured out",
      },
    ]);
  });

  it("matches a saved phrase with a gap only when the pack flags it as one", () => {
    expect(brief(classify("gave it up", { "give up": "learning" }))).toEqual([
      "gave:give:new",
      "it:it:new",
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

  it("matches a dictionary phrase's words as written or as base forms", () => {
    expect(brief(classify("He spilled the beans"))).toEqual([
      "He:he:ignored",
      "spilled the beans:spill the beans:new",
    ]);
    expect(brief(classify("spill the bean"))).toEqual([
      "spill:spill:new",
      "the:the:known",
      "bean:bean:new",
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

  it("does not match a dictionary phrase with a word between its words, even a phrasal verb", () => {
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

  it("prefers a saved phrase to a longer dictionary phrase", () => {
    expect(brief(classify("gave up on it", { "give up": "learning" }))).toEqual(
      ["gave up:give up:learning", "on:on:known", "it:it:new"],
    );
  });

  it("detects the longest dictionary phrase when no saved phrase matches", () => {
    expect(brief(classify("gave up on it"))).toEqual([
      "gave up on:give up on:new",
      "it:it:new",
    ]);
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

describe("names by document casing (rule D)", () => {
  // Ranks: park 1, the 2; every other word is rare.
  const vocab = [
    ...["park", "the", "mark", "badger", "world", "english", "hey", "a"],
    ...["japan", "germany", "helen", "met", "saw", "we", "in", "and", "it"],
    ...["enlightenment", "on", "rained", "then", "um"],
  ];
  const names = createLanguagePack("en", {
    lemmas: {},
    freq: ["park", "the"],
    ipa: {},
    vocab: new Set(vocab),
    patterns: { detect: [], more: [], gap: [] },
    pos: {
      the: ["article"],
      a: ["article"],
      hey: ["interjection", "verb"],
      um: ["interjection", "verb", "noun"],
      we: ["pronoun"],
      mark: ["noun", "verb"],
    },
    names: {
      mark: "gs",
      badger: "sp",
      park: "sp",
      world: "x",
      english: "gs!",
      hey: "s",
      um: "s",
      japan: "p",
      germany: "pg",
      helen: "xg",
      enlightenment: "g",
    },
  });
  const meanings: Record<string, CapitalMeaning> = {
    japan: "word",
    germany: "name",
    helen: "name",
  };
  const run = (blocks: string[], mode?: "upper") => {
    const casing =
      mode === "upper"
        ? { mode, words: {} }
        : documentCasing(
            blocks.map((b) => blockCasing(names.tokenize(b), "en")),
          );
    const classifyNames = createClassifier(names);
    return blocks.flatMap((block) =>
      classifyNames
        .classify(names.tokenize(block), {
          terms: terms(),
          knownLevel: 1,
          casing,
          capitalMeaning: (key) => meanings[key],
        })
        .map((s) => ({ ...s, text: block.slice(s.start, s.end) })),
    );
  };
  const verdicts = (spans: ReturnType<typeof run>) =>
    spans
      .filter((s) => /^\p{Lu}/u.test(s.text))
      .map(
        (s) =>
          `${s.text}:${s.name ? "name" : s.capital ? "capital" : s.category}`,
      );

  it("ignores a name the document always capitalises inside sentences", () => {
    expect(
      verdicts(
        run(["We met Mark and Badger in Japan.", "Then Mark saw Helen."]),
      ),
    ).toEqual([
      "We:new",
      "Mark:name",
      "Badger:name",
      "Japan:capital",
      "Then:new",
      "Mark:name",
      "Helen:name",
    ]);
    const mark = run(["We met Mark."]).find((s) => s.text === "Mark");
    expect(mark).toMatchObject({ category: "ignored", name: true });
  });

  it("keeps a name whose capitalised meaning says what it is, or that is a place first", () => {
    const spans = run(["We saw Japan and Germany."]);
    expect(verdicts(spans)).toEqual([
      "We:new",
      "Japan:capital",
      "Germany:capital",
    ]);
    expect(spans.find((s) => s.text === "Japan")?.category).toBe("new");
  });

  it("never takes a word written in lower case there, a capitalised common word, an interjection, a titled common noun or a word after a determiner for a name", () => {
    expect(
      verdicts(
        run([
          "We met Mark and a mark.",
          "We saw English and Hey and World and Park.",
          "We saw the Enlightenment.",
        ]),
      ),
    ).toEqual([
      "We:new",
      "Mark:capital",
      "We:new",
      "English:capital",
      "Hey:capital",
      "World:capital",
      "Park:capital",
      "We:new",
      "Enlightenment:capital",
    ]);
  });

  it("takes an interjection the lexicon also has as a surname for a word, and a word outside the vocabulary for no word at all", () => {
    // um, from Wiktionary's vocabulary (rule E): an interjection, and a Korean surname.
    const spans = run(["Um, we met Mark and Um and Zork.", "Um, then Zork."]);
    expect(verdicts(spans)).toEqual([
      "Um:capital",
      "Mark:name",
      "Um:capital",
      "Zork:ignored",
      "Um:capital",
      "Zork:ignored",
    ]);
    expect(spans.filter((s) => s.text === "Zork" && s.name)).toEqual([]);
  });

  it("finds no names in a caseless document", () => {
    expect(
      run(["WE MET MARK IN JAPAN."], "upper").some((s) => s.name || s.capital),
    ).toBe(false);
    expect(
      run(["we met mark in japan. it rained."]).some(
        (s) => s.name || s.capital,
      ),
    ).toBe(false);
  });

  it("does nothing without the document's casing", () => {
    const spans = createClassifier(names).classify(
      names.tokenize("We met Mark."),
      { terms: terms(), knownLevel: 1 },
    );
    expect(spans.some((s) => s.name || s.capital)).toBe(false);
  });
});

describe("names in runs of capitalised words (rule D, whole names)", () => {
  // Ranks: center 1, president 2; every other word is rare.
  const pack = createLanguagePack("en", {
    lemmas: {},
    freq: ["center", "president"],
    ipa: {},
    vocab: new Set([
      ...["we", "met", "at", "and", "the", "come", "here", "sailed", "saw"],
      ...["harvey", "specter", "pearson", "center", "president", "trump"],
      ...["persian", "gulf", "recording", "academy", "jupiter", "monday"],
    ]),
    patterns: { detect: [], more: [], gap: [] },
    pos: { the: ["article"], we: ["pronoun"] },
    names: {
      harvey: "g",
      pearson: "s",
      trump: "s",
      gulf: "p",
      academy: "o",
      monday: "x!",
    },
  });
  const meanings: Record<string, CapitalMeaning> = {
    persian: "word",
    jupiter: "word",
  };
  const verdicts = (...blocks: string[]) => {
    const casing = documentCasing(
      blocks.map((b) => blockCasing(pack.tokenize(b), "en")),
    );
    return blocks.flatMap((block) =>
      createClassifier(pack)
        .classify(pack.tokenize(block), {
          terms: terms(),
          knownLevel: 0,
          casing,
          capitalMeaning: (key) => meanings[key],
        })
        .map((s) => ({ ...s, text: block.slice(s.start, s.end) }))
        .filter((s) => /^\p{Lu}/u.test(s.text) && s.text !== "We")
        .map(
          (s) =>
            `${s.text}:${s.name ? "name" : s.capital ? "capital" : s.category}`,
        ),
    );
  };

  it("takes a word after a person's name for part of the name, down the run and in the whole document", () => {
    expect(
      verdicts(
        "We met Harvey Specter at Pearson Specter.",
        "Specter, come here.",
      ),
    ).toEqual([
      "Harvey:name",
      "Specter:name",
      "Pearson:name",
      "Specter:name",
      "Specter:name",
    ]);
  });
  it("keeps a common word, a title before a name, a capitalised common word and a capitalised meaning", () => {
    expect(
      verdicts(
        "We met Harvey Center and President Trump at Harvey Monday.",
        "We saw Harvey Jupiter.",
      ),
    ).toEqual([
      "Harvey:name",
      "Center:capital",
      "President:capital",
      "Trump:name",
      "Harvey:name",
      "Monday:capital",
      "Harvey:name",
      "Jupiter:capital",
    ]);
  });
  it("keeps a place or an organisation written after a word that is no name: the head of a title", () => {
    expect(
      verdicts("We sailed the Persian Gulf.", "We met the Recording Academy."),
    ).toEqual([
      "Persian:capital",
      "Gulf:capital",
      "Recording:capital",
      "Academy:capital",
    ]);
    expect(verdicts("We sailed at Gulf and met Academy.")).toEqual([
      "Gulf:name",
      "Academy:name",
    ]);
  });
});

describe("keys and parts of speech by tags (rules A1 and A2)", () => {
  // The tagger is sure of these words only: "decided" a past tense, "fine" an
  // adjective, "the" a determiner; "Mark" a proper noun.
  const tagged = createLanguagePack("en", {
    lemmas: { decided: "decide" },
    freq: ["the"],
    ipa: {},
    vocab: new Set(["the", "decided", "decide", "fine", "we", "mark"]),
    patterns: { detect: [], more: [], gap: [] },
    pos: { decide: ["verb"], fine: ["adjective", "noun"] },
    names: { mark: "gs" },
    tagger: {
      tags: ["NN", "VBD"],
      words: { decided: "VBD", fine: "JJ", the: "DT", mark: "NNP" },
      weights: {},
      scale: 10,
    },
  });
  const outlines: Record<string, EntryOutline> = {
    decided: { firstMeaning: true, meaning: true, pos: ["adjective"] },
    decide: { firstMeaning: true, meaning: true, pos: ["verb"] },
  };
  const run = (text: string, options: Partial<ClassifyOptions> = {}) =>
    createClassifier(tagged)
      .classify(tagged.tokenize(text), {
        terms: terms(),
        knownLevel: 1,
        outline: (key) => outlines[key],
        ...options,
      })
      .map((s) => ({ ...s, text: text.slice(s.start, s.end) }));

  it("gives an unsaved word its key and part of speech by its tag", () => {
    expect(run("We decided fine.")).toEqual([
      expect.objectContaining({ text: "We", key: "we" }),
      expect.objectContaining({ text: "decided", key: "decide", pos: "verb" }),
      expect.objectContaining({ text: "fine", key: "fine", pos: "adjective" }),
    ]);
    expect(run("We decided fine.")[0]).not.toHaveProperty("pos");
  });
  it("keeps a saved word's key", () => {
    expect(
      run("We decided.", { terms: terms({ decided: "learning" }) })[1],
    ).toMatchObject({ key: "decided", category: "learning", pos: "verb" });
  });
  it("leaves a capitalised word and a name alone", () => {
    const blocks = ["We met Mark. Then Mark left.", "We saw the Fine Arts."];
    const casing = documentCasing(
      blocks.map((b) => blockCasing(tagged.tokenize(b), "en")),
    );
    const fine = run(blocks[1]!, { casing }).find((s) => s.text === "Fine");
    expect(fine).toMatchObject({ key: "fine", capital: true });
    expect(fine).not.toHaveProperty("pos");
  });
  it("does nothing without the dictionary's outlines", () => {
    const spans = run("We decided fine.", { outline: undefined });
    expect(spans.map((s) => s.key)).toEqual(["we", "decided", "fine"]);
    expect(spans.some((s) => "pos" in s)).toBe(false);
  });
});
