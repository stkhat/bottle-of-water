import { describe, expect, it } from "vitest";
import {
  createClassifier,
  sameSpans,
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

  it("classifies a single letter that is a frequent verb or conjunction", () => {
    // Spanish y, o and a rank 6, 29 and 7 in the subtitle list; a letter that is no
    // word ranks far lower (m 739), and a one-letter preposition (a) stays a letter.
    const filler = Array.from({ length: 200 }, (_, i) => `w${i}`);
    const letters = createLanguagePack("es", {
      lemmas: {},
      freq: ["y", "a", "o", "voy", ...filler, "m"],
      ipa: {},
      vocab: new Set(["y", "a", "o", "voy", "ver", "m", "b"]),
      patterns: { detect: [], more: [], gap: [] },
      tagger: {
        tags: ["NOUN", "VERB.Fin"],
        words: {
          y: "CCONJ",
          o: "CCONJ",
          a: "ADP",
          m: "CCONJ",
          voy: "VERB.Fin",
        },
        weights: {},
        scale: 10,
      },
    });
    const text = "Y voy a ver o m o B";
    const spans = createClassifier(letters).classify(letters.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
    });
    expect(
      spans.map((s) => `${text.slice(s.start, s.end)}:${s.category}`),
    ).toEqual([
      "Y:known",
      "voy:known",
      "a:ignored",
      "ver:new",
      "o:known",
      "m:ignored",
      "o:known",
      "B:ignored",
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
  it("matches a saved phrase with a slot as one span, marked when another word fills the slot", () => {
    expect(
      classify("She made up his mind.", { "make up one's mind": "learning" }),
    ).toContainEqual({
      start: 4,
      end: 20,
      key: "make up one's mind",
      kind: "phrase",
      category: "learning",
      slot: true,
      text: "made up his mind",
    });
    expect(
      classify("Make up one's mind.", { "make up one's mind": "learning" }),
    ).toEqual([
      {
        start: 0,
        end: 18,
        key: "make up one's mind",
        kind: "phrase",
        category: "learning",
        text: "Make up one's mind",
      },
    ]);
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

  it("draws a saved phrase that starts inside an earlier dictionary phrase, not that phrase", () => {
    expect(brief(classify("gave up on it", { "on it": "learning" }))).toEqual([
      "gave up:give up:new",
      "on it:on it:learning",
    ]);
    expect(
      brief(classify("spilled the beans", { "the bean": "known" })),
    ).toEqual(["spilled:spill:new", "the beans:the bean:known"]);
  });

  it("draws the longer of two overlapping saved phrases, the earlier on a tie", () => {
    // A longer phrase saved over part of an earlier one.
    expect(
      brief(
        classify("gave up on it", {
          "give up": "learning",
          "up on it": "known",
        }),
      ),
    ).toEqual(["gave:give:new", "up on it:up on it:known"]);
    expect(
      brief(
        classify("gave up on it", { "give up": "known", "up on": "known" }),
      ),
    ).toEqual(["gave up:give up:known", "on:on:known", "it:it:new"]);
  });

  it("counts the words in a gap toward a saved phrase's length", () => {
    expect(
      brief(
        classify("figure it out", {
          "figure out": "learning",
          "it out": "known",
        }),
      ),
    ).toEqual([
      "figure:figure out:learning",
      "it:it:new",
      "out:figure out:learning",
    ]);
  });

  it("detects the longest dictionary phrase when no saved phrase matches", () => {
    expect(brief(classify("gave up on it"))).toEqual([
      "gave up on:give up on:new",
      "it:it:new",
    ]);
  });
});

describe("a detected phrase inside a longer pattern (rule LONGEST)", () => {
  const longer = createLanguagePack("en", {
    lemmas: {},
    freq: ["of", "a", "as", "we", "did", "it"],
    ipa: {},
    vocab: new Set([
      ...["of", "a", "as", "we", "did", "it", "matter", "course", "and"],
      ...["so", "kind", "some", "was"],
    ]),
    patterns: {
      detect: ["kind of", "of course"],
      // Matched only when saved or selected.
      more: [
        "and of course",
        "as a matter of course",
        "of course not",
        "some kind of",
      ],
      gap: [],
      // kind of: adverb; of course: interjection, adverb; and of course: adverb;
      // as a matter of course: none given; of course not: interjection;
      // some kind of: determiner.
      pos: { detect: "r ir", more: "r - i d" },
    },
  });
  const run = (text: string) =>
    brief(
      createClassifier(longer)
        .classify(longer.tokenize(text), { terms: terms(), knownLevel: 10 })
        .map((s) => ({ ...s, text: text.slice(s.start, s.end) })),
    ).filter((s) => s.includes(" "));

  it("does not detect a phrase inside a longer pattern of another part of speech that starts before it", () => {
    expect(run("We did it as a matter of course.")).toEqual([]);
    expect(run("It was some kind of matter.")).toEqual([]);
    expect(run("We did it, of course.")).toEqual(["of course:of course:new"]);
    expect(run("It was kind of so.")).toEqual(["kind of:kind of:new"]);
  });
  it("detects it inside a longer pattern of a part of speech it also has", () => {
    expect(run("And of course we did.")).toEqual(["of course:of course:new"]);
  });
  it("still detects it at the start of a longer pattern", () => {
    expect(run("Of course not.")).toEqual(["Of course:of course:new"]);
  });
});

describe("a verb and its complement (rule COMPLEMENT)", () => {
  const pack = createLanguagePack("en", {
    lemmas: { fell: "fall" },
    freq: ["in", "we", "they", "love", "might", "as", "well", "go"],
    ipa: {},
    vocab: new Set([
      ...["in", "we", "they", "love", "might", "as", "well", "go", "fall"],
      ...["fell", "home"],
    ]),
    patterns: {
      detect: ["fall in", "in love", "as well"],
      // Matched only when saved or selected.
      more: ["fall in love", "might as well"],
      gap: [],
      // fall in: verb; in love: prepositional phrase; as well: adverb; fall in
      // love, might as well: verbs.
      pos: { detect: "v P r", more: "v v" },
    },
    pos: { fall: ["verb"], might: ["noun", "verb"], go: ["verb"] },
  });
  const run = (text: string) =>
    brief(
      createClassifier(pack)
        .classify(pack.tokenize(text), { terms: terms(), knownLevel: 10 })
        .map((s) => ({ ...s, text: text.slice(s.start, s.end) })),
    ).filter((s) => s.includes(" "));

  it("keeps the complement highlighted inside the verb's pattern, and no phrase across it", () => {
    expect(run("They fell in love.")).toEqual(["in love:in love:new"]);
    expect(run("They fell in.")).toEqual(["fell in:fall in:new"]);
  });
  it("leaves another expression inside a modal's pattern out (rule LONGEST)", () => {
    expect(run("We might as well go.")).toEqual([]);
  });
});

describe("a detected phrase's words read through their bases (rule BASE)", () => {
  // "fue" is a form of ir and of ser; the tagger reads it as a past tense.
  const make = (freq: string[]) =>
    createLanguagePack("en", {
      lemmas: { fue: ["ir", "ser"], went: "go", fuera: ["ir", "ser"] },
      freq,
      ipa: {},
      vocab: new Set([...freq, "went", "de", "on", "fuera"]),
      patterns: { detect: ["ir de", "go on"], more: [], gap: [] },
      pos: { ir: ["verb"], ser: ["verb"], go: ["verb"], fuera: ["adverb"] },
      tagger: {
        tags: ["NN", "VBD", "RB"],
        words: { fue: "VBD", went: "VBD", fuera: "RB" },
        weights: {},
        scale: 10,
      },
    });
  const outlines: Record<string, EntryOutline> = {
    ir: { firstMeaning: true, meaning: true, pos: ["verb"] },
    ser: { firstMeaning: true, meaning: true, pos: ["verb"] },
    // went: goの過去 and nothing else.
    went: { formOf: "go", firstMeaning: false, meaning: false, pos: ["verb"] },
    go: { firstMeaning: true, meaning: true, pos: ["verb"] },
    fuera: { firstMeaning: true, meaning: true, pos: ["adverb"] },
  };
  const run = (freq: string[], text: string) => {
    const lang = make(freq);
    return brief(
      createClassifier(lang)
        .classify(lang.tokenize(text), {
          terms: terms(),
          knownLevel: 10,
          outline: (key) => outlines[key],
        })
        .map((s) => ({ ...s, text: text.slice(s.start, s.end) })),
    );
  };

  it("does not match a pattern word through a base other than the one rule A1 reads", () => {
    // ser is the more frequent verb: "fue de" is ser here.
    expect(run(["ser", "ir", "go"], "fue de")).toEqual([
      "fue:ser:known",
      "de:de:new",
    ]);
    expect(run(["ir", "ser", "go"], "fue de")).toEqual(["fue de:ir de:new"]);
  });
  it("does not match through a base a headword's tag rules out", () => {
    // "fuera" (outside) is also a form of ir and ser; read as the adverb it is none.
    expect(run(["ir", "ser", "go"], "fuera de")).toEqual([
      "fuera:fuera:known",
      "de:de:new",
    ]);
  });
  it("matches through the base a form's own entry points to", () => {
    expect(run(["ir", "ser", "go"], "went on")).toEqual(["went on:go on:new"]);
  });
  it("matches as before without the dictionary's outlines", () => {
    const lang = make(["ser", "ir", "go"]);
    const spans = createClassifier(lang).classify(lang.tokenize("fue de"), {
      terms: terms(),
      knownLevel: 10,
    });
    expect(spans.map((s) => s.key)).toEqual(["ir de"]);
  });
});

describe("a detected phrase whose written words are a preposition (rule LITERAL)", () => {
  // "fuera" is a form of ir and ser, and a headword; the tagger is unsure of it.
  const make = (more: string[]) =>
    createLanguagePack("en", {
      lemmas: { fuera: ["fuera", "ir", "ser"] },
      freq: ["ir", "ser", "de", "fuera"],
      ipa: {},
      vocab: new Set(["ir", "ser", "de", "fuera", "chile"]),
      patterns: {
        detect: ["ir de"],
        more,
        gap: [],
        pos: { detect: "v", more: more.map(() => "p").join(" ") },
      },
      pos: { ir: ["verb"], ser: ["verb"], fuera: ["adverb"] },
      tagger: { tags: ["NN", "RB"], words: {}, weights: {}, scale: 10 },
    });
  const run = (more: string[]) => {
    const lang = make(more);
    const text = "fuera de chile";
    return createClassifier(lang)
      .classify(lang.tokenize(text), {
        terms: terms(),
        knownLevel: 10,
        outline: () => ({ firstMeaning: true, meaning: true, pos: ["verb"] }),
      })
      .filter((s) => s.kind === "phrase")
      .map((s) => s.key);
  };
  it("does not read a word as another's form where its written words are a preposition", () => {
    expect(run(["fuera de"])).toEqual([]);
  });
  it("reads it so without that pattern", () => {
    expect(run([])).toEqual(["ir de"]);
  });
});

describe("Spanish pronominal verbs, contractions and names in phrases", () => {
  const spanish = createLanguagePack("es", {
    lemmas: {
      di: ["dar", "decir"],
      dado: "dar",
      ha: "haber",
      cuenta: "contar",
    },
    freq: ["de", "a", "el", "me", "se", "ha", "dar", "cuenta", "haber"],
    ipa: {},
    vocab: new Set([
      ...["de", "a", "el", "me", "se", "dar", "decir", "cuenta", "haber"],
      ...["recuerdo", "al", "del", "chile", "que", "ya", "no", "es"],
      ...["través", "contar", "picante", "come", "un"],
    ]),
    patterns: {
      detect: ["a través de", "al chile", "darse cuenta"],
      more: [],
      gap: [],
    },
    names: { chile: "pc" },
  });
  const run = (...blocks: string[]) => {
    const casing = documentCasing(
      blocks.map((b) => blockCasing(spanish.tokenize(b), "es")),
    );
    const classifier = createClassifier(spanish);
    return blocks.flatMap((block) =>
      classifier
        .classify(spanish.tokenize(block), {
          terms: terms(),
          knownLevel: 10,
          casing,
        })
        .filter((s) => s.kind === "phrase")
        .map((s) => `${block.slice(s.start, s.end)}:${s.key}`),
    );
  };

  it("highlights the reflexive pronoun with its verb, and a word between as a word", () => {
    expect(run("Me di cuenta.")).toEqual(["Me di cuenta:darse cuenta"]);
    const spans = createClassifier(spanish).classify(
      spanish.tokenize("Se ha dado cuenta."),
      { terms: terms(), knownLevel: 10 },
    );
    expect(
      spans.map((s) => [s.key, s.kind, s.part?.index ?? "-"].join(":")),
    ).toEqual([
      "darse cuenta:phrase:0",
      "haber:word:-",
      "darse cuenta:phrase:1",
    ]);
  });
  it("reads a contraction as its preposition at a pattern's end", () => {
    expect(run("Lo vi a través del cristal.")).toEqual([
      "a través del:a través de",
    ]);
  });
  it("matches no pattern over a word the document reads as a name", () => {
    expect(run("Recuerdo al Chile que ya no es.", "Chile es un país.")).toEqual(
      [],
    );
    expect(run("Come un chile picante, al chile.")).toEqual([
      "al chile:al chile",
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

describe("sameSpans", () => {
  const classify = (text: string, saved: Record<string, TermStatus> = {}) =>
    classifier.classify(pack.tokenize(text), {
      terms: terms(saved),
      knownLevel: 10,
    });

  it("is true for a text classified again with the same terms", () => {
    expect(
      sameSpans(
        classify("We gave up tangy yeast"),
        classify("We gave up tangy yeast"),
      ),
    ).toBe(true);
    expect(sameSpans(null, null)).toBe(true);
  });

  it("is false when a category, a span or a field differs", () => {
    const before = classify("We gave up tangy yeast");
    expect(
      sameSpans(
        before,
        classify("We gave up tangy yeast", { yeast: "learning" }),
      ),
    ).toBe(false);
    expect(sameSpans(before, before.slice(1))).toBe(false);
    expect(
      sameSpans(
        before,
        before.map((s, i) => (i === 0 ? { ...s, pos: "noun" } : s)),
      ),
    ).toBe(false);
    expect(sameSpans(null, [])).toBe(false);
  });

  it("compares a phrase part's fields, not its object", () => {
    const span: Span = {
      start: 0,
      end: 6,
      key: "figure out",
      kind: "phrase",
      category: "new",
      part: { index: 0, count: 2, start: 0, end: 16 },
    };
    expect(sameSpans([span], [{ ...span, part: { ...span.part! } }])).toBe(
      true,
    );
    expect(
      sameSpans([span], [{ ...span, part: { ...span.part!, end: 17 } }]),
    ).toBe(false);
  });
});

describe("names by document casing (rule D)", () => {
  // Ranks: park 1, the 2; every other word is rare.
  const vocab = [
    ...["park", "the", "mark", "badger", "world", "english", "hey", "a"],
    ...["japan", "germany", "helen", "met", "saw", "we", "in", "and", "it"],
    ...["enlightenment", "on", "rained", "then", "um", "ok", "us", "said"],
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
      ok: "xp!",
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

  it("reads a word English writes in capitals as a common word as no acronym (OK)", () => {
    const spans = run(["We said OK to US and Japan in the park."]);
    // "OK" is the interjection ("!": a capitalised common word), "US" the acronym.
    expect(spans.find((s) => s.text === "OK")).not.toHaveProperty("capital");
    expect(spans.find((s) => s.text === "US")).toMatchObject({ capital: true });
  });

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

describe("capitalised inflected forms (rule D, a language that capitalises only names)", () => {
  // Ranks: estado 1, unido 2, salar 3, el 4; every other word is rare.
  const data = {
    lemmas: {
      bruna: "bruno",
      estados: "estado",
      unidos: "unido",
      salad: "salar",
      hales: "halar",
      imagínate: "imaginar",
      las: "el",
      andes: "andar",
      desaparecidos: "desaparecido",
    },
    freq: ["estado", "unido", "salar", "el", "andar"],
    ipa: {},
    vocab: new Set([
      ...["vimos", "a", "y", "en", "de", "la", "gente", "calle", "leímos"],
      ...["bruno", "estado", "unido", "salar", "halar", "imaginar", "el"],
      ...["marina", "los", "andar", "desaparecido"],
    ]),
    patterns: { detect: [], more: [], gap: [] },
    pos: {
      el: ["article"],
      la: ["article"],
      los: ["article"],
      andar: ["verb", "noun"],
      desaparecido: ["adjective", "noun"],
    },
    names: { marina: "g" },
  };
  const verdicts = (lang: string, ...blocks: string[]) => {
    const pack = createLanguagePack(lang, data);
    const casing = documentCasing(
      blocks.map((b) => blockCasing(pack.tokenize(b), lang)),
    );
    return blocks.flatMap((block) =>
      createClassifier(pack)
        .classify(pack.tokenize(block), {
          terms: terms(),
          knownLevel: 0,
          casing,
        })
        .map((s) => ({ ...s, text: block.slice(s.start, s.end) }))
        .filter((s) => /^\p{Lu}/u.test(s.text) && s.text !== "Vimos")
        .map(
          (s) =>
            `${s.text}:${s.name ? "name" : s.capital ? "capital" : s.category}`,
        ),
    );
  };

  it("takes a form whose bases are all rare for a name, and keeps a common word's form", () => {
    expect(verdicts("es", "Vimos a Bruna en Estados Unidos.")).toEqual([
      "Bruna:name",
      "Estados:new",
      "Unidos:new",
    ]);
  });
  it("takes a form right after a capitalised word the language does not know for a name", () => {
    // salar is common, but "My" is no Spanish word: a foreign title.
    expect(verdicts("es", "Leímos My Salad de Stephen Hales.")).toEqual([
      "Leímos:new",
      "My:ignored",
      "Salad:name",
      "Stephen:ignored",
      "Hales:name",
    ]);
  });
  it("takes no form for a name after a determiner, in a document without punctuation, or in a language that capitalises common words", () => {
    expect(verdicts("es", "Vimos a Bruna.", "Vimos la Bruna.")).toEqual([
      "Bruna:name",
      "Bruna:new",
    ]);
    // Speech recognition: no commas in 60 words, turn starts capitalised.
    const asr = Array.from(
      { length: 6 },
      (_, i) =>
        `vimos a la gente en la calle ${i === 2 ? "Imagínate" : "y"} vimos a Marina`,
    ).join(" ");
    expect(verdicts("es", asr)).toEqual([
      ...Array.from({ length: 2 }, () => "Marina:name"),
      "Imagínate:new",
      ...Array.from({ length: 4 }, () => "Marina:name"),
    ]);
    expect(verdicts("es", "Vimos a la gente en la calle y Imagínate.")).toEqual(
      ["Imagínate:name"],
    );
    expect(verdicts("en", "Vimos a Bruna.")).toEqual(["Bruna:capital"]);
  });
  it("takes a word known only as a verb's form for a name after a determiner", () => {
    // andar is common, but a determiner opens a noun phrase: "los Andes".
    expect(verdicts("es", "Vimos los Andes.", "Vimos a los Andes.")).toEqual([
      "Andes:name",
      "Andes:name",
    ]);
    // A participle used as a noun has a base that is no verb.
    expect(verdicts("es", "Vimos a los Desaparecidos.")).toEqual([
      "Desaparecidos:new",
    ]);
    // Written in lower case once, it is the word; English capitalises common words.
    expect(verdicts("es", "Vimos los Andes.", "Leímos que andes.")).toEqual([
      "Andes:new",
      "Leímos:new",
    ]);
    expect(verdicts("en", "Vimos los Andes.")).toEqual(["Andes:capital"]);
  });
});

describe("French names (rule D after a determiner)", () => {
  // japon (japanware) and clémentine (the fruit) are words too; "de" is also the
  // partitive article, but mainly a preposition.
  const pack = createLanguagePack("fr", {
    lemmas: {},
    freq: [
      "de",
      "la",
      "le",
      "du",
      "chambre",
      "japon",
      "clémentine",
      "république",
    ],
    ipa: {},
    vocab: new Set([
      ...[
        "on",
        "voit",
        "de",
        "la",
        "le",
        "du",
        "chambre",
        "japon",
        "clémentine",
      ],
      ...["république", "et"],
    ]),
    patterns: { detect: [], more: [], gap: [] },
    pos: {
      de: ["preposition", "article", "noun"],
      la: ["article", "pronoun"],
      le: ["article", "pronoun"],
      du: ["article", "contraction"],
    },
    names: { japon: "pc", clémentine: "gc", république: "x" },
  });
  const verdicts = (...blocks: string[]) => {
    const casing = documentCasing(
      blocks.map((b) => blockCasing(pack.tokenize(b), "fr")),
    );
    return blocks.flatMap((block) =>
      createClassifier(pack)
        .classify(pack.tokenize(block), {
          terms: terms(),
          knownLevel: 0,
          casing,
        })
        .map((s) => ({ ...s, text: block.slice(s.start, s.end) }))
        .filter((s) => /^\p{Lu}/u.test(s.text) && s.text !== "On")
        .map((s) => `${s.text}:${s.name ? "name" : s.category}`),
    );
  };

  it("reads a place the language writes capitalised for a name after an article", () => {
    expect(
      verdicts("On voit le Japon et la République.", "On voit du Japon."),
    ).toEqual(["Japon:name", "République:new", "Japon:name"]);
    // Written in lower case once, it is the word.
    expect(verdicts("On voit le Japon.", "On voit du japon.")).toEqual([
      "Japon:new",
    ]);
  });
  it("reads a name after a preposition that is also an article (de)", () => {
    expect(verdicts("On voit la chambre de Clémentine.")).toEqual([
      "Clémentine:name",
    ]);
  });
});

describe("Spanish words the sentence decides (utterances, the article lo, ser or ir)", () => {
  // The tagger is sure of these words only; "fue" is a form of ser and ir.
  const spanish = createLanguagePack("es", {
    lemmas: { fue: ["ser", "ir"], fui: ["ser", "ir"] },
    freq: ["ser", "ir", "de", "a", "se", "lo", "que", "vale"],
    ipa: {},
    vocab: new Set([
      ...["ser", "ir", "de", "a", "se", "lo", "que", "vale", "un", "compra"],
      ...["vamos", "dijo", "con", "madrid", "vacaciones", "me"],
      ...["bueno", "y", "yo", "creo", "muy", "para", "mí"],
    ]),
    patterns: { detect: ["ir de"], more: [], gap: [] },
    pos: {
      ser: ["verb", "noun"],
      ir: ["verb"],
      lo: ["pronoun", "article"],
      vale: ["noun", "interjection"],
      un: ["article"],
      bueno: ["adjective", "interjection"],
    },
    tagger: {
      tags: ["NOUN", "VERB.Fin", "ADJ"],
      words: {
        fue: "VERB.Fin",
        fui: "VERB.Fin",
        se: "PRON",
        me: "PRON",
        lo: "PRON",
        que: "PRON",
        dijo: "VERB.Fin",
        de: "ADP",
        a: "ADP",
        con: "ADP",
        un: "DET",
        vale: "NOUN",
        bueno: "ADJ",
        y: "CCONJ",
        yo: "PRON",
        creo: "VERB.Fin",
        muy: "ADV",
        para: "ADP",
      },
      weights: {},
      scale: 10,
    },
  });
  const outlines: Record<string, EntryOutline> = {
    ser: { firstMeaning: true, meaning: true, pos: ["verb", "noun"] },
    ir: { firstMeaning: true, meaning: true, pos: ["verb"] },
    vale: { firstMeaning: true, meaning: true, pos: ["noun", "interjection"] },
    lo: { firstMeaning: true, meaning: true, pos: ["pronoun", "article"] },
    bueno: {
      firstMeaning: true,
      meaning: true,
      pos: ["adjective", "interjection"],
    },
  };
  const run = (text: string) =>
    createClassifier(spanish)
      .classify(spanish.tokenize(text), {
        terms: terms(),
        knownLevel: 10,
        outline: (key) => outlines[key],
      })
      .map((s) => `${text.slice(s.start, s.end)}:${s.key}:${s.pos ?? "-"}`);

  it("shows an utterance of its own by its interjection senses", () => {
    expect(run("Vale, vamos.")[0]).toBe("Vale:vale:interjection");
    expect(run("¿Vale?")[0]).toBe("Vale:vale:interjection");
    expect(run("un vale de compra")[1]).toBe("vale:vale:noun");
    // A caption's sound label, and a word followed by more of its sentence.
    expect(run("[vale].")[0]).toBe("vale:vale:noun");
    expect(run("Vale de compra.")[0]).toBe("Vale:vale:noun");
  });
  it("reads an adjective with nothing to qualify as said alone where nothing is punctuated", () => {
    const unpunctuated = (text: string) =>
      createClassifier(spanish)
        .classify(spanish.tokenize(text), {
          terms: terms(),
          knownLevel: 10,
          outline: (key) => outlines[key],
          casing: { mode: "mixed", words: {}, unpunctuated: true },
        })
        .map((s) => `${text.slice(s.start, s.end)}:${s.key}:${s.pos ?? "-"}`);
    expect(unpunctuated("y bueno yo creo")[1]).toBe("bueno:bueno:interjection");
    expect(unpunctuated("bueno yo creo")[0]).toBe("bueno:bueno:interjection");
    // Something to qualify before it, or a complement after it.
    expect(unpunctuated("muy bueno")[1]).toBe("bueno:bueno:adjective");
    expect(unpunctuated("bueno para mí")[0]).toBe("bueno:bueno:adjective");
    // In a punctuated document, only standing alone between punctuation.
    expect(run("y bueno yo creo")[1]).toBe("bueno:bueno:adjective");
  });
  it("reads lo with no verb after it as the article", () => {
    expect(run("lo que dijo")[0]).toBe("lo:lo:determiner");
    expect(run("lo dijo")[0]).toBe("lo:lo:pronoun");
  });
  it("reads a form of ser and ir as ir where ser cannot stand, and keeps a plain verb's pattern off it after a reflexive", () => {
    // After a reflexive, a pronominal verb (rule A2 shows its "reflexive" senses).
    expect(run("se fue con")[1]).toBe("fue:ir:pronominal");
    expect(run("fui a Madrid")[0]).toBe("fui:ir:verb");
    expect(run("me fui de vacaciones")).toEqual([
      "me:me:pronoun",
      "fui:ir:pronominal",
      "de:de:preposition",
      "vacaciones:vacaciones:-",
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
  it("gives a phrase's words their parts of speech by their key's words", () => {
    const [, phrase] = run("We decided fine.", {
      terms: terms({ "decided fine": "learning" }),
    });
    expect(phrase).toMatchObject({
      kind: "phrase",
      key: "decided fine",
      wordPos: { decided: "verb", fine: "adjective" },
    });
    expect(phrase).not.toHaveProperty("pos");
  });
  it("does nothing without the dictionary's outlines", () => {
    const spans = run("We decided fine.", { outline: undefined });
    expect(spans.map((s) => s.key)).toEqual(["we", "decided", "fine"]);
    expect(spans.some((s) => "pos" in s)).toBe(false);
  });
});

describe("capital-only words", () => {
  const capitals = createLanguagePack("en", {
    lemmas: {},
    freq: ["the", "we", "in", "saw"],
    ipa: {},
    vocab: new Set(["the", "we", "in", "saw", "said", "it", "was"]),
    patterns: { detect: [], more: [], gap: [] },
    pos: { the: ["article"], we: ["pronoun"] },
    names: { tokyo: "p", pam: "g", ai: "g" },
    capitals: ["AI", "PAM", "Tokyo"],
  });
  const run = (blocks: string[], mode?: "upper") => {
    const casing =
      mode === "upper"
        ? { mode, words: {} }
        : documentCasing(
            blocks.map((b) => blockCasing(capitals.tokenize(b), "en")),
          );
    return blocks.flatMap((block) =>
      createClassifier(capitals)
        .classify(capitals.tokenize(block), {
          terms: terms(),
          knownLevel: 4,
          casing,
          capitalMeaning: (key) => (key === "tokyo" ? "word" : undefined),
        })
        .map((s) => `${block.slice(s.start, s.end)}:${s.category}`),
    );
  };

  it("are words where the text writes them so", () => {
    expect(run(["We saw AI in Tokyo.", "It was in Tokyo."])).toEqual([
      "We:known",
      "saw:known",
      "AI:new",
      "in:known",
      "Tokyo:new",
      "It:new",
      "was:new",
      "in:known",
      "Tokyo:new",
    ]);
    // Speech recognition in lower case: no case to read them by.
    expect(run(["we saw ai in tokyo"])).toContain("ai:ignored");
  });

  it("are none in a document in capitals, whose case says nothing", () => {
    expect(run(["WE SAW PAM IN TOKYO."], "upper")).toEqual([
      "WE:known",
      "SAW:known",
      "PAM:ignored",
      "IN:known",
      "TOKYO:ignored",
    ]);
  });
});
