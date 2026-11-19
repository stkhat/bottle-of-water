import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  germanForms,
  germanWritten,
  parseDeFrequencyWikitext,
} from "./de-frequency.ts";
import { GERMAN_BUILD, germanEditionIpa } from "./de-kaikki.ts";
import {
  buildLearningPacks,
  contractionMeaning,
  keptSenses,
  translationFirst,
  type LearningPacks,
} from "./learning-kaikki.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-de.jsonl");
const edition = join(
  import.meta.dirname,
  "fixtures",
  "kaikki-de-edition-slim.jsonl",
);
// The list keeps case: a sentence's first word ("Der"), nouns ("Essen", "Reisen").
const written = germanWritten(
  parseDeFrequencyWikitext(
    [
      "900 [[Der]]",
      "800 [[der]]",
      "700 [[sie]]",
      "650 [[Sie]]",
      "600 [[haben]]",
      "500 [[Essen]]",
      "400 [[im]]",
      "300 [[essen]]",
      "200 [[Reisen]]",
      "150 [[fängt]]",
      "100 [[ans]]",
      "90 [[reisen]]",
      "80 [[Häuser]]",
      "70 [[Haus]]",
      "60 [[Reise]]",
      "50 [[anfangen]]",
      "40 [[in]]",
      "30 [[an]]",
      "20 [[aufessen]]",
      "10 [[fangen]]",
      "5 [[Mensch]]",
    ].join("\n"),
  ),
);

describe("the German frequency list", () => {
  it("keeps each spelling as written, then folds them for the vocabulary", () => {
    expect(written.slice(0, 3)).toEqual(["Der", "der", "sie"]);
    expect(germanForms(written).slice(0, 3)).toEqual(["der", "sie", "haben"]);
  });
});

describe("buildLearningPacks with German's settings", () => {
  let packs: LearningPacks;
  beforeAll(async () => {
    packs = await buildLearningPacks(
      GERMAN_BUILD,
      fixture,
      germanForms(written),
      {
        casePaths: [edition],
        ipaPaths: [edition],
        written,
        phraseScoring: { stopwords: { gloss: 4, function: 2 } },
      },
    );
  });

  it("reads capitalised headwords as words, their forms too", () => {
    expect(packs.vocab).toContain("haus");
    expect(packs.lemmas["häuser"]).toBe("haus");
    expect(packs.defs["haus"]?.[0]).toBe("house");
  });
  it("gives a key both spellings' senses, the lowercase headword's first, and no name's", () => {
    expect(packs.defs["essen"]?.[1]).toEqual([
      ["verb", "to eat"],
      ["noun", "meal"],
      ["noun", "food"],
    ]);
  });
  it("puts a capitalised headword first where the examples write it so inside sentences", () => {
    expect(packs.defs["mensch"]?.[1]).toEqual([
      ["noun", "human being"],
      ["pronoun", "one, they"],
    ]);
  });
  it("keeps room for a capitalised headword the lowercase one would crowd out", () => {
    const senses = packs.defs["sie"]![1];
    expect(senses).toHaveLength(6);
    expect(senses.at(-1)).toEqual([
      "pronoun",
      "you (polite, singular and plural)",
    ]);
  });
  it("ranks a capitalised form by its own headword's bases", () => {
    // "Reisen" ranks Reise (200) before reisen ranks itself (90).
    expect(packs.freq.indexOf("reise")).toBeLessThan(
      packs.freq.indexOf("reisen"),
    );
    // A sentence's first word ("Der") is the lowercase word's.
    expect(packs.freq[0]).toBe("der");
  });
  it("lists a separable verb after a form's other bases, without its rank", () => {
    expect(packs.lemmas["fängt"]).toEqual(["fangen", "anfangen"]);
    expect(packs.lemmas["essen"]).toEqual(["essen", "aufessen"]);
    // "fängt" (150) ranks fangen, not anfangen (50).
    expect(packs.freq.indexOf("fangen")).toBeLessThan(
      packs.freq.indexOf("anfangen"),
    );
    expect(packs.freq.indexOf("aufessen")).toBeGreaterThan(
      packs.freq.indexOf("essen"),
    );
  });
  it("labels a verb's auxiliary senses so, its parts of speech still a verb", () => {
    expect(packs.defs["haben"]?.[1]).toEqual([
      ["auxiliary", "forms the perfect aspect (have)"],
      ["verb", "to have; to own"],
    ]);
    expect(packs.pos["haben"]).toEqual(["verb"]);
  });
  it("gives contractions their meaning", () => {
    expect(packs.defs["im"]?.[0]).toBe("in the");
    expect(packs.defs["ans"]?.[0]).toBe("on(to) the");
  });
  it("writes the edition's IPA in slashes for words English Wiktionary has none for", () => {
    expect(packs.ipa["haus"]).toBe("/haʊ̯s/");
    expect(packs.ipa["essen"]).toBe("/ˈɛsn̩/");
  });
  it("puts the article's translation first", () => {
    expect(packs.defs["der"]?.[0]).toBe("the");
  });
});

describe("germanEditionIpa", () => {
  it("writes de.wiktionary's brackets as slashes", () => {
    expect(germanEditionIpa("[haʊ̯s]")).toBe("/haʊ̯s/");
    expect(germanEditionIpa("/haʊ̯s/")).toBe("/haʊ̯s/");
  });
});

describe("contractionMeaning, German contractions", () => {
  it("reads a meaning after the parts, or the parts' own glosses", () => {
    expect(contractionMeaning("contraction of in + dem; in the")).toBe(
      "in the; contraction of in + dem",
    );
    expect(
      contractionMeaning("contraction of bei + dem: at the, by the, etc."),
    ).toBe("at the, by the, etc.; contraction of bei + dem");
    expect(
      contractionMeaning(
        "contraction of an (“at/on”) + dem (“the”, masculine/neuter dative singular)",
      ),
    ).toBe("at/on the; contraction of an + dem");
    expect(contractionMeaning("contraction of um + das")).toBeUndefined();
  });
});

describe("translationFirst, a description before a comma", () => {
  it("puts the translation after the part of speech's name first", () => {
    expect(
      translationFirst("nominative masculine singular definite article, the"),
    ).toBe("the; nominative masculine singular definite article");
    expect(translationFirst("his, her")).toBe("his, her");
  });
});

describe("keptSenses", () => {
  it("keeps each part of speech's first sense within the cap", () => {
    const verbs = ["a", "b", "c", "d", "e"].map(
      (x) => ["verb", x] as [string, string],
    );
    expect(
      keptSenses([...verbs, ["noun", "n"], ["determiner", "his"]], 6),
    ).toEqual([...verbs.slice(0, 4), ["noun", "n"], ["determiner", "his"]]);
    expect(keptSenses(verbs, 6)).toEqual(verbs);
  });
  it("gives no place to a part whose first sense only describes its use", () => {
    const preps = ["a", "b", "c", "d", "e", "f"].map(
      (x) => ["preposition", x] as [string, string],
    );
    expect(
      keptSenses(
        [
          ...preps,
          ["article", "Used in the plural with prepositioned adjectives."],
        ],
        6,
      ),
    ).toEqual(preps);
  });
});
