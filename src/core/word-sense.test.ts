import { describe, expect, it } from "vitest";
import type { EntryOutline } from "./lexicon/dictionary";
import { createLanguagePack } from "./lexicon/language-pack";
import type { TokenTag, WordUse } from "./tagging/tagger";
import { chooseKey, readWords, sensePos, type WordReading } from "./word-sense";

/** Headwords as the dictionary outlines them (`DictionaryProvider.outline`). */
const OUTLINES: Record<string, EntryOutline> = {
  // decided: 明白な (a meaning first); decide: 決心する.
  decided: { firstMeaning: true, meaning: true, pos: ["adjective"] },
  decide: { firstMeaning: true, meaning: true, pos: ["verb"] },
  // saw: seeの過去, then のこぎり (meanings of its own).
  saw: { formOf: "see", firstMeaning: false, meaning: true, pos: ["verb"] },
  see: { firstMeaning: true, meaning: true, pos: ["verb"] },
  // went: goの過去 and nothing else.
  went: { formOf: "go", firstMeaning: false, meaning: false, pos: ["verb"] },
  go: { firstMeaning: true, meaning: true, pos: ["verb"] },
  // better: (good の比較級)いっそうよい.
  better: {
    formOf: "good",
    firstMeaning: true,
    meaning: true,
    pos: ["adjective"],
  },
  good: { firstMeaning: true, meaning: true, pos: ["adjective"] },
  // hung: "hangの過去・過去分詞・…を吊るした" (a form, then a meaning of its own).
  hung: { formOf: "hang", firstMeaning: true, meaning: true, pos: ["verb"] },
  hang: { firstMeaning: true, meaning: true, pos: ["verb"] },
  // has: haveの三人称単数現在; being: 存在.
  has: { formOf: "have", firstMeaning: false, meaning: false, pos: ["verb"] },
  have: { firstMeaning: true, meaning: true, pos: ["verb"] },
  being: { firstMeaning: true, meaning: true, pos: ["noun"] },
  be: { firstMeaning: true, meaning: true, pos: ["verb"] },
  established: { firstMeaning: true, meaning: true, pos: ["adjective"] },
  establish: { firstMeaning: true, meaning: true, pos: ["verb"] },
  including: { firstMeaning: true, meaning: true, pos: ["preposition"] },
  include: { firstMeaning: true, meaning: true, pos: ["verb"] },
  following: { firstMeaning: true, meaning: true, pos: ["adjective", "noun"] },
  follow: { firstMeaning: true, meaning: true, pos: ["verb"] },
  arise: { firstMeaning: true, meaning: true, pos: ["verb"] },
  aris: { firstMeaning: true, meaning: true, pos: ["noun"] },
};
const outline = (key: string) => OUTLINES[key];

const POS: Record<string, string[]> = {
  decide: ["verb"],
  see: ["verb"],
  go: ["verb"],
  good: ["adjective"],
  hang: ["verb"],
  have: ["verb"],
  be: ["verb"],
  establish: ["verb"],
  include: ["verb"],
  follow: ["verb"],
  arise: ["verb"],
  aris: ["noun"],
};
const lang = {
  partsOfSpeech: (word: string) => POS[word] ?? [],
  // "aris" is more common than "arise" here: the tag decides.
  rank: (word: string) => (word === "aris" ? 1 : 2),
};

const tag = (label: string, tagName: string, inflected = true): TokenTag => ({
  tag: tagName,
  label,
  inflected,
  morph: inflected,
  proper: false,
  confidence: Infinity,
});
const VBD = tag("verb", "VBD");
const VBN = tag("verb", "VBN");
const VBG = tag("verb", "VBG");
const JJR = tag("adjective", "JJR");
const USE: WordUse = {
  auxiliary: false,
  verbal: "other",
  prepositionSlot: false,
};
const reading = (
  t: TokenTag | undefined,
  use: Partial<WordUse> = {},
): WordReading => ({
  ...(t && { tag: t }),
  use: { ...USE, ...use },
});

const key = (form: string, bases: string[], r: WordReading) =>
  chooseKey(form, bases, r, outline, lang) ?? bases[0];

describe("chooseKey (rule A1)", () => {
  it("takes an inflected form's base when its own entry starts with a meaning of its own", () => {
    expect(key("decided", ["decided", "decide"], reading(VBD))).toBe("decide");
  });
  it("takes the base an entry names a form of when the entry also means other things", () => {
    expect(key("saw", ["saw", "see"], reading(VBD))).toBe("see");
  });
  it("keeps an entry that is only a form of its base: its lines follow the pointer", () => {
    expect(key("went", ["went", "go"], reading(VBD))).toBe("went");
  });
  it("keeps an entry that names the form and adds a meaning right there", () => {
    expect(key("hung", ["hung", "hang"], reading(VBD))).toBe("hung");
  });
  it("keeps a comparative's own entry", () => {
    expect(key("better", ["better", "good"], reading(JJR))).toBe("better");
  });
  it("keeps the word without a trusted tag, or with a tag that is no inflection", () => {
    expect(key("decided", ["decided", "decide"], reading(undefined))).toBe(
      "decided",
    );
    expect(
      key(
        "decided",
        ["decided", "decide"],
        reading(tag("adjective", "JJ", false)),
      ),
    ).toBe("decided");
  });
  it("keeps an auxiliary's pointer, and takes the base of one whose entry means something else", () => {
    const aux = { auxiliary: true };
    expect(key("has", ["has", "have"], reading(tag("verb", "VBZ"), aux))).toBe(
      "has",
    );
    expect(key("being", ["being", "be"], reading(VBG, aux))).toBe("be");
    // Without a tag too: auxiliaries are a closed class.
    expect(key("being", ["being", "be"], reading(undefined, aux))).toBe("be");
  });
  it("keeps a participle's own entry when it is not used as a verb", () => {
    expect(
      key(
        "established",
        ["established", "establish"],
        reading(VBN, { verbal: false }),
      ),
    ).toBe("established");
    expect(key("established", ["established", "establish"], reading(VBN))).toBe(
      "establish",
    );
  });
  it("keeps a participle's own entry where a preposition stands, if its entry has one", () => {
    const slot = { prepositionSlot: true };
    expect(key("including", ["including", "include"], reading(VBG, slot))).toBe(
      "including",
    );
    expect(key("following", ["following", "follow"], reading(VBG, slot))).toBe(
      "follow",
    );
  });
  it("keeps a gerund noun's own entry when it has noun senses", () => {
    expect(
      key(
        "following",
        ["following", "follow"],
        reading(VBG, { label: "noun" }),
      ),
    ).toBe("following");
  });
  it("chooses among the bases of a form that is no headword by the tag, then by frequency", () => {
    expect(key("arises", ["aris", "arise"], reading(tag("verb", "VBZ")))).toBe(
      "arise",
    );
    expect(key("arises", ["aris", "arise"], reading(undefined))).toBe("aris");
  });
  it("leaves a word with one base form alone", () => {
    expect(chooseKey("dough", ["dough"], reading(VBD), outline, lang)).toBe(
      undefined,
    );
  });
});

describe("sensePos (rule A2's part of speech)", () => {
  it("gives a trusted tag's part of speech", () => {
    expect(
      sensePos("fine", "fine", reading(tag("adjective", "JJ", false))),
    ).toBe("adjective");
    expect(sensePos("decided", "decide", reading(VBD))).toBe("verb");
  });
  it("gives none for an auxiliary, an untrusted tag or a participle used otherwise", () => {
    expect(sensePos("has", "has", reading(VBD, { auxiliary: true }))).toBe(
      undefined,
    );
    expect(sensePos("fine", "fine", reading(undefined))).toBe(undefined);
    expect(
      sensePos("established", "established", reading(VBN, { verbal: false })),
    ).toBe(undefined);
    expect(
      sensePos(
        "including",
        "including",
        reading(VBG, { prepositionSlot: true }),
      ),
    ).toBe(undefined);
  });
  it("gives the use's part of speech for a gerund", () => {
    expect(
      sensePos("reporting", "report", reading(VBG, { label: "noun" })),
    ).toBe("noun");
  });
});

describe("readWords", () => {
  /**
   * A pack whose tagger is sure of "the", "rose" and "fell" only, and records the
   * tokens it is given (`seen`).
   */
  function spiedPack() {
    const pack = createLanguagePack("en", {
      lemmas: { rose: "rise" },
      freq: [],
      ipa: {},
      vocab: new Set(["the", "rose", "rise", "it", "fell"]),
      patterns: { detect: [], more: [], gap: [] },
      tagger: {
        tags: ["NN", "VBD"],
        words: { rose: "VBD", the: "DT", fell: "VBD" },
        weights: {},
        scale: 10,
      },
    });
    const seen: string[][] = [];
    const tagger = pack.tagger!;
    const tag = tagger.tag.bind(tagger);
    Object.assign(tagger, {
      tag: (tokens: readonly string[]) => {
        seen.push([...tokens]);
        return tag(tokens);
      },
    });
    return { pack, seen };
  }

  it("tags the block sentence by sentence, punctuation included, and reads each word", () => {
    const { pack, seen } = spiedPack();
    const tokens = pack.tokenize("The rose fell. It, the rose!");
    const { words } = pack.matcher.prepare(tokens);
    const readings = readWords(pack, tokens, words, false);
    expect(seen).toEqual([
      ["The", "rose", "fell", "."],
      ["It", ",", "the", "rose", "!"],
    ]);
    expect(readings.map((r) => r.tag?.tag)).toEqual([
      "DT",
      "VBD",
      "VBD",
      // The tagger is not sure of "It".
      undefined,
      "DT",
      "VBD",
    ]);
  });

  it("tags an ALL-CAPS document in lower case", () => {
    const { pack, seen } = spiedPack();
    const tokens = pack.tokenize("THE ROSE FELL.");
    readWords(pack, tokens, pack.matcher.prepare(tokens).words, true);
    expect(seen).toEqual([["the", "rose", "fell", "."]]);
  });

  it("reads nothing without a tagger", () => {
    const pack = createLanguagePack("es", {
      lemmas: {},
      freq: [],
      ipa: {},
      vocab: new Set(["casa"]),
      patterns: { detect: [], more: [], gap: [] },
    });
    const tokens = pack.tokenize("casa");
    expect(pack.tagger).toBeUndefined();
    expect(
      readWords(pack, tokens, pack.matcher.prepare(tokens).words, false),
    ).toEqual([]);
  });
});
