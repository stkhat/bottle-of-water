import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { frenchForms, parseFrequencyWords } from "./fr-frequency.ts";
import { FRENCH_BUILD, frenchOwnWord, slimEntry } from "./fr-kaikki.ts";
import {
  auxiliaryUse,
  buildLearningPacks,
  contractionMeaning,
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
    ].join("\n"),
  ),
);

describe("frenchForms", () => {
  it("keeps the list's words with their apostrophes, without hyphenated ones", () => {
    expect(forms).toContain("l'");
    expect(forms).not.toContain("peut-être");
  });
});

describe("buildLearningPacks with French's settings", () => {
  let packs: LearningPacks;
  beforeAll(async () => {
    packs = await buildLearningPacks(FRENCH_BUILD, fixture, forms, {
      casePaths: [edition],
      ipaPaths: [edition],
      phraseScoring: { stopwords: { gloss: 4, function: 2 } },
    });
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
