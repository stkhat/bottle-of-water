// Smoke test over the generated pack files in data/packs/
// (npm run data:build, npm run data:es, npm run data:fr), read through the real pack loader.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { byCodeUnit } from "../../../scripts/data/common.ts";
import { packSourcePath } from "../../../scripts/data/formats.ts";
import { simplifiedConverter } from "../../../scripts/data/recipes/simplified.ts";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
} from "../lexicon/dictionary";
import { withContractions } from "../lexicon/contractions";
import { createLanguagePack } from "../lexicon/language-pack";
import { ipaFor } from "../lexicon/ipa";
import { lemmatize } from "../lexicon/lemmatize";
import { capitalKey, displayWidth } from "../lexicon/short-lines";
import { recipeNatives, type RecipeNative } from "../natives";
import { createPackLoader } from "./load";
import { lookup } from "../lexicon/lookup";
import type { DictPack, ShardIndex } from "./types";

const read = (path: string): unknown =>
  JSON.parse(readFileSync(packSourcePath(path), "utf8"));
const loadPack = createPackLoader(async (path) => read(path));

const {
  lemmas,
  ipa,
  pos,
  freq,
  vocab: vocabList,
  phrases,
  contractions,
} = await loadPack("en");
const { dict, phrases: jaPhrases, capital, sensePos } = await loadPack("en-ja");
const { defs } = await loadPack("en-defs");
const vocab = new Set(vocabList);

describe("generated dictionary shards", () => {
  const index = read("packs/en-ja/index.json") as ShardIndex;
  const shards = index.shards.map(
    (s) => read(`packs/en-ja/${s.file}`) as DictPack,
  );

  it("are listed in order with their first and last headwords", () => {
    expect(index.shards.length).toBeGreaterThan(1);
    index.shards.forEach((entry, i) => {
      const keys = Object.keys(shards[i]!).sort(byCodeUnit);
      expect(entry).toEqual({
        file: `dict-${i + 1}.json`,
        first: keys[0],
        last: keys.at(-1),
      });
      if (i > 0) expect(entry.first > index.shards[i - 1]!.last).toBe(true);
    });
  });
  it("hold every headword once", () => {
    const total = shards.reduce((n, s) => n + Object.keys(s).length, 0);
    expect(Object.keys(dict)).toHaveLength(total);
    expect(total).toBeGreaterThan(40000);
  });
});

describe("generated vocabulary", () => {
  it("has the dictionary's single-word headwords and Wiktionary's words in use, sorted", () => {
    const singleWords = Object.keys(dict).filter((key) => !key.includes(" "));
    expect(singleWords.filter((word) => !vocab.has(word))).toEqual([]);
    expect(vocabList).toEqual([...vocabList].sort(byCodeUnit));
    // Rule E: words EJDict lacks, or writes only in another form ("any more").
    for (const word of ["um", "wanna", "app", "website", "chemo", "anymore"])
      expect(vocab.has(word) && !Object.hasOwn(dict, word), word).toBe(true);
    // Not forms of other words, rare words or old spellings.
    for (const word of ["years", "based", "zyzzyva", "clepe"])
      expect(vocab.has(word), word).toBe(false);
  });
  it("ranks Wiktionary's words, from the frequency list or the example corpus", () => {
    const rank = (word: string) => freq.indexOf(word) + 1 || Infinity;
    // From the TV list, which had no vocabulary word for them.
    expect(rank("um")).toBeLessThan(3000);
    expect(rank("wanna")).toBeLessThan(3000);
    // Placed by the example corpus: words of the 2010s.
    expect(rank("selfie")).toBeLessThan(20000);
    expect(rank("chemo")).toBeLessThan(20000);
  });
  it("gives Wiktionary's words their English definitions, to translate", () => {
    const dictionary = createEnJaDictionary({
      dict,
      phrases: jaPhrases,
      capital,
      sensePos,
      defs,
      pos,
      ipa,
    });
    for (const word of ["um", "wanna", "app", "website", "chemo", "anymore"])
      expect(dictionary.entry(word), word).toMatchObject({
        glossLang: "en",
        short: expect.any(String),
      });
    expect(dictionary.entry("app")?.short).toMatch(/program|application/i);
  });
});

describe("generated packs", () => {
  it("lemmatize inflected forms", () => {
    expect(lemmatize("ferments", lemmas, vocab)).toContain("ferment");
    expect(lemmatize("loaves", lemmas, vocab)).toContain("loaf");
    expect(lemmatize("Fermented", lemmas, vocab)).toContain("ferment");
  });
  it("map vocabulary forms only to confirmed bases", () => {
    expect(lemmatize("is", lemmas, vocab)).toEqual(["is", "be"]);
    expect(lemmatize("does", lemmas, vocab)).toEqual(["does", "do"]);
    expect(lemmatize("has", lemmas, vocab)).toEqual(["has", "have"]);
    expect(lemmatize("this", lemmas, vocab)).toEqual(["this"]);
    expect(lemmatize("news", lemmas, vocab)).toEqual(["news"]);
    expect(lemmatize("better", lemmas, vocab)).toEqual([
      "better",
      "good",
      "well",
    ]);
  });
  it("have the US IPA of dough", () => {
    expect(ipaFor("dough", ipa)).toBe("/doʊ/");
  });
  it("have English → Japanese entries for words and multi-word headwords", () => {
    expect(lookup("dough", dict, pos)?.short).toBe("練り粉,こね粉,生パン");
    expect(lookup("figure of speech", dict, pos)).toBeDefined();
  });
  it("label senses with parts of speech", () => {
    const labels = (word: string) =>
      lookup(word, dict, pos, sensePos)?.senses.map((s) => s.pos);
    expect(labels("ferment")).toEqual(expect.arrayContaining(["noun", "verb"]));
    // fine: 罰金 (a noun), 〈人〉に罰金を科する (a verb), 『りっぱな』 (an adjective) …
    expect(labels("fine")?.slice(0, 3)).toEqual(["noun", "verb", "adjective"]);
    expect(labels("including")).toEqual(["preposition"]);
  });
  it("label most senses of words with several parts of speech", () => {
    let senses = 0;
    let labelled = 0;
    for (const key of Object.keys(dict))
      if ((pos[key]?.length ?? 0) > 1)
        for (const sense of lookup(key, dict, pos, sensePos)!.senses) {
          senses++;
          if (sense.pos) labelled++;
        }
    expect(labelled / senses).toBeGreaterThan(0.8);
  });
  it("rank the most common words first", () => {
    const rank = (word: string) => freq.indexOf(word) + 1 || Infinity;
    expect(rank("the")).toBeLessThanOrEqual(5);
    expect(rank("you")).toBe(1);
    expect(freq.length).toBeGreaterThan(15000);
    expect(rank("thi")).toBeGreaterThan(5000);
  });
});

describe("generated phrases", () => {
  const dictionary = createEnJaDictionary({
    dict,
    phrases: jaPhrases,
    capital,
    sensePos,
    defs,
    pos,
    ipa,
  });

  const isSorted = (list: readonly string[]) =>
    list.every((key, i) => i === 0 || byCodeUnit(list[i - 1]!, key) < 0);

  it("detect dictionary phrases", () => {
    for (const phrase of ["from scratch", "figure out", "give up"])
      expect(phrases.detect).toContain(phrase);
  });

  it("detect phrases with an inflected word", () => {
    expect(phrases.detect).toContain("spill the beans");
  });

  it("keep patterns with a slot for selections only", () => {
    expect(phrases.more).toContain("make up one's mind");
    expect(phrases.more).toContain("pull someone's leg");
    expect(phrases.detect).not.toContain("make up one's mind");
  });

  it("flag phrasal verbs as patterns with a gap", () => {
    expect(phrases.gap).toContain("figure out");
    expect(phrases.gap).not.toContain("from scratch");
  });

  it("list each pattern once, sorted, with the gap ones among them", () => {
    expect(isSorted(phrases.detect)).toBe(true);
    expect(isSorted(phrases.more)).toBe(true);
    expect(isSorted(phrases.gap)).toBe(true);
    const detect = new Set(phrases.detect);
    expect(phrases.more.filter((key) => detect.has(key))).toEqual([]);
    const all = new Set([...phrases.detect, ...phrases.more]);
    expect(phrases.gap.filter((key) => !all.has(key))).toEqual([]);
  });

  it("have a meaning for each of those phrases", () => {
    for (const phrase of [
      "from scratch",
      "figure out",
      "give up",
      "spill the beans",
      "make up one's mind",
      "pull someone's leg",
    ])
      expect(dictionary.entry(phrase)?.short, phrase).toBeTruthy();
  });

  // Every pattern's lookup: about 2 s alone, past the default 5 s while the whole
  // suite runs on a busy machine.
  it("have a meaning for every pattern", () => {
    const missing = [...phrases.detect, ...phrases.more].filter(
      (phrase) => !dictionary.entry(phrase)?.short,
    );
    expect(missing).toEqual([]);
  }, 30_000);

  const lines = (term: string) => dictionary.entry(term)?.lines ?? [];

  it("give a capitalised word its capitalised senses first, and a lowercase one none", () => {
    expect(dictionary.entry("japan", "capital")?.lines[0]).toBe("日本");
    expect(dictionary.entry("japan", "lower")?.lines).not.toContain("日本");
    expect(dictionary.entry("china", "capital")?.lines[0]).toMatch(/^中国/);
    expect(dictionary.entry("china", "lower")?.lines[0]).toMatch(/^磁器/);
    expect(dictionary.entry("june", "capital")?.lines[0]).toMatch(/^6月/);
    expect(dictionary.entry("us", "upper")?.lines[0]).toMatch(/合衆国/);
    expect(dictionary.entry("oh", "lower")?.lines.join()).not.toMatch(/Ohio/);
    // The word list does not say how the word was written: every sense.
    expect(dictionary.entry("japan")?.lines).toContain("日本");
  });

  it("say which capitalised meanings a name keeps", () => {
    expect(dictionary.capitalMeaning("june")).toBe("word");
    expect(dictionary.capitalMeaning("france")).toBeDefined();
    expect(dictionary.capitalMeaning("mark")).toBeUndefined();
    expect(dictionary.capitalMeaning("frank")).toBeUndefined();
  });

  it("follow a form or a cross-reference to the word it names for the hover card", () => {
    const go = lines("go");
    // go's second meaning, "(ある事をしに)行く", says no more than its first.
    expect(lines("went")).toEqual(["goの過去", go[0]]);
    expect(lines("found")).toEqual([
      "findの過去・過去分詞",
      lines("find")[0],
      "…を創設する,設立する(establish)",
    ]);
    expect(lines("has")).toEqual([
      "haveの三人称単数現在",
      ...lines("have").slice(0, 2),
    ]);
    expect(lines("anyway")).toEqual(lines("anyhow"));
    // The dictionary window and word lists keep the entry's own short meaning.
    expect(dictionary.entry("went")?.short).toBe("goの過去");
  });

  it("give hover lines of one sense within 25 Japanese characters", () => {
    expect(lines("of")[0]).toBe("…の,…のものである,…に属する");
    expect(lines("so")[0]).toBe("そういうふうに,そのように");
    expect(lines("should")[0]).toBe(
      "すべきである,するのが当然である,しなくてはならない",
    );
    for (const term of ["went", "found", "anyway", "has", "of", "so", "should"])
      for (const line of lines(term))
        expect(displayWidth(line), line).toBeLessThanOrEqual(50);
  });

  it("take Japanese translations before English definitions", () => {
    expect(dictionary.entry("give up")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("from scratch")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("figure out")).toMatchObject({
      glossLang: "en",
      short: "To come to understand",
      ipa: expect.stringMatching(/^\/\S+ \S+\/$/),
    });
  });
});

const es = await loadPack("es");
const { defs: esEn } = await loadPack("es-en");

describe("generated Spanish pack and es-en dictionary", () => {
  const pack = createLanguagePack("es", {
    lemmas: es.lemmas,
    freq: es.freq,
    ipa: es.ipa,
    vocab: new Set(es.vocab),
    patterns: es.phrases,
  });
  const dictionary = createDefsDictionary({
    defs: esEn,
    ipa: es.ipa,
  });

  it("lemmatize inflected forms to their bases", () => {
    expect(pack.lemmas("comiendo")).toEqual(["comer"]);
    expect(pack.lemmas("casas")).toEqual(["casa", "casar"]);
  });

  it("lemmatize every kaikki form, from the lemma shards", () => {
    expect(es.lemmas.length).toBeGreaterThan(1);
    expect(pack.lemmas("cuéntales")).toEqual(["contar"]);
    expect(pack.lemmas("fijaos")).toEqual(["fijar"]);
    expect(pack.lemmas("debías")).toEqual(["deber"]);
    expect(pack.lemmas("suspira")).toEqual(["suspirar"]);
  });

  it("have English meanings with parts of speech", () => {
    expect(dictionary.entry("comer")).toMatchObject({
      head: "comer",
      kind: "word",
      short: "to eat",
    });
    expect(dictionary.entry("comer")?.senses[0]).toEqual({
      pos: "verb",
      text: "to eat",
    });
    expect(dictionary.entry("comer")).not.toHaveProperty("glossLang");
  });

  it("have the IPA of comer", () => {
    expect(pack.ipa("comer")).toBe("/koˈmeɾ/");
    expect(dictionary.entry("comer")?.ipa).toBe("/koˈmeɾ/");
  });

  it("rank common words first", () => {
    expect(pack.rank("de")).toBeLessThanOrEqual(5);
    expect(pack.rank("comer")).toBeLessThan(pack.rank("manzana"));
  });

  it("have a meaning for every phrase pattern", () => {
    expect(es.phrases.detect.length).toBeGreaterThan(0);
    for (const phrase of [...es.phrases.detect, ...es.phrases.more])
      expect(dictionary.entry(phrase)?.short, phrase).toBeTruthy();
  });

  it("keep patterns with a slot for selections only, without gaps", () => {
    expect(es.phrases.more).toContain("la pelota está en el tejado de alguien");
    expect(es.phrases.detect).not.toContain(
      "la pelota está en el tejado de alguien",
    );
    expect(es.phrases.gap).toEqual([]);
  });
});

const fr = await loadPack("fr");
const { defs: frEn } = await loadPack("fr-en");

describe("generated French pack and fr-en dictionary", () => {
  const pack = createLanguagePack("fr", {
    lemmas: fr.lemmas,
    freq: fr.freq,
    ipa: fr.ipa,
    vocab: new Set(fr.vocab),
    patterns: fr.phrases,
    pos: fr.pos,
    names: fr.names,
  });
  const dictionary = createDefsDictionary({ defs: frEn, ipa: fr.ipa });
  const words = (text: string) =>
    pack
      .tokenize(text)
      .filter((token) => token.isWord)
      .map((token) => token.text);

  it("lemmatize every kaikki form to its base, from the lemma shards", () => {
    expect(fr.lemmas.length).toBeGreaterThan(1);
    expect(pack.lemmas("mangeons")).toEqual(["manger"]);
    expect(pack.lemmas("chevaux")).toEqual(["cheval"]);
    // A form of a form: the plural of the participle appelé.
    expect(pack.lemmas("appelés")).toEqual(["appeler"]);
  });

  it("list a form's likelier base first, from the treebank", () => {
    expect(pack.lemmas("suis")[0]).toBe("être");
  });

  it("split elided words off, but keep a fixed expression whole", () => {
    expect(words("L'homme qu'il a vu")).toEqual([
      "L'",
      "homme",
      "qu'",
      "il",
      "a",
      "vu",
    ]);
    expect(words("D’accord, j'aime ça")).toEqual([
      "D’accord",
      "j'",
      "aime",
      "ça",
    ]);
    expect(pack.lemmas("l'")).toEqual(["l'", "le"]);
  });

  it("have English meanings, contractions' included", () => {
    expect(dictionary.entry("maison")).toMatchObject({
      kind: "word",
      short: "house",
    });
    expect(dictionary.entry("au")?.short).toBe("to the, for the, at the");
    expect(dictionary.entry("d'accord")?.short).toBeTruthy();
  });

  it("have the IPA of nearly every word, from either edition", () => {
    expect(pack.ipa("maison")).toMatch(/^\/m[ɛe]\.?zɔ̃\/$/);
    const top = fr.freq.slice(0, 5000);
    expect(top.filter((word) => pack.ipa(word)).length).toBeGreaterThan(4900);
  });

  it("rank common words first", () => {
    expect(pack.rank("de")).toBeLessThanOrEqual(5);
    expect(pack.rank("maison")).toBeLessThan(pack.rank("chaumière"));
  });

  it("spell a word capitals left without its accents", () => {
    expect(pack.accented("etre")).toBe("être");
    expect(pack.accented("deja")).toBe("déjà");
    // élèves and élevés are both known: left alone.
    expect(pack.accented("eleves")).toBeUndefined();
  });

  it("highlight phrases, and have a meaning for every one", () => {
    expect(fr.phrases.detect.length).toBeGreaterThan(3000);
    expect(fr.phrases.more.length).toBeGreaterThan(3000);
    for (const phrase of [...fr.phrases.detect, ...fr.phrases.more])
      expect(dictionary.entry(phrase)?.short, phrase).toBeTruthy();
  });

  it("have pronominal verbs from reflexive senses, and elided words inside patterns", () => {
    const all = new Set([...fr.phrases.detect, ...fr.phrases.more]);
    expect(all).toContain("se rendre compte");
    expect(all).toContain("avoir l'air");
    expect(fr.phrases.detect).toContain("avoir envie");
    expect(dictionary.entry("se rendre compte")?.short).toMatch(/realize/);
    expect(dictionary.entry("rendre compte")?.short).not.toMatch(/realize/);
  });

  it("read hyphenated compounds whole, and a verb with its pronoun in parts", () => {
    const words = (text: string) =>
      pack
        .tokenize(text)
        .filter((token) => token.isWord)
        .map((token) => token.text);
    expect(words("Peut-être, c'est-à-dire là-bas")).toEqual([
      "Peut-être",
      "c'est-à-dire",
      "là-bas",
    ]);
    expect(words("Qu'est-ce qu'il a-t-il dit")).toEqual([
      "Qu'",
      "est",
      "ce",
      "qu'",
      "il",
      "a",
      "t",
      "il",
      "dit",
    ]);
  });
});

const { dict: enEs } = await loadPack("en-es");

describe("generated en-es dictionary", () => {
  const dictionary = createPairDictionary({
    dict: enEs,
    defs,
    ipa,
  });
  const index = read("packs/en-es/index.json") as ShardIndex;

  it("names its sources, the Spanish Wiktionary first", () => {
    expect(index.sources).toEqual([
      "eswiktionary",
      "enwiktionary-translations",
    ]);
  });

  it("has Spanish meanings from the Spanish Wiktionary", () => {
    expect(dictionary.entry("light")).toMatchObject({
      head: "light",
      short: "luz",
      ipa: expect.any(String),
    });
    expect(dictionary.entry("light")).not.toHaveProperty("glossLang");
  });

  it("keeps the English sense as the hint of translation-table senses", () => {
    const fromTables = Object.entries(enEs).filter(
      ([, [, , source]]) =>
        index.sources?.[source] === "enwiktionary-translations",
    );
    expect(fromTables.length).toBeGreaterThan(10000);
    for (const [, [, senses]] of fromTables.slice(0, 100))
      for (const [, , hint] of senses) expect(hint).toBeTruthy();
    expect(enEs.tangy).toEqual([
      "acidulado",
      [["adjective", "acidulado, acídulo", "having a sharp, pungent flavor"]],
      index.sources!.indexOf("enwiktionary-translations"),
    ]);
  });

  it("falls back to English definitions for a term without a Spanish meaning", () => {
    const englishOnly = Object.keys(defs).find(
      (term) => !Object.hasOwn(enEs, term),
    );
    expect(englishOnly).toBeDefined();
    expect(dictionary.entry(englishOnly!)?.glossLang).toBe("en");
  });
});

// The pairs D2 added: Russian and German take English Wiktionary's translation tables
// first and their own Wiktionary for the rest; French takes its own first, as Spanish.
describe.each([
  {
    pack: "en-ru",
    sources: ["enwiktionary-translations", "ruwiktionary"],
    bread: "хлеб",
  },
  {
    pack: "en-fr",
    sources: ["frwiktionary", "enwiktionary-translations"],
    bread: "pain",
  },
  {
    pack: "en-de",
    sources: ["enwiktionary-translations", "dewiktionary"],
    bread: "Brot",
  },
] as const)("generated $pack dictionary", ({ pack, sources, bread }) => {
  const index = read(`packs/${pack}/index.json`) as ShardIndex;
  const load = loadPack(pack).then(({ dict }) => ({
    dict,
    dictionary: createPairDictionary({ dict, defs, ipa }),
  }));

  it("names its sources in the recipe's order", () => {
    expect(index.sources).toEqual(sources);
  });

  it("has native meanings without English definitions for common words", async () => {
    const { dictionary } = await load;
    expect(dictionary.entry("bread")).toMatchObject({ short: bread });
    for (const word of ["bread", "house", "money", "give up"])
      expect(dictionary.entry(word), word).not.toHaveProperty("glossLang");
  });

  it("takes terms from both sources and keeps every hover line within the cap", async () => {
    const { dict, dictionary } = await load;
    const bySource = [0, 0];
    for (const [, , source] of Object.values(dict)) bySource[source]!++;
    expect(bySource.every((n) => n > 1000)).toBe(true);
    for (const word of ["light", "go", "time", "people", "think"])
      for (const line of dictionary.entry(word)?.lines ?? [])
        expect(displayWidth(line), line).toBeLessThanOrEqual(50);
  });

  it("writes Russian without the stress marks Wiktionary adds for learners", async () => {
    const { dict } = await load;
    const marked = Object.entries(dict).filter(([, [, senses]]) =>
      senses.some(([, text]) =>
        /\p{Script=Cyrillic}[̀́]/u.test(text.normalize("NFD")),
      ),
    );
    expect(marked.length).toBeLessThan(5);
  });

  it("falls back to English definitions for a term without a native meaning", async () => {
    const { dict, dictionary } = await load;
    const englishOnly = Object.keys(defs).find(
      (term) => !Object.hasOwn(dict, term),
    );
    expect(dictionary.entry(englishOnly!)?.glossLang).toBe("en");
  });
});

// The pairs D3 added: Chinese and Italian take the translation tables first, then
// their own Wiktionary, then wordnets; Polish takes its own Wiktionary first.
describe.each([
  {
    pack: "en-zh",
    sources: ["enwiktionary-translations", "zhwiktionary", "omw-cmn"],
    bread: "面包",
  },
  {
    pack: "en-it",
    sources: ["enwiktionary-translations", "itwiktionary", "omw-it", "omw-iwn"],
    bread: "pane",
  },
  {
    pack: "en-pl",
    sources: ["plwiktionary", "enwiktionary-translations", "omw-pl"],
    bread: "chleb",
  },
] as const)("generated $pack dictionary", ({ pack, sources, bread }) => {
  const index = read(`packs/${pack}/index.json`) as ShardIndex;
  const load = loadPack(pack).then(({ dict }) => ({
    dict,
    dictionary: createPairDictionary({ dict, defs, ipa }),
  }));

  it("names its sources in the recipe's order and takes terms from each", async () => {
    expect(index.sources).toEqual(sources);
    const { dict } = await load;
    const bySource = sources.map(() => 0);
    for (const [, , source] of Object.values(dict)) bySource[source]!++;
    expect(bySource.every((n) => n > 500)).toBe(true);
  });

  it("has native meanings within the cap for common words", async () => {
    const { dictionary } = await load;
    expect(dictionary.entry("bread")).toMatchObject({ short: bread });
    for (const word of ["bread", "house", "money", "give up"])
      expect(dictionary.entry(word), word).not.toHaveProperty("glossLang");
    for (const word of ["light", "go", "time", "people", "think"])
      for (const line of dictionary.entry(word)?.lines ?? [])
        expect(displayWidth(line), line).toBeLessThanOrEqual(50);
  });

  it("keeps no page markup the extraction let into a gloss", async () => {
    const { dict } = await load;
    const marked = Object.values(dict).filter(([, senses]) =>
      senses.some(([, text]) => /={2,}|\n\s*[*#]/.test(text)),
    );
    expect(marked).toEqual([]);
  });
});

// Every recipe pair keeps its edition's forms as pointers (format 2).
describe.each(recipeNatives())("generated en-%s pointers", (native) => {
  const load = loadPack(`en-${native}`).then(({ dict }) => ({
    dict,
    dictionary: createPairDictionary({ dict, defs, ipa }),
  }));

  it("name a term as their target and are no meaning of their own", async () => {
    const { dict, dictionary } = await load;
    const pointers = Object.entries(dict).flatMap(([term, [, senses]]) =>
      senses.flatMap(([, , hint, target]) =>
        target === undefined ? [] : [{ term, hint, target }],
      ),
    );
    expect(pointers.length).toBeGreaterThan(40);
    for (const { term, hint, target } of pointers) {
      expect(hint, term).toBeNull();
      expect(target, term).toMatch(/^[a-z][a-z'-]*$/);
      expect(target, term).not.toBe(term);
    }
    const { term, target } = pointers.find(({ target }) =>
      Object.hasOwn(dict, target),
    )!;
    expect(dictionary.outline(term)?.pos).toBeDefined();
    expect(Object.hasOwn(dict, target)).toBe(true);
  });
});

// Every recipe pair keeps its capitalised headwords apart, with what they mean (format 3).
describe.each(recipeNatives())(
  "generated en-%s capitalised headwords",
  (native) => {
    const load = loadPack(`en-${native}`).then(({ dict }) => ({
      dict,
      dictionary: createPairDictionary({ dict, defs, ipa, native }),
    }));

    it("give months, weekdays and countries their native meaning", async () => {
      const { dictionary } = await load;
      for (const word of ["january", "thursday"]) {
        expect(dictionary.capitalMeaning(word), word).toBe("word");
        expect(dictionary.entry(word, "capital"), word).not.toHaveProperty(
          "glossLang",
        );
      }
      expect(dictionary.capitalMeaning("germany")).toBeDefined();
    });

    it("give no person's name first a word meaning", async () => {
      const { dictionary } = await load;
      for (const word of ["mark", "frank", "michael", "mary"])
        expect(dictionary.capitalMeaning(word), word).not.toBe("word");
    });

    it("are filed under capital keys only, no lowercase copies", async () => {
      const { dict } = await load;
      const capitals = Object.keys(dict).filter((key) => /^\p{Lu}/u.test(key));
      expect(capitals.length).toBeGreaterThan(1000);
      for (const key of capitals)
        expect(
          [capitalKey(key.toLowerCase()), key.toUpperCase()],
          key,
        ).toContain(key);
    });
  },
);

// The 2026-11-19 real-site check (U1-6): what the first line of these words is in each
// pair, and lines they must not show.
const FIRST_LINES: Readonly<
  Record<
    string,
    { english: string; january: string; be: string; better: string }
  >
> = {
  es: { english: "inglés", january: "enero", be: "ser", better: "mejor" },
  pt: { english: "inglês", january: "janeiro", be: "ser", better: "melhor" },
  fr: {
    english: "anglais",
    january: "janvier",
    be: "être",
    better: "meilleur",
  },
  de: { english: "englisch", january: "januar", be: "sein", better: "besser" },
  ru: { english: "английск", january: "январь", be: "быть", better: "лучше" },
  zh: { english: "英语", january: "一月", be: "是", better: "更好" },
  it: {
    english: "inglese",
    january: "gennaio",
    be: "essere",
    better: "migliore",
  },
  pl: { english: "angielski", january: "styczeń", be: "być", better: "lepszy" },
};

describe.each(recipeNatives())("generated en-%s first lines", (native) => {
  const expected = FIRST_LINES[native]!;
  const load = loadPack(`en-${native}`).then(({ dict }) =>
    createPairDictionary({ dict, defs, ipa, native, lemmas, pos }),
  );
  const first = async (...args: Parameters<Awaited<typeof load>["entry"]>) =>
    (await load).entry(...args)?.lines[0]?.toLowerCase();

  it("give English the language's word, not a type size, a sport's spin or a surname", async () => {
    const lines = (await load).entry("english", "capital")?.lines ?? [];
    expect(lines[0]?.toLowerCase()).toContain(expected.english);
    for (const line of lines)
      expect(line).not.toMatch(/Инглиш|silvio|Mittel|台球|billard|bilard/i);
  });
  it("give January the month however it is written, not an adjective", async () => {
    for (const written of ["capital", undefined] as const)
      expect(await first("january", written)).toContain(expected.january);
    expect((await load).entry("january")?.lines).toHaveLength(1);
  });
  it("give be the copula first, as a verb and as an auxiliary", async () => {
    expect(await first("be", "lower", "verb")).toContain(expected.be);
    expect(await first("be", "lower", "auxiliary")).toContain(expected.be);
  });
  it("give better the comparative, not good's other senses or the verb", async () => {
    expect(await first("better", "lower", "adjective")).toContain(
      expected.better,
    );
    const lines = (await load).entry("better", "lower", "adjective")?.lines;
    expect(lines?.join(" / ")).not.toMatch(/mejorar|sage|grzeczne/i);
  });
});

describe("generated en-zh dictionary", () => {
  it("is written in simplified characters", async () => {
    const { dict } = await loadPack("en-zh");
    const convert = simplifiedConverter();
    const traditional = Object.values(dict).filter(([short, senses]) =>
      [short, ...senses.map(([, text]) => text)].some(
        (text) => convert(text) !== text,
      ),
    );
    expect(traditional.length).toBeLessThan(10);
  });
});

// U1-7: what an edition writes that is no meaning, and the classes found after U1-4/U1-6.
describe("generated packs: native hygiene (U1-7)", () => {
  const pair = (native: RecipeNative) =>
    loadPack(`en-${native}`).then(({ dict }) =>
      createPairDictionary({ dict, defs, ipa, native, lemmas, pos }),
    );
  const shown = async (
    native: RecipeNative,
    ...args: Parameters<Awaited<ReturnType<typeof pair>>["entry"]>
  ) => ((await pair(native)).entry(...args)?.lines ?? []).join(" / ");
  const ja = createEnJaDictionary({
    dict,
    phrases: jaPhrases,
    capital,
    sensePos,
    defs,
    pos,
    ipa,
  });

  it("ja: okay follows the first of OK's spellings past the Oklahoma abbreviation", () => {
    expect(ja.entry("okay")?.lines[0]).toBe("大丈夫な");
    expect(ja.entry("ok", "lower")?.lines.join()).not.toMatch(/Oklahoma/);
    expect(capital.OK?.[1]).toEqual(["Oklahoma(オクラホマ州)の略"]);
  });
  it("fr: no placeholder lines, no closing references", async () => {
    for (const word of ["because", "catch", "scoff"])
      expect(await shown("fr", word)).not.toMatch(/manquante/);
    expect(await shown("fr", "premise")).not.toMatch(/voir premises/);
  });
  it("fr: the translation after a sentence about the English word", async () => {
    expect(await shown("fr", "least", "lower", "adjective")).toMatch(
      /^le moins/,
    );
  });
  it("ru: a label abbreviation is not the line, even before a capital", async () => {
    expect(await shown("ru", "britannia", "capital")).toMatch(/^Британия/);
    expect(await shown("ru", "gonna")).not.toMatch(/разг/);
  });
  it("reads unmarked pointers and gives a modal's pointer its verb senses", async () => {
    // es armor: "grafía alternativa de armour" only points, so the tables' term.
    expect(await shown("es", "armor")).toMatch(/^armadura/);
    expect(await shown("fr", "might", "lower", "verb")).toMatch(/pouvoir/);
    expect(await shown("de", "could", "lower", "verb")).toMatch(/können/);
    expect(await shown("de", "could", "lower", "verb")).not.toMatch(
      /Blechdose/,
    );
  });
  it("has no example text as table words, and no lesser lowercase line under a capital", async () => {
    for (const native of ["pt", "it", "de", "ru"] as const)
      expect(await shown(native, "would", "lower", "verb")).not.toMatch(
        /In the winters|We sat on the bench/,
      );
    expect(await shown("es", "french", "capital")).not.toMatch(/cortar/);
    // At a sentence start too: English is the language, not a billiards spin.
    expect(await shown("zh", "english")).toMatch(/^英语/);
  });
});

// U1-8: native follow-ups.
describe("generated packs: native follow-ups (U1-8)", () => {
  const pair = (native: RecipeNative) =>
    loadPack(`en-${native}`).then(({ dict }) =>
      createPairDictionary({ dict, defs, ipa, native, lemmas, pos }),
    );
  const shown = async (
    native: RecipeNative,
    ...args: Parameters<Awaited<ReturnType<typeof pair>>["entry"]>
  ) => ((await pair(native)).entry(...args)?.lines ?? []).join(" / ");

  it("show a capitalised and a lowercase line equal apart from case once (es Congreso)", async () => {
    expect(await shown("es", "congress", "capital")).toMatch(
      /^Congreso(?! \/ congreso)/,
    );
    expect(await shown("ru", "god", "capital")).not.toMatch(/Бог \/ бог/);
    // German: case tells the noun from the adjective.
    expect(await shown("de", "irish", "capital")).toMatch(/irisch/);
  });
  it("show forms of be read as verbs by their meanings where the edition's pointer is too wide", async () => {
    // Be as an auxiliary keeps its meaning (`WordUse.lexical`): looked up as a verb.
    for (const native of ["es", "pt"] as const)
      expect(await shown(native, "was", undefined, "verb")).toMatch(
        /^ser \/ estar/,
      );
    // Have as one keeps its pointer.
    expect(await shown("ru", "has", undefined, "auxiliary")).toMatch(
      /^форма третьего лица/,
    );
  });
  it("keep a form's pointer beside another word of its spelling (es dug: no teat)", async () => {
    expect(await shown("es", "dug")).not.toMatch(/teta/);
    expect(await shown("es", "dug")).toMatch(/cavar/);
  });
  it("leave a two-part label and a mid-gloss abbreviation out of the line", async () => {
    expect(await shown("ru", "lyric", undefined, "noun")).not.toMatch(/ч\./);
    expect(await shown("de", "frippery")).not.toMatch(/bzw$/);
  });
  it("show an adjective's sense first where the tag says so (pt low)", async () => {
    expect(await shown("pt", "low", "lower", "adjective")).toMatch(/^baixo/);
  });
});

describe("generated contractions", () => {
  it("say what each contraction is short for, in the source's case", () => {
    expect(contractions["i'm"]).toEqual(["I am"]);
    expect(contractions["don't"]).toEqual(["do not"]);
    expect(contractions["can't"]).toEqual(["cannot"]);
    expect(contractions["won't"]).toEqual(["will not"]);
    expect(contractions["that's"]).toEqual(["that is", "that has"]);
    expect(contractions["it's"]).toEqual(["it is", "it has"]);
    expect(contractions["let's"]).toEqual(["let us"]);
    expect(contractions["gonna"]).toEqual(["going to"]);
    expect(contractions["ain't"]).toEqual(["am not", "are not", "have not"]);
  });
  it("leave out possessives and words with a contraction sense among others", () => {
    for (const word of ["someone's", "one's", "gentlemen's", "am", "your"])
      expect(contractions, word).not.toHaveProperty(word);
  });

  const options = {
    expansions: (key: string) => contractions[key] ?? [],
    english: (word: string) => vocab.has(word),
  };
  const pair = (native: "ru" | "pl" | "fr") =>
    loadPack(`en-${native}`).then(({ dict }) =>
      withContractions(
        createPairDictionary({ dict, defs, ipa, native, lemmas, pos }),
        options,
      ),
    );
  it("show a contraction no source has by its expansions (ru I'm)", async () => {
    expect((await pair("ru")).entry("I'm")?.lines).toEqual(["I am"]);
  });
  it("name the expansion the clitic stands for, when the sentence says (K4: he's)", async () => {
    const ru = await pair("ru");
    expect(ru.entry("he's", undefined, undefined, "has")?.lines).toEqual([
      "he has",
    ]);
    expect(ru.entry("he's", undefined, undefined, "is")?.lines).toEqual([
      "he is",
    ]);
    expect(ru.entry("he's")?.lines).toEqual(["he is / he has"]);
  });
  it("show a contraction's own native meaning with its expansion as a note (pl don't)", async () => {
    expect((await pair("pl")).entry("don't")).toMatchObject({
      lines: ["nie"],
      expansion: "do not",
    });
  });
  it("follow no pointer of a contraction (pl there's: not 'ar, 100 m²')", async () => {
    expect((await pair("pl")).entry("there's")?.lines).toEqual([
      "there is / there has",
    ]);
  });
  it("show no English definition of a contraction (fr we've: not the exclusive we)", async () => {
    const entry = (await pair("fr")).entry("we've");
    expect(entry?.glossLang).toBeUndefined();
    expect(entry?.lines.join(" ")).not.toMatch(/exclusive/i);
  });
  it("give EJDict's line that writes the expansion out no note (ja I'm)", () => {
    const ja = withContractions(
      createEnJaDictionary({
        dict,
        phrases: jaPhrases,
        capital,
        sensePos,
        defs,
        pos,
        ipa,
      }),
      options,
    );
    expect(ja.entry("I'm")?.lines[0]).toContain("I am");
    expect(ja.entry("I'm")).not.toHaveProperty("expansion");
  });
});

const de = await loadPack("de");
const { defs: deEn } = await loadPack("de-en");

describe("generated German pack and de-en dictionary", () => {
  const pack = createLanguagePack("de", {
    lemmas: de.lemmas,
    freq: de.freq,
    ipa: de.ipa,
    vocab: new Set(de.vocab),
    patterns: de.phrases,
    pos: de.pos,
    names: de.names,
  });
  const dictionary = createDefsDictionary({ defs: deEn, ipa: de.ipa });

  it("reach capitalised nouns and their forms by their lowercase key", () => {
    // "haus" is also an imperative of hausen.
    expect(pack.lemmas("Haus")[0]).toBe("haus");
    expect(pack.lemmas("Häuser")).toEqual(["haus"]);
    expect(pack.lemmas("Straßen")).toEqual(["straße"]);
    expect(dictionary.entry("haus")).toMatchObject({
      kind: "word",
      short: expect.stringMatching(/^house\b/),
    });
  });

  it("give a separable verb's forms the verb after their own bases", () => {
    const bases = pack.lemmas("fängt");
    expect(bases[0]).toBe("fangen");
    expect(bases).toContain("anfangen");
  });

  it("have English meanings, the contractions' and the article's included", () => {
    expect(dictionary.entry("im")?.short).toBe("in the");
    expect(dictionary.entry("zum")?.short).toMatch(/^to the\b/);
    expect(dictionary.entry("der")?.short).toBe("the");
    // A noun and a verb that share a key both have their senses.
    const essen = dictionary.entry("essen")!.senses.map((sense) => sense.pos);
    expect(essen).toContain("noun");
    expect(essen).toContain("verb");
  });

  it("have the IPA of nearly every word, from either edition", () => {
    expect(pack.ipa("haus")).toMatch(/^\/haʊ̯?s\/$/);
    const top = de.freq.slice(0, 5000);
    expect(top.filter((word) => pack.ipa(word)).length).toBeGreaterThan(4800);
  });

  it("rank common words first", () => {
    expect(pack.rank("der")).toBeLessThanOrEqual(20);
    expect(pack.rank("haus")).toBeLessThan(pack.rank("hütte"));
  });

  it("restore no accents in capitals: German writes its umlauts there", () => {
    expect(pack.accented("fur")).toBeUndefined();
  });

  it("highlight phrases, and have a meaning for every one", () => {
    expect(de.phrases.detect.length).toBeGreaterThan(1000);
    expect(de.phrases.detect).toContain("vor allem");
    expect(de.phrases.detect).toContain("in kauf nehmen");
    for (const phrase of [...de.phrases.detect, ...de.phrases.more])
      expect(dictionary.entry(phrase)?.short, phrase).toBeTruthy();
  });
});
