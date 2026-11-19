import { describe, expect, it } from "vitest";
import { germanTagger } from "./de";
import type { PerceptronModel } from "./perceptron";
import type { TaggedWord, TokenTag } from "./tagger";

/** A model that knows a few words for sure and tags every other one as a noun it is not sure of. */
const MODEL: PerceptronModel = {
  tags: ["NOUN", "VERB.Fin"],
  words: { im: "ADP", ist: "AUX.Fin", an: "PART.Vz" },
  weights: {},
  scale: 10,
};
const tagger = germanTagger(MODEL);

describe("germanTagger: tag", () => {
  it("tags each token as written, a separable verb's particle as a particle", () => {
    expect(tagger.tag(["im", "ist", "an", "Haus"])).toEqual([
      expect.objectContaining({ tag: "ADP", label: "preposition" }),
      expect.objectContaining({ tag: "AUX.Fin", inflected: true }),
      expect.objectContaining({ tag: "PART.Vz", label: "particle" }),
      expect.objectContaining({ tag: "NOUN", confidence: 0 }),
    ]);
  });
  it("trusts tags from a margin of 5", () => {
    expect(tagger.threshold).toBe(5);
  });
});

const LABELS: Record<string, string> = {
  AUX: "verb",
  VERB: "verb",
  PRON: "pronoun",
  ADV: "adverb",
  ADJ: "adjective",
  NOUN: "noun",
  PROPN: "noun",
  DET: "determiner",
  ADP: "preposition",
  NUM: "numeral",
  PART: "particle",
  SCONJ: "conjunction",
};

function tagOf(tag: string): TokenTag {
  return {
    tag,
    label: LABELS[tag.split(".")[0]!]!,
    inflected: /\.(Fin|Part)$/.test(tag),
    morph: true,
    proper: tag === "PROPN",
    confidence: Infinity,
  };
}

/** Words "form/TAG[/base…]", trusted unless the tag ends in "?"; "," before a word is a pause. */
function sentence(text: string): TaggedWord[] {
  return text.split(" ").map((item) => {
    const pause = item.startsWith(",");
    const [form, tag, ...bases] = item.replace(/^,/, "").split("/");
    const sure = !tag!.endsWith("?");
    return {
      form: form!,
      bases: bases.length > 0 ? bases : [form!],
      tag: tagOf(tag!.replace("?", "")),
      trusted: sure,
      pauseBefore: pause,
    };
  });
}

const usesOf = (text: string) => tagger.uses(sentence(text));

describe("germanTagger: auxiliaries anywhere in the clause", () => {
  it("reads haben with a participle at the clause's end as an auxiliary", () => {
    const uses = usesOf(
      "ich/PRON habe/AUX.Fin/haben gestern/ADV einen/DET film/NOUN gesehen/VERB.Part/sehen",
    );
    expect(uses[1]).toMatchObject({ auxiliary: true, base: "haben" });
    expect(uses[5]).toMatchObject({ verbal: "aux" });
  });
  it("reads the auxiliary after its participle in a verb-final clause", () => {
    const uses = usesOf(
      "dass/SCONJ er/PRON es/PRON gelesen/VERB.Part/lesen hat/AUX.Fin/haben",
    );
    expect(uses[4]).toMatchObject({ auxiliary: true });
    expect(uses[3]).toMatchObject({ verbal: "aux" });
  });
  it("leaves haben with no participle of its own a verb", () => {
    expect(
      usesOf("ich/PRON habe/AUX.Fin/haben ein/DET auto/NOUN")[1],
    ).toMatchObject({ auxiliary: false });
    // "gegessen" is hat's, the auxiliary nearer to it.
    const uses = usesOf(
      "ich/PRON habe/AUX.Fin/haben hunger/NOUN und/CCONJ er/PRON hat/AUX.Fin/haben gegessen/VERB.Part/essen",
    );
    expect(uses[1]).toMatchObject({ auxiliary: false });
    expect(uses[5]).toMatchObject({ auxiliary: true });
  });
  it("does not look past a pause", () => {
    expect(
      usesOf("ich/PRON habe/AUX.Fin/haben ,gesehen/VERB.Part/sehen")[1],
    ).toMatchObject({ auxiliary: false });
  });
  it("reads sein with the participle of a verb that takes it as the perfect, else a state", () => {
    expect(
      usesOf(
        "sie/PRON ist/AUX.Fin/sein nach/ADP hause/NOUN gegangen/VERB.Part/gehen",
      )[1],
    ).toMatchObject({ auxiliary: true });
    expect(
      usesOf("er/PRON ist/AUX.Fin/sein angekommen/VERB.Part/ankommen")[1],
    ).toMatchObject({ auxiliary: true });
    const state = usesOf(
      "die/DET tür/NOUN ist/AUX.Fin/sein geschlossen/VERB.Part/schließen",
    );
    expect(state[2]).toMatchObject({ auxiliary: false });
    expect(state[3]).toMatchObject({ verbal: false, grammarPos: "adjective" });
  });
  it("reads werden with an infinitive or a participle as an auxiliary, else a verb", () => {
    expect(
      usesOf("es/PRON wird/AUX.Fin/werden morgen/ADV regnen/VERB.Inf")[1],
    ).toMatchObject({ auxiliary: true });
    expect(
      usesOf(
        "das/DET haus/NOUN wurde/AUX.Fin/werden gebaut/VERB.Part/bauen",
      )[2],
    ).toMatchObject({ auxiliary: true });
    expect(usesOf("er/PRON wird/AUX.Fin/werden arzt/NOUN")[1]).toMatchObject({
      auxiliary: false,
    });
  });
  it("keeps a modal's own meaning, its infinitive a verb", () => {
    const uses = usesOf(
      "ich/PRON kann/AUX.Fin/können gut/ADV schwimmen/VERB.Inf",
    );
    expect(uses[1]).toMatchObject({ auxiliary: false, base: "können" });
    expect(uses[3]).toMatchObject({ verbal: "aux" });
  });
});

describe("germanTagger: separable verbs", () => {
  const FANGT = "fängt/VERB.Fin/fangen/anfangen/auffangen";
  it("reads a finite verb with its particle at the clause's end as the separable verb", () => {
    expect(
      usesOf(
        `er/PRON ${FANGT} morgen/ADV mit/ADP der/DET arbeit/NOUN an/PART.Vz`,
      )[1],
    ).toMatchObject({ base: "anfangen", separable: true, grammarPos: "verb" });
    // A preposition or adverb ending the clause is a particle too.
    expect(usesOf(`er/PRON ${FANGT} an/ADP`)[1]).toMatchObject({
      base: "anfangen",
    });
  });
  it("reads it as the simple verb without its particle in the clause", () => {
    expect(usesOf(`er/PRON ${FANGT} den/DET ball/NOUN`)[1]).toMatchObject({
      base: "fangen",
    });
    expect(usesOf(`er/PRON ${FANGT} an/ADP der/DET tür/NOUN`)[1]).toMatchObject(
      { base: "fangen" },
    );
    expect(usesOf(`er/PRON ${FANGT} morgen/ADV ,an/PART.Vz`)[1]).toMatchObject({
      base: "fangen",
    });
  });
  it("takes the simple verb the separable ones are made of, not a noun among the bases", () => {
    expect(
      usesOf(
        "ich/PRON rufe/VERB.Fin/ruf/rufen/anrufen dich/PRON an/PART.Vz",
      )[1],
    ).toMatchObject({ base: "anrufen" });
    expect(
      usesOf("ich/PRON rufe/VERB.Fin/ruf/rufen/anrufen dich/PRON")[1],
    ).toMatchObject({ base: "rufen" });
  });
});

describe("germanTagger: closed classes", () => {
  it("reads an infinitive after a determiner or preposition as a noun, not a finite verb after a postposition", () => {
    expect(
      usesOf("das/DET essen/VERB.Inf ist/AUX.Fin/sein kalt/ADJ")[1],
    ).toMatchObject({ label: "noun", verbal: "other" });
    expect(
      usesOf("angaben/NOUN zufolge/ADP soll/AUX.Fin/soll/sollen es/PRON")[2],
    ).toMatchObject({ base: "sollen", grammarPos: "verb" });
  });
  it("reads sein before a noun as the possessive, at a clause's end as the verb", () => {
    expect(usesOf("sein/DET haus/NOUN")[0]).toMatchObject({
      grammarPos: "determiner",
    });
    expect(
      usesOf("das/PRON kann/AUX.Fin/können nicht/PART sein/AUX.Inf")[3],
    ).toMatchObject({ grammarPos: "verb" });
  });
  it("reads a modal's form as the modal whatever the tag", () => {
    expect(
      usesOf("kannst/NOUN/können du/PRON kommen/VERB.Inf")[0],
    ).toMatchObject({ base: "können", grammarPos: "verb" });
  });
  it("reads a clause's first word before a subject pronoun as its verb", () => {
    expect(usesOf("wissen/NOUN sie/PRON")[0]).toMatchObject({
      grammarPos: "verb",
    });
    expect(usesOf("das/DET haus/NOUN")[0]).not.toHaveProperty("grammarPos");
  });
  it("reads a form of haben tagged as a verb as haben, not a noun it also is", () => {
    expect(
      usesOf("ich/PRON habe/AUX.Fin/habe/haben zeit/NOUN")[1],
    ).toMatchObject({ base: "haben", grammarPos: "verb" });
  });
});

describe("germanTagger: capitalised nouns", () => {
  it("reads a capitalised word inside a sentence as a noun, whatever the tag is sure of", () => {
    const words = sentence(
      "eine/DET kartoffel/NOUN mit/ADP haaren/NOUN?/haaren/haar",
    ).map((word) => ({ ...word, capital: true }));
    const uses = tagger.uses(words);
    expect(uses[3]).toMatchObject({ grammarPos: "noun" });
    // Not a sentence's first word.
    expect(uses[0]).not.toHaveProperty("grammarPos");
  });
  it("leaves the polite Sie a pronoun", () => {
    const words = sentence("wissen/VERB.Fin sie/PRON").map((word, i) =>
      i === 1 ? { ...word, capital: true as const } : word,
    );
    expect(tagger.uses(words)[1]).not.toHaveProperty("grammarPos");
  });
});

describe("germanTagger: contractions", () => {
  it("reads a preposition joined to the article as the contraction, am before a superlative as its particle", () => {
    expect(usesOf("am/ADP montag/NOUN")[0]).toMatchObject({
      grammarPos: "contraction",
    });
    expect(usesOf("im/ADP haus/NOUN")[0]).toMatchObject({
      grammarPos: "contraction",
    });
    expect(usesOf("das/PRON ist/AUX.Fin am/ADP besten/ADJ")[2]).toMatchObject({
      grammarPos: "particle",
    });
    expect(usesOf("am/ADP ersten/ADJ tag/NOUN")[0]).toMatchObject({
      grammarPos: "contraction",
    });
  });
});

describe("germanTagger: role", () => {
  const roleOf = (item: string) => tagger.role(sentence(item)[0]!);
  it("marks modals, personal words and the infinitive's zu", () => {
    expect(roleOf("kann/AUX.Fin/können").modal).toBe(true);
    expect(roleOf("hat/AUX.Fin/haben").modal).toBe(false);
    expect(roleOf("seine/DET/sein").personal).toBe(true);
    expect(roleOf("zu/PART").infinitive).toBe(true);
    expect(roleOf("zu/ADP").infinitive).toBe(false);
    expect(roleOf("ist/AUX.Fin/sein").be).toBe(true);
  });
});
