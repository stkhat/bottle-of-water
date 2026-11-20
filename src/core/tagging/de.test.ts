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
  it("reads an adjective-tagged participle at the end of a clause of haben as the verb", () => {
    const uses = usesOf(
      "kinder/NOUN haben/AUX.Fin/haben dich/PRON sehr/ADV vermisst/ADJ/vermisst/vermissen",
    );
    expect(uses[1]).toMatchObject({ auxiliary: true });
    expect(uses[4]).toMatchObject({ base: "vermissen", grammarPos: "verb" });
    // sein takes a predicative adjective; an adjective with no verb is one.
    expect(
      usesOf("er/PRON ist/AUX.Fin/sein verletzt/ADJ/verletzt/verletzen")[1],
    ).toMatchObject({ auxiliary: false });
    expect(
      usesOf("ich/PRON habe/AUX.Fin/haben es/PRON eilig/ADJ")[1],
    ).toMatchObject({ auxiliary: false });
  });
  it("reads a modal with its infinitive as an auxiliary, without one as a verb", () => {
    const uses = usesOf(
      "ich/PRON kann/AUX.Fin/können gut/ADV schwimmen/VERB.Inf",
    );
    expect(uses[1]).toMatchObject({ auxiliary: true, base: "können" });
    expect(uses[3]).toMatchObject({ verbal: "aux" });
    expect(
      usesOf("ich/PRON kann/AUX.Fin/können deutsch/NOUN")[1],
    ).toMatchObject({ auxiliary: false, base: "können" });
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
  it("reads no particle in the infinitive's zu that a line cuts off", () => {
    const HABEN = "haben/VERB.Fin/haben/zuhaben";
    const cut = sentence(`wir/PRON ${HABEN} keine/DET zeit/NOUN zu/ADP`);
    expect(
      tagger.uses(
        cut.map((word, i) => (i === 4 ? { ...word, pauseAfter: false } : word)),
      )[1],
    ).toMatchObject({ base: "haben" });
    expect(tagger.uses(cut)[1]).toMatchObject({ base: "zuhaben" });
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

describe("germanTagger: a separable verb's particle", () => {
  const FANGT = "fängt/VERB.Fin/fangen/anfangen/auffangen";
  it("reads the particle as its verb", () => {
    expect(usesOf(`er/PRON ${FANGT} morgen/ADV an/PART.Vz`)[3]).toMatchObject({
      particleOf: "anfangen",
      grammarPos: "verb",
    });
    expect(usesOf(`er/PRON ${FANGT} den/DET ball/NOUN`)[3]).not.toHaveProperty(
      "particleOf",
    );
  });
  it("gives the particle to the nearest finite verb before it", () => {
    const uses = usesOf(
      `er/PRON ${FANGT} den/DET ball/NOUN und/CCONJ sie/PRON steht/VERB.Fin/stehen/aufstehen auf/ADV`,
    );
    expect(uses[1]).toMatchObject({ base: "fangen" });
    expect(uses[6]).toMatchObject({ base: "aufstehen" });
    expect(uses[7]).toMatchObject({ particleOf: "aufstehen" });
  });
  it("makes the particle pronominal with its verb", () => {
    expect(
      usesOf(
        "er/PRON stellt/VERB.Fin/stellen/vorstellen sich/PRON vor/PART.Vz",
      )[3],
    ).toMatchObject({ particleOf: "vorstellen", pronominal: true });
  });
});

describe("germanTagger: pronominal verbs", () => {
  it("reads a verb with sich in its clause as pronominal", () => {
    expect(
      usesOf("er/PRON freut/VERB.Fin/freuen sich/PRON sehr/ADV")[1],
    ).toMatchObject({ pronominal: true });
    expect(
      usesOf("er/PRON freut/VERB.Fin/freuen uns/PRON sehr/ADV")[1],
    ).not.toHaveProperty("pronominal");
  });
  it("reads mich, dich, uns, euch as reflexive with their own subject, or dich after an imperative", () => {
    expect(usesOf("ich/PRON freue/VERB.Fin/freuen mich/PRON")[1]).toMatchObject(
      { pronominal: true },
    );
    expect(
      usesOf("er/PRON sieht/VERB.Fin/sehen mich/PRON")[1],
    ).not.toHaveProperty("pronominal");
    expect(usesOf("beeil/VERB.Fin/beeilen dich/PRON")[0]).toMatchObject({
      pronominal: true,
    });
  });
  it("makes the verb an auxiliary takes pronominal, not the auxiliary", () => {
    const uses = usesOf(
      "ich/PRON habe/AUX.Fin/haben mich/PRON gefreut/VERB.Part/freuen",
    );
    expect(uses[1]).not.toHaveProperty("pronominal");
    expect(uses[3]).toMatchObject({ pronominal: true });
  });
  it("leaves a pronoun after a preposition its object", () => {
    expect(
      usesOf("er/PRON denkt/VERB.Fin/denken an/ADP sich/PRON")[1],
    ).not.toHaveProperty("pronominal");
  });
  it("gives the pronoun's case where its form shows it", () => {
    const STELLE = "stelle/VERB.Fin/stellen/vorstellen";
    expect(
      usesOf(`ich/PRON ${STELLE} mir/PRON das/PRON vor/PART.Vz`)[1],
    ).toMatchObject({ pronominal: true, reflexiveCase: "dative" });
    expect(usesOf(`ich/PRON ${STELLE} mich/PRON vor/PART.Vz`)[3]).toMatchObject(
      { particleOf: "vorstellen", reflexiveCase: "accusative" },
    );
    expect(
      usesOf("er/PRON freut/VERB.Fin/freuen sich/PRON")[1],
    ).not.toHaveProperty("reflexiveCase");
  });
});

describe("germanTagger: a third-person subject's number", () => {
  it("reads it from the finite verb after or before it", () => {
    expect(usesOf("sie/PRON sind/AUX.Fin/sein müde/ADJ")[0]).toMatchObject({
      number: "plural",
      grammarPos: "pronoun",
    });
    expect(usesOf("sie/PRON ist/AUX.Fin/sein müde/ADJ")[0]).toMatchObject({
      number: "singular",
    });
    expect(
      usesOf("jetzt/ADV drohen/VERB.Fin/drohen sie/PRON")[2],
    ).toMatchObject({ number: "plural" });
    // A past singular spelt like a noun is no plural.
    expect(
      usesOf("dann/ADV schloss/VERB.Fin/schließen/schloss sie/PRON")[2],
    ).toMatchObject({ number: "singular" });
  });
  it("reads the verb at the clause's end after a subordinator", () => {
    expect(
      usesOf("weil/SCONJ sie/PRON keine/DET zeit/NOUN haben/VERB.Fin/haben")[1],
    ).toMatchObject({ number: "plural" });
  });
  it("says nothing of an object pronoun", () => {
    expect(
      usesOf("wir/PRON sehen/VERB.Fin/sehen sie/PRON")[2],
    ).not.toHaveProperty("number");
  });
});

describe("germanTagger: adverbs inside the clause", () => {
  it("reads a modal particle after the clause's first word as an adverb", () => {
    expect(
      usesOf("das/PRON ist/AUX.Fin/sein ja/ADV toll/ADJ")[2],
    ).toMatchObject({ grammarPos: "adverb" });
    expect(
      usesOf("ja/ADV ,das/PRON stimmt/VERB.Fin/stimmen")[0],
    ).not.toHaveProperty("grammarPos");
    // A noun after a determiner, or a capital, is no particle.
    expect(usesOf("jedes/DET mal/NOUN")[1]).not.toMatchObject({
      grammarPos: "adverb",
    });
  });
  it("reads an adjective without an ending as an adverb, unless predicative", () => {
    expect(
      usesOf(
        "ich/PRON mache/VERB.Fin/machen das/PRON schnell/ADJ fertig/ADJ",
      )[3],
    ).toMatchObject({ grammarPos: "adverb" });
    expect(
      usesOf("das/PRON ist/AUX.Fin/sein schnell/ADJ")[2],
    ).not.toMatchObject({ grammarPos: "adverb" });
    expect(
      usesOf("wie/ADV schnell/ADJ ist/AUX.Fin/sein er/PRON")[1],
    ).not.toMatchObject({ grammarPos: "adverb" });
    expect(
      usesOf("ein/DET schnelles/ADJ/schnell auto/NOUN")[1],
    ).not.toMatchObject({ grammarPos: "adverb" });
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
    expect(tagger.uses(words)[1]?.grammarPos).not.toBe("noun");
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
