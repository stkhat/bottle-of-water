import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  altMeaning,
  buildEsPacks,
  byTreebank,
  byTreebankTags,
  partsOfSpeech,
  pointerMeaning,
  quotedMeaning,
  spanishPhraseBuild,
  translationFirst,
  withoutHeadLabels,
  writeEsPacks,
  type EsPacks,
} from "./es-kaikki.ts";
import type { LemmaCounts } from "./es-tagger.ts";
import {
  importPhrases,
  type PatternVerdict,
  type PhraseBuildLanguage,
} from "./phrases.ts";

const counts = (
  byForm: Record<string, number> = {},
  byLemma: Record<string, number> = {},
  byTag: Record<string, number> = {},
): LemmaCounts => ({
  byForm: new Map(Object.entries(byForm)),
  byLemma: new Map(Object.entries(byLemma)),
  byTag: new Map(Object.entries(byTag)),
});

const fixture = join(import.meta.dirname, "fixtures", "kaikki-es.jsonl");
// Frequency-list forms in rank order. "casar" and "hablar" are reached only through
// their forms; "zapato" (in the fixture) is outside the list.
const forms = [
  "de",
  "la",
  "el",
  "comiendo",
  "comí",
  "casas",
  "casa",
  "brasil",
  "hablo",
  "tomar",
  "pelo",
  "comer",
  "ajeno",
  "rosa",
  "a",
  "pelos",
];
// Base ranks: de 1, la 2, el 3, comer 4, casa 5, casar 6, hablar 7, tomar 8, pelo 9,
// rosa 10, a 11. "brasil" has only a proper-noun entry, so it is not a vocabulary word.
const options = { phraseScoring: { stopwords: { gloss: 4, function: 2 } } };

describe("buildEsPacks", () => {
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(fixture, forms, options);
  });

  it("builds the vocabulary from the bases with meanings that the listed forms reach", () => {
    expect(packs.vocab).toEqual([
      "a",
      "casa",
      "casar",
      "comer",
      "de",
      "el",
      "hablar",
      "la",
      "pelo",
      "rosa",
      "tomar",
    ]);
  });
  it("maps listed forms to their vocabulary bases", () => {
    expect(packs.lemmas.comiendo).toBe("comer");
    expect(packs.lemmas.hablo).toBe("hablar");
    expect(packs.lemmas.casas).toEqual(["casa", "casar"]);
  });
  it("keeps the bases of forms that are vocabulary words themselves", () => {
    expect(packs.lemmas.casa).toBe("casar");
  });
  it("maps a form whose entries are all form-of senses, skipping junk and obsolete targets", () => {
    expect(packs.lemmas["comí"]).toBe("comer");
    expect(packs.vocab).not.toContain("comí");
  });
  it("maps every form kaikki gives of a vocabulary word, listed or not, but not a base to itself", () => {
    // "comemos" is outside the frequency list.
    expect(packs.lemmas.comemos).toBe("comer");
    expect(packs.lemmas).not.toHaveProperty("comer");
    expect(Object.keys(packs.lemmas).sort()).toEqual([
      "casa",
      "casas",
      "comemos",
      "comiendo",
      "comí",
      "hablo",
      "pelos",
    ]);
    expect(packs.vocab).not.toContain("comemos");
  });
  it("takes the first phonemic IPA of each vocabulary word", () => {
    expect(packs.ipa.comer).toBe("/koˈmeɾ/");
    expect(packs.ipa.casa).toBe("/ˈkasa/");
    expect(packs.ipa.rosa).toBe("/ˈrosa/");
    expect(packs.ipa).not.toHaveProperty("comiendo");
    expect(packs.ipa).not.toHaveProperty("zapato");
  });
  it("keeps only the phonemic /…/ part of an IPA that also gives the phonetic one", () => {
    // The fixture gives "rosa" as "/ˈrosa/ [ˈro.sa]".
    expect(packs.ipa.rosa).toBe("/ˈrosa/");
  });
  it("ranks the bases by their forms' best rank", () => {
    expect(packs.freq).toEqual([
      "de",
      "la",
      "el",
      "comer",
      "casa",
      "casar",
      "hablar",
      "tomar",
      "pelo",
      "rosa",
      "a",
    ]);
  });
  it("ranks a form that is a vocabulary word only as itself", async () => {
    const { freq } = await buildEsPacks(fixture, ["casa", "de", "casas"]);
    expect(freq).toEqual(["casa", "de", "casar"]);
  });
  it("defines vocabulary words with up to 6 usable senses across their entries", () => {
    expect(packs.defs.comer).toEqual([
      "to eat",
      [
        ["verb", "to eat; to dine"],
        ["verb", "to have lunch"],
        ["verb", "to eat away, corrode"],
        ["verb", "to capture a piece"],
        ["noun", "food"],
        ["noun", "meal"],
      ],
    ]);
  });
  it("uses a sense's last gloss and readable parts of speech", () => {
    expect(packs.defs.tomar).toEqual([
      "to drink (a beverage)",
      [["verb", "to drink (a beverage)"]],
    ]);
    expect(packs.defs.rosa).toEqual(["rose", [["noun", "rose"]]]);
    expect(packs.defs.casa?.[1]).toEqual([
      ["noun", "house"],
      ["noun", "home"],
    ]);
  });
  it("leaves out words whose only entries are proper nouns", () => {
    expect(packs.vocab).not.toContain("brasil");
    expect(packs.defs).not.toHaveProperty("brasil");
    expect(packs.ipa).not.toHaveProperty("brasil");
  });
  it("defines no forms and no words outside the vocabulary", () => {
    expect(packs.defs).not.toHaveProperty("casas");
    expect(packs.defs).not.toHaveProperty("zapato");
  });
  it("makes every multi-word entry of vocabulary words, forms and slots a pattern, whatever their ranks (B1)", () => {
    // Without examples nothing is detected: the score needs the example corpus.
    expect(packs.phrases.detect).toEqual([]);
    expect(packs.phrases.more).toEqual([
      "de la",
      "de la casa",
      "de pelos",
      "tomar el pelo",
      "tomar el pelo a alguien",
    ]);
    expect(packs.defs["tomar el pelo"]).toEqual([
      "to pull someone's leg",
      [["verb", "to pull someone's leg; to tease"]],
    ]);
    expect(packs.defs["de pelos"]?.[0]).toBe("great, awesome");
  });
  it("leaves out non-constituents and entries with a word outside the vocabulary", () => {
    expect(packs.defs).not.toHaveProperty("comer la casa");
    expect(packs.defs).not.toHaveProperty("tomar el zapato");
  });
  it("gives the patterns their parts of speech and no gaps", () => {
    expect(packs.phrases.pos?.more).toBe("h h h v v");
    expect(packs.phrases.gap).toEqual([]);
  });
  it("merges phrase entries that differ only in case", () => {
    expect(packs.defs["de la casa"]?.[1]).toEqual([
      ["phrase", "on the house (free of charge)"],
      ["phrase", "of the House (parliament)"],
    ]);
  });
  it("lists each vocabulary word's parts of speech with a meaning, in the source's order", () => {
    expect(packs.pos.comer).toEqual(["verb", "noun"]);
    // casa's verb entry only points to casar.
    expect(packs.pos.casa).toEqual(["noun"]);
    expect(packs.pos.de).toEqual(["preposition"]);
    expect(Object.keys(packs.pos).sort()).toEqual(packs.vocab);
  });
  it("orders a form's bases and a word's parts of speech by the treebanks", async () => {
    const { lemmas, pos } = await buildEsPacks(fixture, forms, {
      ...options,
      treebank: counts({ "casas casar": 2 }, {}, { "comer NOUN": 5 }),
    });
    expect(lemmas.casas).toEqual(["casar", "casa"]);
    expect(pos.comer).toEqual(["noun", "verb"]);
  });
  it("gives a form the meaning its form-of senses gloss after their pointer", async () => {
    const { vocab, lemmas, defs, pos } = await buildEsPacks(fixture, ["les"]);
    expect(vocab).toEqual(["les", "ustedes"]);
    expect(lemmas.les).toBe("ustedes");
    // The obsolete sense gives none; the multi-word target is no base.
    expect(defs.les).toEqual([
      "to them, for them",
      [
        ["pronoun", "to them, for them; dative of ellos and ellas"],
        ["pronoun", "to you all; dative of ustedes"],
        ["article", "the (plural)"],
      ],
    ]);
    expect(pos.les).toEqual(["pronoun", "article"]);
  });
  it("counts what it built", () => {
    expect(packs.stats).toMatchObject({
      unparsable: 0,
      forms: forms.length,
      vocab: 11,
      lemmas: 7,
      moreForms: 1,
      moreWords: 0,
      ipa: 10,
      detect: 0,
      more: 5,
      terms: 16,
    });
  });
});

describe("buildEsPacks: alt-of senses, head-line labels, every form", () => {
  const vocabularyFixture = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-es-vocabulary.jsonl",
  );
  // "tu", "tuyo", "quizá", "solo", "guion", "cuéntales" and "ajá" are not listed;
  // "maguer" is listed beyond the words in current use (headRank).
  const listed = [
    ...["muy", "mucho", "tus", "buen", "quizás", "sólo", "guión", "eso"],
    ...["al", "a", "os", "vosotros", "fin", "vos", "contar", "ajar", "amiga"],
    "maguer",
  ];
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(vocabularyFixture, listed, {
      headRank: listed.length - 1,
    });
  });
  const senses = (word: string) => packs.defs[word]?.[1];

  it("gives an alt-of sense the meaning after its pointer, and its target as a base", () => {
    expect(senses("muy")).toEqual([["adverb", "very; apocopic form of mucho"]]);
    expect(packs.defs.muy?.[0]).toBe("very");
    expect(packs.lemmas.muy).toBe("mucho");
  });
  it("reads a meaning after a comma that follows a one-word target", () => {
    expect(senses("tu")).toEqual([
      ["determiner", "your; apocopic form of tuyo"],
    ]);
    expect(senses("amiga")).toEqual([
      ["noun", "friend; female equivalent of amigo"],
    ]);
  });
  it("follows a base's own bases into the vocabulary", () => {
    // tus → tu (not listed) → tuyo (not listed).
    expect(packs.lemmas.tus).toBe("tu");
    expect(packs.lemmas.tu).toBe("tuyo");
    expect(packs.vocab).toEqual(expect.arrayContaining(["tu", "tuyo"]));
  });
  it("takes the quoted gloss of an alt-of sense's target as its meaning", () => {
    expect(senses("buen")).toEqual([
      ["adjective", "good, fine; apocopic form of bueno"],
    ]);
  });
  it("gives an alt-of sense that only points its target's meaning of the same part of speech", () => {
    expect(senses("quizás")).toEqual([
      ["adverb", "perhaps, maybe; alternative form of quizá"],
    ]);
    // solo is an adjective ("alone") first; sólo is the adverb.
    expect(senses("sólo")).toEqual([
      ["adverb", "only; solely; superseded spelling of solo"],
    ]);
    // A clause about the pointer is no meaning.
    expect(senses("guión")).toEqual([
      ["noun", "script; superseded spelling of guion, deprecated in 2010"],
    ]);
  });
  it("gives no base from an acronym of a longer term or a contraction of two words", () => {
    expect(senses("eso")).toEqual([
      ["pronoun", "that; neuter singular of ése"],
    ]);
    // A contraction's literal meaning is its meaning, and it points to no base.
    expect(senses("al")).toEqual([
      ["contraction", "at the, to the; contraction of a + el"],
      ["contraction", "upon"],
    ]);
    expect(packs.lemmas).not.toHaveProperty("al");
  });
  it("keeps a word that is an inflected form a form: no alt-of senses or bases", () => {
    expect(senses("os")).toEqual([
      ["pronoun", "you, to you, for you; dative and accusative of vosotros"],
    ]);
    expect(packs.lemmas.os).toBe("vosotros");
    expect(packs.vocab).not.toContain("ox");
  });
  it("ignores a register label every sense carries for a word in current use", () => {
    expect(senses("fin")).toEqual([
      ["noun", "end"],
      ["noun", "purpose"],
    ]);
    expect(senses("vosotros")).toEqual([["pronoun", "you, you guys"]]);
    // A word beyond the ones in current use keeps it.
    expect(packs.vocab).not.toContain("maguer");
  });
  it("keeps a register label that a sense's gloss writes", () => {
    expect(senses("vos")).toEqual([["pronoun", "you"]]);
  });
  it("maps every form of a vocabulary word, and makes one with its own meaning a vocabulary word", () => {
    expect(packs.lemmas["cuéntales"]).toBe("contar");
    expect(packs.vocab).not.toContain("cuéntales");
    expect(packs.lemmas["ajá"]).toBe("ajar");
    expect(senses("ajá")).toEqual([["interjection", "aha"]]);
    expect(packs.stats).toMatchObject({ moreForms: 2, moreWords: 1 });
  });
});

describe("withoutHeadLabels", () => {
  const entry = (...tags: string[][]) => ({
    word: "x",
    senses: tags.map((t, i) => ({ glosses: [`sense ${i}`], tags: t })),
  });
  it("takes off a register label every sense carries", () => {
    expect(
      withoutHeadLabels(entry(["archaic", "noun"], ["archaic"])).senses,
    ).toEqual([
      { glosses: ["sense 0"], tags: ["noun"] },
      { glosses: ["sense 1"], tags: [] },
    ]);
  });
  it("leaves a label only some senses carry", () => {
    const some = entry(["archaic"], ["noun"]);
    expect(withoutHeadLabels(some)).toBe(some);
  });
});

describe("altMeaning", () => {
  it("reads the meaning after the pointer, else the target's quoted gloss", () => {
    expect(altMeaning("apocopic form of mucho; very")).toBe(
      "very; apocopic form of mucho",
    );
    expect(altMeaning("abbreviation of también (“also”)")).toBe(
      "also; abbreviation of también",
    );
  });
  it("finds none in a gloss that only points", () => {
    expect(altMeaning("alternative form of quizá")).toBeUndefined();
    expect(altMeaning("apocopic form of primero (first)")).toBeUndefined();
  });
});

describe("pointerMeaning", () => {
  it("ends the pointer at a comma after a one-word target, unless a clause about it follows", () => {
    expect(pointerMeaning("apocopic form of tuyo, your")).toBe(
      "your; apocopic form of tuyo",
    );
    expect(
      pointerMeaning("superseded spelling of guion, deprecated in 2010"),
    ).toBeUndefined();
    expect(
      pointerMeaning("alternative form of madre, used in asu mare"),
    ).toBeUndefined();
  });
  it("reads commas before a semicolon as separating targets", () => {
    expect(
      pointerMeaning(
        "accusative of ella, ello (when the antecedent's implied gender is feminine), and usted; her, it, you (formal)",
      ),
    ).toBe(
      "her, it, you (formal); accusative of ella, ello (when the antecedent's implied gender is feminine), and usted",
    );
  });
  it("puts the meaning after a pointer first", () => {
    expect(pointerMeaning("dative of ellos and ellas; to them, for them")).toBe(
      "to them, for them; dative of ellos and ellas",
    );
    expect(pointerMeaning("female equivalent of chico: girl")).toBe(
      "girl; female equivalent of chico",
    );
    expect(
      pointerMeaning(
        "accusative of ustedes (when referring to more than one man); you all",
      ),
    ).toBe(
      "you all; accusative of ustedes (when referring to more than one man)",
    );
  });
  it("finds none in a gloss that only points, or in its target's quoted gloss", () => {
    expect(pointerMeaning("plural of casa")).toBeUndefined();
    expect(
      pointerMeaning(
        "first-person singular present indicative of colar (“to sift; to dupe”)",
      ),
    ).toBeUndefined();
    expect(pointerMeaning("inflection of aquellar:")).toBeUndefined();
    expect(pointerMeaning("to him; for him")).toBeUndefined();
  });
});

describe("byTreebank", () => {
  it("orders bases by how often the treebanks lemmatize the form so, then by the lemma's count", () => {
    expect(
      byTreebank("creo", ["crear", "creer"], counts({ "creo creer": 40 })),
    ).toEqual(["creer", "crear"]);
    expect(
      byTreebank("les", ["elles", "ustedes"], counts({}, { ustedes: 3 })),
    ).toEqual(["ustedes", "elles"]);
    expect(byTreebank("x", ["b", "a"], counts())).toEqual(["b", "a"]);
  });
});

describe("byTreebankTags", () => {
  it("puts the part of speech the treebanks tag the word with most often first", () => {
    const tags = counts({}, {}, { "la DET": 9, "la PRON": 2 });
    expect(byTreebankTags("la", ["noun", "pronoun", "article"], tags)).toEqual([
      "article",
      "pronoun",
      "noun",
    ]);
    expect(byTreebankTags("zzz", ["noun", "verb"], tags)).toEqual([
      "noun",
      "verb",
    ]);
  });
});

describe("partsOfSpeech", () => {
  const tags = counts({}, {}, { "una DET": 9, "una PRON": 2, "una VERB": 1 });
  it("adds the closed classes of a word's form-of senses that the treebanks tag it with", () => {
    expect(
      partsOfSpeech("una", ["pronoun"], ["article", "noun", "verb"], tags),
    ).toEqual(["article", "pronoun"]);
  });
  it("adds none the treebanks do not give, nor a content word's", () => {
    expect(partsOfSpeech("una", ["pronoun"], ["determiner"], counts())).toEqual(
      ["pronoun"],
    );
    expect(partsOfSpeech("una", ["pronoun"], ["verb"], tags)).toEqual([
      "pronoun",
    ]);
  });
});

describe("translationFirst", () => {
  it("puts a closed-class word's translation before the description of its grammar", () => {
    expect(translationFirst("feminine plural definite article; the")).toBe(
      "the; feminine plural definite article",
    );
    expect(
      translationFirst(
        "first-person singular pronoun in the nominative case; I",
      ),
    ).toBe("I; first-person singular pronoun in the nominative case");
    expect(
      translationFirst(
        "A reflexive or reciprocal pronoun: oneself, himself; themselves",
      ),
    ).toBe("oneself, himself; themselves; A reflexive or reciprocal pronoun");
  });
  it("leaves a gloss that starts with a translation or gives none", () => {
    for (const gloss of [
      "them; accusative of ellos",
      "you (second-person singular pronoun)",
      "plural masculine or neuter pronoun",
      "with",
    ])
      expect(translationFirst(gloss)).toBe(gloss);
  });
});

describe("quotedMeaning", () => {
  it("reads the quoted gloss of a pointer's target", () => {
    expect(quotedMeaning("masculine plural of el (“the”)")).toBe(
      "the; masculine plural of el",
    );
    expect(quotedMeaning("plural of casa")).toBeUndefined();
    // A note after the quote stays with the pointer.
    expect(
      quotedMeaning("plural of un (“some”, the plural indefinite article)"),
    ).toBe("some; plural of un (the plural indefinite article)");
  });
});

describe("buildEsPacks: closed-class meanings", () => {
  const phraseFixture = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-es-phrases.jsonl",
  );
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(
      phraseFixture,
      ["el", "los", "lo", "una", "un"],
      {
        treebank: counts({}, {}, { "una DET": 9, "una PRON": 2 }),
      },
    );
  });
  it("leads with the translation a closed-class gloss gives after its description", () => {
    expect(packs.defs.el).toEqual([
      "the",
      [["article", "the; masculine singular definite article"]],
    ]);
    expect(packs.defs.lo?.[1][1]).toEqual([
      "article",
      "the, that which is; neuter definite article used only before nominalized adjectives",
    ]);
  });
  it("gives a closed-class form its target's quoted gloss, and both classes", () => {
    expect(packs.defs.los).toEqual([
      "the",
      [
        ["article", "the; masculine plural of el"],
        ["pronoun", "them; accusative of ellos"],
      ],
    ]);
    expect(packs.pos.los).toEqual(["article", "pronoun"]);
    // "una" is only a form of un as an article: the treebanks' class, no meaning.
    expect(packs.defs.una).toEqual(["one", [["pronoun", "one"]]]);
    expect(packs.pos.una).toEqual(["article", "pronoun"]);
  });
});

describe("buildEsPacks: phrases with the Spanish settings (B1, B2, B2b, B4)", () => {
  const phraseFixture = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-es-phrases.jsonl",
  );
  // The Spanish edition's examples ("estamos de acuerdo"), and an English entry's.
  const editionFixture = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-es-phrases-edition.jsonl",
  );
  const phraseForms = [
    ...["de", "la", "el", "que", "a", "lo", "los", "por", "ya", "una", "un"],
    ...["estar", "estamos", "casa", "vez", "veces", "tomar", "pelo", "gato"],
    ...["acuerdo", "supuesto", "través", "alguien"],
  ];
  // The fixture's gloss vocabulary is small: its few most frequent tokens are its
  // stopwords.
  const stopwords = { gloss: 4, function: 2 };
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(phraseFixture, phraseForms, {
      casePaths: [editionFixture],
      phraseScoring: { stopwords },
    });
  });
  const verdicts = async (
    change: Partial<PhraseBuildLanguage> = {},
    examples = [phraseFixture, editionFixture],
  ) =>
    (
      await importPhrases(phraseFixture, {
        vocab: packs.vocab,
        lemmas: packs.lemmas,
        dict: {},
        build: { ...spanishPhraseBuild(packs.pos, packs.lemmas), ...change },
        examples,
        stopwords,
      })
    ).verdicts;

  it("detects patterns of accented words by their score over the example corpus", () => {
    expect(packs.phrases.detect).toEqual([
      "a través de",
      "por supuesto",
      "ya que",
    ]);
    expect(packs.defs["a través de"]).toEqual([
      "through, across",
      [["prepositional phrase", "through, across"]],
    ]);
    expect(packs.phrases.pos?.detect).toBe("P r c");
  });
  it("keeps patterns with a Spanish slot or starting with an auxiliary for selections", () => {
    expect(packs.phrases.more).toContain("tomar el pelo a alguien");
    expect(packs.phrases.more).toContain("estar de acuerdo");
  });
  it("detects no pattern of closed-class words only, whatever its score", async () => {
    expect(packs.phrases.more).toContain("lo que");
    const without = await verdicts({ closedClass: undefined });
    expect(without.find((v) => v.key === "lo que")?.detect).toBe(true);
  });
  it("reads a word's first 3 senses for the gloss bag", async () => {
    // "ya": already, now, right away, since, finally.
    // Its sense "since, because" against its words' bags.
    const overlap = (found: PatternVerdict[]) => {
      const { evidence } = found.find((v) => v.key === "ya que")!;
      return evidence.overlap(evidence.senses[0]!);
    };
    expect(overlap(await verdicts())).toBe(0);
    expect(overlap(await verdicts({ wordSenses: 12 }))).toBe(0.5);
    // A function word's bag holds only the senses a hover shows first.
    expect(
      overlap(
        await verdicts({
          wordSenses: 12,
          functionWord: (word) => word === "ya",
          functionWordSenses: 3,
        }),
      ),
    ).toBe(0);
  });
  it("counts the Spanish examples of both editions", async () => {
    const count = (found: PatternVerdict[], key: string) =>
      found.find((v) => v.key === key)!.evidence.count;
    const both = await verdicts();
    const one = await verdicts({}, [phraseFixture]);
    expect(count(both, "estar de acuerdo")).toBe(1);
    expect(count(one, "estar de acuerdo")).toBe(0);
    // The edition's English entry does not count.
    expect(count(both, "por supuesto")).toBe(3);
  });
  it("leaves out unattested nouns and entries with a word outside the vocabulary", () => {
    expect(packs.defs).not.toHaveProperty("gato de la casa");
    expect(packs.defs).not.toHaveProperty("de vez en cuando");
  });
});

describe("the names lexicon (rule D)", () => {
  const namesFixture = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-es-names.jsonl",
  );
  const edition = join(
    import.meta.dirname,
    "fixtures",
    "kaikki-es-edition-names.jsonl",
  );
  const nameForms = ["chile", "marina", "argentino", "argentina", "sosa"];
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(namesFixture, nameForms, {
      casePaths: [edition],
    });
  });

  it("lists proper names that are vocabulary words, their forms or given names, with their kinds", () => {
    expect(packs.names).toEqual({
      argentina: "p",
      carlos: "g",
      chile: "pc",
      marina: "g",
      sosa: "s",
    });
  });
  it("leaves out a name that is neither a vocabulary word, a form nor a given name", () => {
    expect(packs.names).not.toHaveProperty("acapulco");
    expect(packs.vocab).not.toContain("acapulco");
  });
  it("marks a name the examples write capitalised inside sentences at least twice as often as in lower case", async () => {
    // Chile: "a Chile", "de Chile" twice in the Spanish edition; "el chile" once.
    // Sentence starts ("Chile es…", ". Marina") and the English entry's examples
    // do not count.
    const alone = await buildEsPacks(namesFixture, nameForms);
    expect(alone.names.chile).toBe("p");
    expect(packs.names.chile).toBe("pc");
    // Argentina: capitalised 3 times, in lower case twice.
    expect(packs.names.argentina).toBe("p");
  });
});

describe("writeEsPacks", () => {
  let dir: string;
  let written: string[];
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "langle-es-"));
    written = writeEsPacks(await buildEsPacks(fixture, forms, options), dir);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function filesUnder(path: string): string[] {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(join(path, entry.name))
        : [relative(dir, join(path, entry.name)).split(sep).join("/")],
    );
  }

  it("writes only under es/ and es-en/", () => {
    expect(filesUnder(dir).sort()).toEqual([
      "es-en/dict-1.json",
      "es-en/index.json",
      "es/freq.json",
      "es/ipa.json",
      "es/lemmas/dict-1.json",
      "es/lemmas/index.json",
      "es/names.json",
      "es/phrases.json",
      "es/pos.json",
      "es/vocab.json",
    ]);
    expect([...written].sort()).toEqual(filesUnder(dir).sort());
  });
  it("writes the phrase patterns as lists, one pattern per line", () => {
    expect(readFileSync(join(dir, "es", "phrases.json"), "utf8")).toBe(
      '{\n"detect":[],\n"gap":[],\n"intransitive":[],\n"more":[\n"de la",\n' +
        '"de la casa",\n"de pelos",\n"tomar el pelo",\n"tomar el pelo a alguien"\n],\n' +
        '"pos":{\n"detect":"",\n"more":"h h h v v"\n}\n}\n',
    );
  });
  it("shards the lemma table with an index, as a dictionary", () => {
    const index = JSON.parse(
      readFileSync(join(dir, "es", "lemmas", "index.json"), "utf8"),
    );
    expect(index).toEqual({
      shards: [{ file: "dict-1.json", first: "casa", last: "pelos" }],
    });
    expect(
      JSON.parse(readFileSync(join(dir, "es", "lemmas", "dict-1.json"), "utf8"))
        .comemos,
    ).toBe("comer");
  });
  it("shards the dictionary with an index", () => {
    const index = JSON.parse(
      readFileSync(join(dir, "es-en", "index.json"), "utf8"),
    );
    expect(index).toEqual({
      shards: [
        { file: "dict-1.json", first: "a", last: "tomar el pelo a alguien" },
      ],
    });
  });
});
