import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { frenchForms, parseFrequencyWords } from "./fr-frequency.ts";
import { FRENCH_BUILD, frenchOwnWord, slimEntry } from "./fr-kaikki.ts";
import {
  auxiliaryUse,
  buildLearningPacks,
  contractionMeaning,
  infinitiveConstruction,
  selectOnly,
  type LearningPacks,
} from "./learning-kaikki.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-fr.jsonl");
const edition = join(
  import.meta.dirname,
  "fixtures",
  "kaikki-fr-edition-slim.jsonl",
);
// The list writes elisions apart ("d'", "accord"), as hermitdave's lists do.
const forms = frenchForms(
  parseFrequencyWords(
    [
      "de 900",
      "l' 800",
      "qu' 700",
      "il 600",
      "le 500",
      "homme 400",
      "d' 300",
      "accord 200",
      "au 150",
      "appelés 100",
      "n' 90",
      "maison 80",
      "peut-être 70",
      "coup 60",
      "plus 50",
      "info 40",
      "information 30",
      "en 20",
      "retenir 19",
      "public 18",
      "réussir 17",
      "dire 16",
    ].join("\n"),
  ),
);

describe("frenchForms", () => {
  it("keeps the list's words with their apostrophes and hyphens", () => {
    expect(forms).toContain("l'");
    expect(forms).toContain("peut-être");
  });
});

describe("buildLearningPacks with French's settings", () => {
  let packs: LearningPacks;
  beforeAll(async () => {
    packs = await buildLearningPacks(
      { ...FRENCH_BUILD, pronominalVerb: (verb) => verb === "appeler" },
      fixture,
      forms,
      {
        casePaths: [edition],
        ipaPaths: [edition],
        phraseScoring: { stopwords: { gloss: 4, function: 2 } },
      },
    );
  });

  it("keeps an elided word as a word, pointing to the word it elides", () => {
    expect(packs.vocab).toContain("l'");
    expect(packs.lemmas["l'"]).toBe("le");
    expect(packs.vocab).toContain("n'");
  });

  it("leaves out a contraction of the words the tokenizer splits it into", () => {
    expect(packs.vocab).not.toContain("qu'il");
    expect(packs.defs).not.toHaveProperty("qu'il");
  });

  it("reaches a word of its own that the list writes in parts, ranked as its rarest part", () => {
    expect(packs.vocab).toContain("d'accord");
    expect(packs.freq.indexOf("d'accord")).toBe(
      packs.freq.indexOf("accord") + 1,
    );
  });

  it("gives a contraction the meaning its gloss quotes", () => {
    expect(packs.defs.au?.[0]).toBe("to the, for the, at the");
  });

  it("follows a form of a form to its base", () => {
    expect(packs.lemmas["appelés"]).toBe("appeler");
  });

  it("takes the edition's IPA, in slashes, for a word that has none", () => {
    expect(packs.ipa.maison).toBe("/mɛ.zɔ̃/");
    expect(packs.ipa.homme).toBe("/ɔm/");
  });

  it("puts a nested sense's parent meaning before it", () => {
    // "sound of the action" is a kind of blow; the parent's meaning leads, once.
    expect(packs.defs.coup?.[1].map(([, text]) => text)).toEqual([
      "blow, hit, strike",
      "sound of the action",
      "physical consequences of the action (marks)",
      "a time, a try, an instance",
    ]);
    // A subsense that translates keeps its place; the word itself is no meaning.
    expect(packs.defs.retenir?.[1].map(([, text]) => text)).toEqual([
      "to hold back, rein in",
      "to remember",
    ]);
    expect(packs.defs.public?.[1].map(([, text]) => text)).toEqual([
      "public (people in general)",
      "audience",
    ]);
    // A context that introduces a translation is no meaning of its own.
    expect(packs.defs.plus?.[1].map(([, text]) => text)).toEqual([
      "more, -er (comparative)",
      "not ... any more, no more, no longer",
    ]);
  });

  it("labels no verb an auxiliary whose infinitive a preposition introduces, but marks the construction", () => {
    expect(packs.defs["réussir"]?.[1][0]).toEqual([
      "verb",
      "to manage to do something",
      "+à",
    ]);
  });

  it("labels a pronominal verb's reflexive senses so, kept past the cap", () => {
    expect(packs.defs.appeler?.[1]).toEqual([
      ["verb", "to call"],
      ["reflexive", "to be called"],
    ]);
    expect(packs.pos.appeler).toEqual(["verb"]);
    // A verb whose pronoun is its object ("se dire") keeps them as its own.
    expect(packs.defs.dire?.[1]).toEqual([
      ["verb", "to say"],
      ["verb", "to say (to signify)"],
    ]);
  });

  it("reads a contraction of one word as that word cut short", () => {
    expect(packs.defs.info?.[0]).toBe("information");
  });

  it("puts a closed class's translation before a usage note", () => {
    expect(packs.defs.en?.[1][0]).toEqual([
      "pronoun",
      "of it, of them. Replaces the partitive article (du, de la, etc.); Used as the object of a verb to indicate an indefinite quantity",
    ]);
  });

  it("matches no phrase pattern for highlights", () => {
    expect(packs.phrases.detect).toEqual([]);
  });
});

describe("auxiliaryUse", () => {
  it("finds the senses kaikki tags auxiliary or qualifies by the auxiliary's construction", () => {
    expect(
      auxiliaryUse({
        tags: ["auxiliary"],
        glosses: ["used to form the compound tenses of most verbs"],
      }),
    ).toBe(true);
    expect(
      auxiliaryUse({
        glosses: ["to be going (to); will soon; forms a near-future tense"],
        raw_glosses: [
          "(when followed by an infinitive verb) to be going (to); will soon",
        ],
      }),
    ).toBe(true);
    expect(
      auxiliaryUse({
        raw_glosses: [
          "(preceding the gerund of a verb, intransitive) to go on (doing)",
        ],
      }),
    ).toBe(true);
    // A qualifier that asks for another use too: se faire, not causative faire.
    expect(
      auxiliaryUse({
        raw_glosses: ["(reflexive, followed by an infinitive) to be, to get"],
      }),
    ).toBe(false);
    expect(
      auxiliaryUse({
        tags: ["transitive"],
        raw_glosses: ["(transitive) to have"],
      }),
    ).toBe(false);
  });
});

describe("infinitiveConstruction", () => {
  const of = (...raw_glosses: string[]) =>
    infinitiveConstruction({ glosses: ["x"], raw_glosses });
  it("reads the words that introduce the infinitive from the construction notes", () => {
    expect(of("to have to [with que (+ infinitive)]")).toBe("+que");
    expect(
      of("(catenative) to try [with de (+ infinitive) ‘to do something’]"),
    ).toBe("+de");
    expect(of("to continue [with à (+ infinitive) or de (+ infinitive)]")).toBe(
      "+à|de",
    );
    expect(of("(with à + infinitive) to intend to do")).toBe("+à");
    expect(
      of(
        "(intransitive, followed by à and infinitive) to manage to do something",
      ),
    ).toBe("+à");
    expect(
      of("(reflexive, with a when followed by an infinitive) to refuse"),
    ).toBe("+a");
    // A bare infinitive.
    expect(of("to have just done [with infinitive]")).toBe("+");
    expect(
      of(
        "(transitive) to hope [with direct object ‘for something’ or infinitive ‘to do something’]",
      ),
    ).toBe("+");
  });
  it("finds none without an infinitive, or in a note on how to translate", () => {
    expect(of("to get up to, to reach (+ a or + hasta)")).toBeUndefined();
    expect(of("must [(optionally) with de]")).toBeUndefined();
    expect(of("(when followed by an infinitive verb) to be going (to)")).toBe(
      undefined,
    );
    expect(
      infinitiveConstruction({
        glosses: ["translated with end up"],
        raw_glosses: ["translated with end up [with a and infinitive]"],
      }),
    ).toBeUndefined();
  });
});

describe("frenchOwnWord", () => {
  const entry = (tags: string[], gloss: string) => ({
    word: "x",
    pos: "contraction",
    senses: [{ tags, glosses: [gloss] }],
  });
  it("is false for contractions and compounds only", () => {
    expect(
      frenchOwnWord([entry(["contraction"], "contraction of que + il")]),
    ).toBe(false);
    expect(
      frenchOwnWord([entry([], "I've, I have; compound of je and ai")]),
    ).toBe(false);
    expect(frenchOwnWord([entry([], "in agreement")])).toBe(true);
  });
});

describe("contractionMeaning", () => {
  it("puts the meaning a contraction's gloss gives first", () => {
    expect(
      contractionMeaning(
        "contraction of à + le, literally “to the, for the, at the”",
      ),
    ).toBe("to the, for the, at the; contraction of à + le");
    expect(
      contractionMeaning("Contraction of à + les ('to the' or 'of the')"),
    ).toBe("to the or of the; Contraction of à + les");
    expect(contractionMeaning("contraction of que + il")).toBeUndefined();
  });
});

describe("selectOnly", () => {
  it("moves the detected patterns among the selectable ones, with their parts of speech", () => {
    expect(
      selectOnly({
        detect: ["b c"],
        more: ["a b", "c d"],
        gap: [],
        pos: { detect: "v", more: "n -" },
      }),
    ).toEqual({
      detect: [],
      more: ["a b", "b c", "c d"],
      gap: [],
      pos: { detect: "", more: "n v -" },
    });
  });
});

describe("slimEntry", () => {
  it("keeps the word, its examples and its IPA, or nothing", () => {
    expect(
      slimEntry({
        word: "maison",
        lang_code: "fr",
        pos: "noun",
        senses: [
          { glosses: ["Bâtiment"], examples: [{ text: "Une maison." }] },
        ],
        sounds: [{ ipa: "\\mɛ.zɔ̃\\" }, { audio: "x.ogg" }],
      } as never),
    ).toEqual({
      word: "maison",
      lang_code: "fr",
      pos: "noun",
      senses: [{ examples: [{ text: "Une maison." }] }],
      sounds: [{ ipa: "\\mɛ.zɔ̃\\" }],
    });
    expect(
      slimEntry({ word: "x", lang_code: "fr", senses: [] } as never),
    ).toBeUndefined();
  });
});
