// Smoke test of the classifier over the generated pack files (data/packs/).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packSourcePath } from "../../scripts/data/formats.ts";
import { createClassifier, unsavedKeys, type TermIndex } from "./classify";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
  type DictionaryProvider,
} from "./lexicon/dictionary";
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

  it("detects by meaning, not by the words' ranks: discourse markers and idioms of common words", () => {
    const text =
      "You know, I kind of want it. Of course it makes sense. Thank you.";
    const spans = classifier.classify(pack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
    });
    expect(spans.filter((s) => s.kind === "phrase").map((s) => s.key)).toEqual([
      "you know",
      "kind of",
      "of course",
      "make sense",
      "thank you",
    ]);
  });

  it("leaves transparent compounds, named entities and literal pairs to selections", () => {
    const text = "A digital signature from New York. In the world of art.";
    const spans = classifier.classify(pack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
    });
    expect(spans.filter((s) => s.kind === "phrase")).toEqual([]);
    for (const key of ["digital signature", "new york", "in the world"])
      expect(pack.patterns.more).toContain(key);
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
  it("reads a capitalised abbreviation as the word it stands for, not as a word Wiktionary adds (rule E)", () => {
    const text = [
      "Published On 12 Nov 2026",
      "The vote was held on Nov 3, and the count ended on Mon after a recount.",
    ];
    const doc = documentCasing(
      text.map((t) => blockCasing(withNames.tokenize(t), "en")),
    );
    const nov = text.flatMap((t) =>
      names
        .classify(withNames.tokenize(t), {
          terms: new Map(),
          knownLevel: 3000,
          casing: doc,
          capitalMeaning: (key) => dictionary.capitalMeaning(key),
        })
        .filter((s) => t.slice(s.start, s.end) === "Nov"),
    );
    expect(nov.map((s) => [s.key, s.name, s.capital])).toEqual([
      ["nov", undefined, true],
      ["nov", undefined, true],
    ]);
    // "nov" (a clipping of novice) joined the vocabulary with rule E.
    expect(dictionary.entry("nov", "capital")?.lines[0]).toMatch(/^11月/);
    expect(dictionary.entry("mon", "capital")?.lines[0]).toMatch(/^月曜日/);
    expect(dictionary.entry("dec", "capital")?.lines[0]).toMatch(/^12月/);
    expect(dictionary.entry("nov", "lower")?.glossLang).toBe("en");
    // A word EJDict has keeps its own meaning: "the Sun" is no Sunday.
    expect(dictionary.entry("sun", "capital")?.lines[0]).toMatch(/太陽/);
  });
  it("reads capital-only words, dotted abbreviations and contractions as words", () => {
    const withCapitals = createLanguagePack("en", {
      lemmas: en.lemmas,
      freq: en.freq,
      ipa: en.ipa,
      vocab: new Set(en.vocab),
      patterns: en.phrases,
      pos: en.pos,
      names: en.names,
      contractions: en.contractions,
      capitals: en.capitals,
    });
    const text = [
      "Experts in Tokyo say AI will change how the U.S. works, and what'd you do?",
      "The sloth was an ai, and Harvey met Kane at 5 p.m. in Tokyo.",
    ];
    const doc = documentCasing(
      text.map((t) => blockCasing(withCapitals.tokenize(t), "en")),
    );
    const spans = text.flatMap((t) =>
      createClassifier(withCapitals)
        .classify(withCapitals.tokenize(t), {
          terms: new Map(),
          knownLevel: 3000,
          casing: doc,
          capitalMeaning: (key) => dictionary.capitalMeaning(key),
        })
        .map((s) => ({ ...s, text: t.slice(s.start, s.end) })),
    );
    const keyOf = (word: string) =>
      spans
        .filter((s) => s.text === word)
        .map((s) => (s.category === "ignored" ? null : s.key));
    expect(keyOf("Tokyo")).toEqual(["tokyo", "tokyo"]);
    expect(keyOf("AI")).toEqual(["ai"]);
    expect(keyOf("U.S")).toEqual(["u.s."]);
    expect(keyOf("p.m")).toEqual(["p.m."]);
    expect(keyOf("what'd")).toEqual(["what'd"]);
    // The sloth stays out, and persons stay names.
    expect(keyOf("ai")).toEqual([null]);
    expect(keyOf("Harvey")).toEqual([null]);
    expect(keyOf("Kane")).toEqual([null]);
    expect(dictionary.entry("ai", "upper")?.lines[0]).toBe("人工知能");
    expect(dictionary.entry("tokyo", "capital")?.lines[0]).toBe("東京");
    expect(dictionary.entry("p.m.")?.lines[0]).toMatch(/^午後/);
  });
  it("never takes an interjection, a word after a determiner or one written in lower case for a name", () => {
    expect(of("Yes")[0]?.name).toBeUndefined();
    expect(of("Enlightenment")[0]?.name).toBeUndefined();
    // "mark" is in lower case in the document: "Mark" is no name there.
    expect(of("Mark").every((s) => s.name === undefined)).toBe(true);
  });
  it("takes a common word Wiktionary adds for a name where the document capitalises it (rule E)", () => {
    const text = [
      "Um, Jake said the app was down.",
      "We waited for Jake, um, an hour.",
    ];
    const doc = documentCasing(
      text.map((t) => blockCasing(withNames.tokenize(t), "en")),
    );
    const spans = text.flatMap((t) =>
      names
        .classify(withNames.tokenize(t), {
          terms: new Map(),
          knownLevel: 3000,
          casing: doc,
          capitalMeaning: (key) => dictionary.capitalMeaning(key),
        })
        .map((s) => ({ ...s, text: t.slice(s.start, s.end) })),
    );
    const verdicts = (word: string) =>
      spans
        .filter((s) => s.text === word)
        .map((s) => (s.name ? "name" : s.category));
    // jake, a young male turkey, and a given name.
    expect(en.vocab).toContain("jake");
    expect(verdicts("Jake")).toEqual(["name", "name"]);
    // An interjection is never a name; it is common enough to be known.
    expect(verdicts("Um")).toEqual(["known"]);
    expect(verdicts("um")).toEqual(["known"]);
    expect(verdicts("app")).toEqual(["new"]);
  });
  it("reads a run of capitalised words as one name, titles and titled common nouns aside", () => {
    const text = [
      "I work for Harvey Specter at Pearson Specter Litt.",
      "Specter, you're fired. President Harvey visited the Kennedy Center.",
      "We sailed to the Persian Gulf.",
    ];
    const runs = documentCasing(
      text.map((t) => blockCasing(withNames.tokenize(t), "en")),
    );
    const spans = text.flatMap((t) =>
      names
        .classify(withNames.tokenize(t), {
          terms: new Map(),
          knownLevel: 3000,
          casing: runs,
          capitalMeaning: (key) => dictionary.capitalMeaning(key),
        })
        .map((s) => ({ ...s, text: t.slice(s.start, s.end) })),
    );
    const named = (word: string) =>
      spans.filter((s) => s.text === word).map((s) => s.name === true);
    expect(named("Specter")).toEqual([true, true, true]);
    // Harvey is no vocabulary word: no hover either way.
    expect(
      spans.filter((s) => s.text === "Harvey").map((s) => s.category),
    ).toEqual(["ignored", "ignored"]);
    expect(named("President")).toEqual([false]);
    expect(named("Center")).toEqual([false]);
    expect(named("Gulf")).toEqual([false]);
  });
});

const es = await loadPack("es");
const esEn = await loadPack("es-en");

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

  it("has no tagger without its model: words keep their keys and get no part of speech", () => {
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

describe("Spanish tags over the generated packs (rules A1 and A2)", () => {
  const tagged = createLanguagePack("es", {
    lemmas: es.lemmas,
    freq: es.freq,
    ipa: es.ipa,
    vocab: new Set(es.vocab),
    patterns: es.phrases,
    pos: es.pos,
    tagger: es.tagger,
  });
  const classifier = createClassifier(tagged);
  const dictionary = createDefsDictionary({
    defs: esEn.defs,
    ipa: es.ipa,
  });
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

  it("reads a preposition and a verb form, not the letters they also name", () => {
    expect(hover("La casa de mi madre es grande.", "de")).toMatchObject({
      key: "de",
      pos: "preposition",
    });
    expect(hover("La casa de mi madre es grande.", "de").lines[0]).toMatch(
      /^of\b/,
    );
    expect(hover("La casa de mi madre es grande.", "es").key).toBe("ser");
  });
  it("looks a form two verbs share up by the treebanks' likelier base", () => {
    expect(hover("Creo que tienes razón.", "Creo").key).toBe("creer");
    expect(hover("Siento frío.", "Siento").key).toBe("sentir");
    expect(hover("No podemos ir hoy.", "podemos").key).toBe("poder");
  });
  it("reads an article and a clitic as their own words, the translation first", () => {
    expect(hover("Los niños juegan en el parque.", "Los")).toMatchObject({
      key: "los",
      lines: ["the", "them", expect.stringMatching(/^you all\b/)],
    });
    for (const [text, word] of [
      ["Las casas son grandes.", "Las"],
      ["El perro come.", "El"],
      ["La casa es grande.", "La"],
    ])
      expect(hover(text!, word!).lines[0], word).toBe("the");
    expect(hover("Yo no lo sé.", "Yo").lines[0]).toBe("I");
    expect(hover("Les dije la verdad.", "Les")).toMatchObject({
      key: "les",
      pos: "pronoun",
    });
    expect(hover("Les dije la verdad.", "Les").lines[0]).toBe(
      "to them, for them",
    );
  });
  it("gives apocopic and archaic-labelled words their meanings, and every form its base", () => {
    expect(hover("Es muy grande.", "muy").lines[0]).toBe("very");
    expect(hover("Es tu casa.", "tu").lines[0]).toBe("your");
    expect(hover("Es un gran día.", "gran").lines[0]).toMatch(/^great\b/);
    expect(hover("Llegó el fin.", "fin").lines[0]).toBe("end");
    expect(hover("Os lo dije.", "Os")).toMatchObject({
      key: "os",
      lines: [expect.stringMatching(/^you\b/)],
    });
    expect(hover("Cuéntales la historia.", "Cuéntales").key).toBe("contar");
    expect(hover("Eso no me gusta.", "Eso").lines[0]).toBe("that");
  });
});

const fr = await loadPack("fr");
const frEn = await loadPack("fr-en");

describe("French tags over the generated packs (rules A1 and A2)", () => {
  const tagged = createLanguagePack("fr", {
    lemmas: fr.lemmas,
    freq: fr.freq,
    ipa: fr.ipa,
    vocab: new Set(fr.vocab),
    patterns: fr.phrases,
    pos: fr.pos,
    tagger: fr.tagger,
  });
  const classifier = createClassifier(tagged);
  const dictionary = createDefsDictionary({ defs: frEn.defs, ipa: fr.ipa });
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

  it("reads the forms of être and avoir as the verbs, not the nouns they also are", () => {
    expect(hover("Il est à Paris.", "est").key).toBe("être");
    expect(hover("Elle a été malade.", "été").key).toBe("être");
    expect(hover("Tu as un chien.", "as").key).toBe("avoir");
    expect(hover("Est-ce que tu viens ?", "Est").key).toBe("être");
    // After a determiner or preposition, the noun.
    expect(hover("Nous partons à la mer l'été.", "été").key).toBe("été");
  });
  it("reads pas with ne as the negation, and personne as nobody", () => {
    expect(hover("Je ne sais pas.", "pas")).toMatchObject({
      key: "pas",
      pos: "adverb",
    });
    expect(hover("Je ne connais personne.", "personne").lines[0]).toBe(
      "no one, nobody",
    );
  });
  it("highlights pronominal verbs and phrases with elided words, not an auxiliary's", () => {
    const phrases = (text: string) =>
      classifier
        .classify(tagged.tokenize(text), {
          terms: new Map(),
          knownLevel: 3000,
          outline: (key) => dictionary.outline(key),
        })
        .filter((s) => s.kind === "phrase")
        .map((s) => `${text.slice(s.start, s.end)} [${s.key}]`);
    expect(phrases("Je me suis rendu compte de tout.")).toEqual([
      "me [se rendre compte]",
      "rendu compte [se rendre compte]",
    ]);
    expect(phrases("Il a l'air content.")).toEqual(["a l'air [avoir l'air]"]);
    expect(phrases("Ça va ?")).toEqual(["Ça va [ça va]"]);
    expect(phrases("Ça va être difficile.")).toEqual([]);
  });
  it("reads a participle after avoir and a form of aller before an infinitive as their verbs", () => {
    expect(hover("Il a fait ses devoirs.", "fait").key).toBe("faire");
    expect(hover("Il a dit non.", "dit").key).toBe("dire");
    expect(hover("Il va pleuvoir demain.", "va").key).toBe("aller");
  });
});

describe("Spanish phrases over the generated packs", () => {
  const tagged = createLanguagePack("es", {
    lemmas: es.lemmas,
    freq: es.freq,
    ipa: es.ipa,
    vocab: new Set(es.vocab),
    patterns: es.phrases,
    pos: es.pos,
    tagger: es.tagger,
  });
  const classifier = createClassifier(tagged);
  const dictionary = createDefsDictionary({ defs: esEn.defs, ipa: es.ipa });
  const phrases = (text: string) =>
    classifier
      .classify(tagged.tokenize(text), {
        terms: new Map(),
        knownLevel: 3000,
        outline: (key) => dictionary.outline(key),
      })
      .filter((s) => s.kind === "phrase")
      .map((s) => s.key);

  it("highlights the expressions the B1/B2 build detects", () => {
    expect(phrases("Por supuesto que vamos a ir.")).toContain("por supuesto");
    expect(phrases("Lo vimos a través de la ventana.")).toContain(
      "a través de",
    );
    expect(phrases("Buenos días, señora, ¿cómo está?")).toContain(
      "buenos días",
    );
  });
  it("highlights no pattern of closed-class words only", () => {
    expect(es.phrases.more).toContain("lo que");
    expect(phrases("No sé lo que quiere.")).not.toContain("lo que");
  });
  it("matches a pronominal verb by its reflexive pronoun, before the verb or attached", () => {
    expect(phrases("Me di cuenta de que era tarde.")).toEqual(["darse cuenta"]);
    expect(phrases("Nos dimos cuenta de la verdad.")).toEqual(["darse cuenta"]);
    expect(phrases("Tardé mucho en darme cuenta.")).toContain("darse cuenta");
    expect(phrases("Le di cuenta de todo al jefe.")).toContain("dar cuenta de");
  });
  it("reads al and del as their preposition only at a pattern's end", () => {
    expect(phrases("Lo vimos a través del cristal.")).toContain("a través de");
    expect(phrases("La cocina está al fondo del pasillo.")).not.toContain(
      "a fondo",
    );
  });
  it("reads eso es before its complement as words", () => {
    expect(phrases("¡Eso es!")).toEqual(["eso es"]);
    expect(phrases("Eso es lo que quiero.")).not.toContain("eso es");
  });
  it("reads a word in capitals by its one accented spelling", () => {
    const text = "LOS NIÑOS ESTAN EN LA CASA SEGUN LA POLICIA";
    const keys = classifier
      .classify(tagged.tokenize(text), {
        terms: new Map(),
        knownLevel: 3000,
        casing: { mode: "upper", words: {} },
        outline: (key) => dictionary.outline(key),
      })
      .map((s) => `${text.slice(s.start, s.end)}:${s.key}`);
    expect(keys).toEqual(
      expect.arrayContaining(["ESTAN:estar", "SEGUN:según", "POLICIA:policía"]),
    );
  });
});

describe("Spanish names over the generated packs (rule D)", () => {
  const withNames = createLanguagePack("es", {
    lemmas: es.lemmas,
    freq: es.freq,
    ipa: es.ipa,
    vocab: new Set(es.vocab),
    patterns: es.phrases,
    pos: es.pos,
    names: es.names,
    tagger: es.tagger,
  });
  const classifier = createClassifier(withNames);
  const dictionary = createDefsDictionary({ defs: esEn.defs, ipa: es.ipa });
  /** Each word of `blocks` (one document) as "Word:name", "Word:<key>". */
  const read = (...blocks: string[]) => {
    const casing = documentCasing(
      blocks.map((b) => blockCasing(withNames.tokenize(b), "es")),
    );
    return blocks.flatMap((block) =>
      classifier
        .classify(withNames.tokenize(block), {
          terms: new Map(),
          knownLevel: 3000,
          casing,
          capitalMeaning: (key) => dictionary.capitalMeaning(key),
          outline: (key) => dictionary.outline(key),
        })
        .filter((s) => s.kind === "word")
        .map((s) => {
          const text = block.slice(s.start, s.end);
          return `${text}:${s.name ? "name" : s.key}`;
        }),
    );
  };

  it("ignores names the lexicon has, also those a case-folded list ranks as common words", () => {
    const words = read(
      "Ayer Marina viajó a Chile y luego a Japón con Mercedes Sosa.",
      "En Chile, Marina comió en casa de Rosa.",
    );
    for (const name of ["Marina", "Chile", "Japón", "Mercedes", "Sosa", "Rosa"])
      expect(words, name).toContain(`${name}:name`);
    expect(words).not.toContain("Ayer:name");
    expect(es.names.chile).toMatch(/c/);
  });
  it("takes a capitalised form that only a rare or foreign reading explains for a name, and keeps a common word's", () => {
    const words = read(
      "El libro What Caesar Did For My Salad habla de comida.",
      "Lo dijo el fisiólogo Stephen Hales, y viajó a Estados Unidos.",
    );
    expect(words).toContain("Salad:name");
    expect(words).toContain("Hales:name");
    expect(words).toContain("Estados:estado");
  });
  it("reads an article before a capitalised word as a determiner", () => {
    expect(withNames.partsOfSpeech("los")[0]).toBe("article");
    expect(
      read("El Semanario de Agricultura y Artes Dirigido a los Párrocos."),
    ).toContain("Párrocos:párroco");
  });
  it("keeps a chili pepper in lower case and a capitalised turn start in speech recognition", () => {
    expect(read("Me gusta el chile con limón.")).toContain("chile:chile");
    // YouTube's Spanish speech recognition: no commas, turn starts capitalised.
    const turns = Array.from(
      { length: 8 },
      (_, i) =>
        `y bueno ahí vamos ${["Entonces", "Yo"][i % 2]} creo que la comida está muy rica`,
    ).join(" ");
    const words = read(turns);
    expect(words).toContain("Entonces:entonces");
    expect(words).toContain("Yo:yo");
    expect(words.filter((w) => w.endsWith(":name"))).toEqual([]);
  });
  it("matches no phrase over a name: al Chile is no `al chile`", () => {
    expect(es.phrases.detect).toContain("al chile");
    expect(
      read(
        "Chile es un país inventado, porque recuerdo al Chile que ya no es.",
      ),
    ).toEqual(expect.arrayContaining(["Chile:name", "al:al"]));
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
  const hover = (
    text: string,
    word: string,
    over: DictionaryProvider = dictionary,
  ) => {
    const span = classifier
      .classify(tagged.tokenize(text), {
        terms: new Map(),
        knownLevel: 3000,
        outline: (key) => over.outline(key),
      })
      .find((s) => text.slice(s.start, s.end) === word)!;
    return {
      key: span.key,
      pos: span.pos,
      lines: over.entry(span.key, undefined, span.pos)?.lines ?? [],
    };
  };

  it("reads what a contraction's clitic stands for from the trained tagger (K4)", () => {
    const clitic = (text: string, word: string) =>
      classifier
        .classify(tagged.tokenize(text), {
          terms: new Map(),
          knownLevel: 3000,
          outline: (key) => dictionary.outline(key),
        })
        .find((s) => text.slice(s.start, s.end) === word)?.clitic;
    expect(clitic("He's been here before.", "He's")).toBe("has");
    expect(clitic("He's going home now.", "He's")).toBe("is");
    expect(clitic("It's a good idea.", "It's")).toBe("is");
    expect(clitic("If I'd known, I would have come.", "I'd")).toBe("had");
    expect(clitic("I'd go with you.", "I'd")).toBe("would");
    expect(clitic("How'd you find it?", "How'd")).toBeUndefined();
  });
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
    expect(has.pos).toBe("auxiliary");
    expect(has.lines[0]).toMatch(/^haveの/);
    expect(hover("She has spent all her money.", "spent").key).toBe("spend");
    expect(hover("The house is being built.", "being").key).toBe("be");
  });
  it("reads a pair's edition forms as pointers, and looks a form it lacks up by its base", async () => {
    const pair = async (name: "en-es" | "en-pt") =>
      createPairDictionary({
        dict: (await loadPack(name)).dict,
        defs: defs.defs,
        ipa: en.ipa,
      });
    const enEs = await pair("en-es");
    const enPt = await pair("en-pt");
    // The editions' forms are pointers: told shows tell's verb, then its grammar.
    expect(enEs.outline("told")?.formOf).toBe("tell");
    const told = hover("She told me the truth.", "told", enEs);
    expect(told).toMatchObject({ key: "told", pos: "verb" });
    expect(told.lines[1]).toBe("pasado simple del verbo tell");
    expect(told.lines).toContain("contar");
    expect(hover("She told me the truth.", "told").key).toBe("told");
    // An auxiliary keeps its pointer however wide; a main verb, wider than the cap,
    // shows its base's meanings.
    const has = hover("She has spent all her money.", "has", enEs);
    expect(has).toMatchObject({ key: "has", pos: "auxiliary" });
    expect(has.lines[0]).toMatch(/^tercera persona .* de have$/);
    expect(has.lines[1]).toBe("tener");
    expect(hover("She has a dog.", "has", enEs).lines[0]).toBe("tener");
    // Be keeps its meaning as an auxiliary (U1-8): the copula's hover, not the
    // edition's whole pointer ("primera persona del singular del pasado simple … be").
    for (const [pair, sentence, word] of [
      [enEs, "It was built in 1990.", "was"],
      [enPt, "It was built in 1990.", "was"],
      [enEs, "They were running.", "were"],
    ] as const)
      expect(hover(sentence, word, pair)).toMatchObject({
        pos: "verb",
        lines: expect.arrayContaining(["ser", "estar"]),
      });
    expect(hover("Why did you go?", "did", enPt)).toMatchObject({
      key: "did",
      pos: "auxiliary",
      lines: ["passado simples do verbo do", "fazer", expect.any(String)],
    });
    // A form the pair lacks goes to its base (took has an entry since U1-7).
    expect(enPt.outline("abandons")).toBeUndefined();
    expect(hover("He abandons the bus.", "abandons", enPt)).toMatchObject({
      key: "abandon",
      pos: "verb",
    });
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

describe("phrase precision over the generated packs", () => {
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
  const spansOf = (text: string) =>
    classifier.classify(tagged.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
      outline: (key) => dictionary.outline(key),
    });
  /** The dictionary phrases highlighted in `text`, with a discourse marker's part of speech. */
  const phrases = (text: string) =>
    spansOf(text)
      .filter((s) => s.kind === "phrase")
      .map((s) => (s.pos ? `${s.key}/${s.pos}` : s.key));

  it("shows a discourse marker's interjection senses at a clause start (C1, C2)", () => {
    expect(phrases("You know, I like it.")).toEqual(["you know/interjection"]);
    expect(phrases("All right, let's go.")).toEqual(["all right/interjection"]);
    const plain = dictionary.entry("all right")!;
    const marker = dictionary.entry("all right", undefined, "interjection")!;
    expect(plain.senses[0]?.pos).toBe("adjective");
    expect(marker.lines[0]).not.toBe(plain.lines[0]);
    expect(marker.lines[0]).toBe(
      plain.lines[plain.senses.findIndex((s) => s.pos === "interjection")],
    );
  });
  it("shows a phrase's translation-table senses, the best first (C1)", () => {
    expect(dictionary.entry("break up")?.lines[0]).toMatch(/別れる/);
    expect(dictionary.entry("write down")?.lines[0]).toMatch(/書き留める/);
    expect(dictionary.entry("break up")?.senses[0]?.text).toMatch(/^《/);
  });

  it("has parts of speech for most patterns and transitivity for some phrasal verbs", () => {
    expect(tagged.phrasePos("give up")[0]).toBe("verb");
    expect(tagged.phrasePos("kind of")).toEqual(["adv"]);
    expect(tagged.phrasePos("to be honest")).toEqual(["phrase"]);
    expect(tagged.phrasePos("come on")).toEqual(["verb", "intj"]);
    expect(tagged.intransitive("act up")).toBe(true);
    expect(tagged.intransitive("give up")).toBe(false);
  });
  it("does not highlight a whole utterance (P1), which a selection still finds", () => {
    const text = "To be honest, I liked it.";
    expect(phrases(text)).toEqual([]);
    const input = tagged.matcher.prepare(tagged.tokenize(text));
    expect(tagged.matcher.matchSelection(input, 0, 3)?.key).toBe(
      "to be honest",
    );
  });
  it("highlights a verb and particle only where the particle is adverbial (P2)", () => {
    expect(phrases("She gave up.")).toEqual(["give up"]);
    expect(phrases("Let's find out.")).toEqual(["find out"]);
    expect(phrases("Do you think we can sneak out of here?")).toEqual([
      "sneak out",
    ]);
    expect(phrases("They talked about her plans.")).toEqual([]);
    expect(phrases("Fill in the form.")).toEqual([]);
  });
  it("classifies the words of a dropped phrase as words, with their tags", () => {
    const text = "They talked about her plans.";
    const words = spansOf(text).map((s) => [
      text.slice(s.start, s.end),
      s.kind,
      s.key,
    ]);
    expect(words).toContainEqual(["talked", "word", "talk"]);
    expect(words).toContainEqual(["about", "word", "about"]);
  });
  it("drops a verb and a particle that is only a preposition, read literally", () => {
    expect(
      phrases("I came to Tokyo. I'm going to live in Paris. Let's find out."),
    ).toEqual(["find out"]);
  });
  it("drops an adverb with a noun in it after a determiner", () => {
    expect(phrases("What kind of music do you like?")).toEqual([]);
    expect(phrases("I kind of want it.")).toEqual(["kind of"]);
  });
  it("drops a prepositional phrase inside a clause before a noun phrase", () => {
    expect(phrases("He is in general practice.")).toEqual([]);
    expect(phrases("I like dogs in general.")).toEqual(["in general"]);
    expect(phrases("Prices rose as a result of the storm.")).toEqual([
      "as a result",
    ]);
  });
  it("drops an interjection used as words of the sentence", () => {
    expect(phrases("It was a good day.")).toEqual([]);
    expect(phrases("We waited for so long.")).toEqual([]);
    expect(phrases("So long, everyone!")).toEqual(["so long/interjection"]);
  });
  it("drops a whole clause with its object inside a longer sentence", () => {
    expect(
      phrases("Why don't you tell me what's really going on here?"),
    ).toEqual([]);
    expect(phrases("You told me that you didn't want it.")).toEqual([]);
    expect(phrases("Where is he? You tell me!")).toEqual([
      "you tell me/interjection",
    ]);
  });
  it("drops an adverb ending in a preposition before a personal pronoun", () => {
    expect(
      phrases("This isn't just about you protecting your client's interests."),
    ).toEqual([]);
    expect(phrases("That's kind of you.")).toEqual([]);
    expect(phrases("I'm just about done.")).toEqual(["just about"]);
    expect(phrases("Just about everyone knows it.")).toEqual(["just about"]);
  });
  it("drops a verb phrase whose first word is a noun in a noun phrase, or a passive", () => {
    expect(phrases("Take that mask off.")).toEqual([]);
    expect(phrases("Why did your boyfriend break up with you?")).toEqual([
      "break up",
    ]);
    expect(phrases("It is yet to be passed up the chain of command.")).toEqual([
      "chain of command",
    ]);
    expect(phrases("He passed up the chance.")).toEqual(["pass up"]);
  });
  it("gives a discourse marker at a clause start its interjection senses", () => {
    expect(phrases("Shut up, this has nothing to do with you.")).toEqual([
      "shut up/interjection",
    ]);
    const [span] = spansOf("Come along, children.");
    expect(span).toMatchObject({ key: "come along", pos: "interjection" });
    expect(dictionary.entry("come along")?.lines[0]).toMatch(/accompany/i);
    expect(
      dictionary.entry("come along", undefined, span!.pos)?.lines[0],
    ).toMatch(/encouragement/i);
  });
});
