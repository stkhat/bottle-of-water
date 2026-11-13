import { describe, expect, it } from "vitest";
import { englishTagger } from "./en";
import type { PerceptronModel } from "./perceptron";
import { trustedTag, type TaggedWord, type TokenTag } from "./tagger";

/**
 * A model that knows some words for sure and scores the others from one feature: a
 * word ending in -ed is a past tense (by a margin of 3), any other a noun (by 0).
 */
const MODEL: PerceptronModel = {
  tags: ["NN", "VBD"],
  // Known words are kept as the features see them, in lower case.
  words: {
    do: "VBP",
    "n't": "RB",
    i: "PRP",
    "'m": "VBP",
    the: "DT",
    harvey: "NNP",
  },
  weights: { "s2 ed": [1, 30] },
  scale: 10,
};
const tagger = englishTagger(MODEL);

describe("englishTagger: tag", () => {
  it("tags each token, a contraction by its first word", () => {
    expect(tagger.tag(["I", "don't", "know"]).map((t) => t.tag)).toEqual([
      "PRP",
      "VBP",
      "NN",
    ]);
    expect(tagger.tag(["I’m", "here"]).map((t) => t.tag)).toEqual([
      "PRP",
      "NN",
    ]);
  });
  it("splits gonna, wanna and gotta as the treebank does, taking the verb's tag", () => {
    const spoken = englishTagger({
      ...MODEL,
      words: { gon: "VBG", na: "TO", wan: "VBP", got: "VBD", ta: "TO" },
    });
    expect(spoken.tag(["gonna", "wanna", "gotta"]).map((t) => t.tag)).toEqual([
      "VBG",
      "VBP",
      "VBD",
    ]);
  });
  it("reads a lower-case i as the pronoun, as the treebank writes it", () => {
    // Only the shape feature sees the capital: "i" and "I" score alike otherwise.
    const shaped = englishTagger({
      ...MODEL,
      words: {},
      weights: { "sh X": [1, 60] },
    });
    expect(shaped.tag(["i"])[0]?.tag).toBe("VBD");
    expect(shaped.tag(["it"])[0]?.tag).toBe("NN");
  });
  it("gives the dictionaries' part of speech, inflection and confidence", () => {
    const [the, walked, harvey, dog] = tagger.tag([
      "The",
      "walked",
      "Harvey",
      "dog",
    ]);
    expect(the).toEqual({
      tag: "DT",
      label: "determiner",
      inflected: false,
      morph: false,
      proper: false,
      confidence: Infinity,
    });
    expect(walked).toEqual({
      tag: "VBD",
      label: "verb",
      inflected: true,
      morph: true,
      proper: false,
      confidence: 3,
    });
    expect(harvey).toMatchObject({ label: "noun", proper: true });
    expect(dog).toMatchObject({ label: "noun", confidence: 0 });
  });
  it("trusts tags from a margin of 5", () => {
    expect(tagger.threshold).toBe(5);
  });
});

/** A tag as the tagger gives it, sure of itself. */
function tagOf(tag: string, label: string, inflected = false): TokenTag {
  return {
    tag,
    label,
    inflected,
    morph: inflected,
    proper: false,
    confidence: Infinity,
  };
}

const T: Record<string, TokenTag> = {
  PRP: tagOf("PRP", "pronoun"),
  DT: tagOf("DT", "determiner"),
  JJ: tagOf("JJ", "adjective"),
  NN: tagOf("NN", "noun"),
  NNP: { ...tagOf("NNP", "noun"), proper: true },
  RB: tagOf("RB", "adverb"),
  IN: tagOf("IN", "preposition"),
  TO: tagOf("TO", "particle"),
  VB: tagOf("VB", "verb"),
  VBP: tagOf("VBP", "verb"),
  VBZ: tagOf("VBZ", "verb", true),
  VBD: tagOf("VBD", "verb", true),
  VBN: tagOf("VBN", "verb", true),
  VBG: tagOf("VBG", "verb", true),
  MD: tagOf("MD", "verb"),
  RP: tagOf("RP", "adverb"),
  CD: tagOf("CD", "numeral"),
  WP: tagOf("WP", "pronoun"),
  PRP$: tagOf("PRP$", "determiner"),
};

/** Words "form/TAG[/base]", trusted unless the tag is a proper noun's. */
function sentence(text: string): TaggedWord[] {
  return text.split(" ").map((item) => {
    const pause = item.startsWith(",");
    const [form, tag, ...bases] = item.replace(/^,/, "").split("/");
    const t = T[tag!]!;
    return {
      form: form!,
      bases: bases.length > 0 ? bases : [form!],
      tag: t,
      trusted: !t.proper,
      pauseBefore: pause,
    };
  });
}

const usesOf = (text: string) => tagger.uses(sentence(text));

describe("englishTagger: uses", () => {
  it("takes have, be, do and get before their verb for auxiliaries", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("she/PRP has/VBZ/have spent/VBN/spend")).toEqual([
      false,
      true,
      false,
    ]);
    expect(aux("it/PRP is/VBZ/be going/VBG/go")[1]).toBe(true);
    expect(aux("is/VBZ/be being/VBG/be built/VBN/build")).toEqual([
      true,
      true,
      false,
    ]);
    expect(aux("does/VBZ/do harvey/NNP know/VB")[0]).toBe(true);
    expect(aux("did/VBD/do n't/RB go/VB")[0]).toBe(true);
    expect(aux("i/PRP had/VBD/have to/TO leave/VB")[1]).toBe(true);
    expect(aux("he/PRP got/VBD/get hurt/VBN/hurt")[1]).toBe(true);
  });
  it("takes no other use for an auxiliary", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    // "have" with an object, "to" after it: no auxiliary.
    expect(aux("we/PRP have/VBP a/DT lot/NN to/TO do/VB/do")[1]).toBe(false);
    expect(aux("i/PRP have/VBP the/DT car/NN")[1]).toBe(false);
    // A pause ends the search.
    expect(aux("it/PRP is/VBZ/be ,going/VBG/go")[1]).toBe(false);
  });
  it("tells how an inflected verb is used", () => {
    const verbal = (text: string) => usesOf(text).map((u) => u.verbal);
    expect(verbal("she/PRP decided/VBD/decide")[1]).toBe("finite");
    expect(verbal("has/VBZ/have spent/VBN/spend")[1]).toBe("aux");
    expect(verbal("we/PRP are/VBP/be going/VBG/go")[2]).toBe("aux");
    expect(verbal("we're/PRP going/VBG/go")[1]).toBe("aux");
    // Before a noun: an adjective.
    expect(verbal("a/DT demanding/VBG/demand job/NN")[1]).toBe(false);
    // be + a past participle without an agent: a state; with one, a passive.
    expect(verbal("it/PRP was/VBD/be established/VBN/establish")[2]).toBe(
      false,
    );
    expect(verbal("it/PRP was/VBD/be made/VBN/make by/IN them/PRP")[2]).toBe(
      "other",
    );
    expect(verbal("we're/PRP doomed/VBN/doom")[1]).toBe(false);
  });
  it("reads a gerund after a determiner or an adjective as a noun", () => {
    expect(usesOf("financial/JJ reporting/VBG/report")[1]?.label).toBe("noun");
    expect(usesOf("the/DT reporting/VBG/report")[1]?.label).toBe("noun");
    expect(usesOf("is/VBZ/be reporting/VBG/report")[1]).not.toHaveProperty(
      "label",
    );
  });
  it("finds where a participle may stand for a preposition", () => {
    const slot = (text: string) => usesOf(text).map((u) => u.prepositionSlot);
    expect(slot("including/VBG/include taxes/NN")[0]).toBe(true);
    expect(slot("costs/NN including/VBG/include taxes/NN")[1]).toBe(true);
    expect(slot("it/PRP rose/VBD/rise ,following/VBG/follow")[2]).toBe(true);
    expect(slot("we/PRP are/VBP/be including/VBG/include it/PRP")[2]).toBe(
      false,
    );
    expect(slot("the/DT table/NN")[0]).toBe(false);
  });
});

describe("englishTagger: role", () => {
  const roles = (text: string) => sentence(text).map(tagger.role);
  it("finds what opens a noun phrase, and determiners", () => {
    const [the, my, what, that, dog, three, harvey, it] = roles(
      "the/DT my/PRP$ what/WP that/DT dog/NN three/CD harvey/NNP it/PRP",
    );
    expect([the, my, what].map((r) => r!.determiner)).toEqual([
      true,
      true,
      true,
    ]);
    // "that" opens a clause as often as a noun phrase.
    expect(that).toMatchObject({ determiner: false, nounPhrase: false });
    expect(that!.object).toBe(true);
    expect([dog, three, harvey].map((r) => r!.nounPhrase)).toEqual([
      true,
      true,
      true,
    ]);
    expect(it).toMatchObject({ nounPhrase: false, subject: true });
  });
  it("finds objects, modals, the infinitive marker and prepositions", () => {
    const [him, can, does, dont, to, of, at] = roles(
      "him/PRP can/MD does/VBZ/do don't/VBP to/TO of/IN at/IN",
    );
    expect(him!.object).toBe(true);
    expect(can!.modal).toBe(true);
    expect(does!.modal).toBe(true);
    // "don't" is no headword's form of "do"; the tagger reads its "do".
    expect(dont!.modal).toBe(true);
    expect(to!.infinitive).toBe(true);
    expect(of).toMatchObject({ partitive: true, preposition: true });
    expect(at).toMatchObject({ partitive: false, preposition: true });
  });
  it("finds personal pronouns and possessives, not it", () => {
    const [you, your, it, its, the] = roles(
      "you/PRP your/PRP$ it/PRP its/PRP$ the/DT",
    );
    expect([you, your, it, its, the].map((r) => r!.personal)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
  it("finds be and past participles", () => {
    const [was, were, held, holds] = roles(
      "was/VBD/be we're/PRP held/VBN/hold holds/VBZ/hold",
    );
    expect(was!.be).toBe(true);
    expect(were!.be).toBe(true);
    expect(held!.pastParticiple).toBe(true);
    expect(holds!.pastParticiple).toBe(false);
  });
  it("reads nothing from a tag that is not trusted", () => {
    const [word] = sentence("the/DT");
    expect(tagger.role({ ...word!, trusted: false }).determiner).toBe(false);
  });
});

describe("trustedTag", () => {
  const sure = tagOf("NN", "noun");
  it("trusts a confident tag", () => {
    expect(trustedTag(sure, 5, "loaf", ["loaf"])).toBe(true);
    expect(trustedTag({ ...sure, confidence: 4.9 }, 5, "loaf", ["loaf"])).toBe(
      false,
    );
  });
  it("never trusts a proper-noun tag", () => {
    expect(trustedTag({ ...sure, proper: true }, 5, "deposit", [])).toBe(false);
  });
  it("needs an inflected form's tag to say so", () => {
    // "calmer" is not a headword: a bare noun tag cannot be right.
    expect(trustedTag(sure, 5, "calmer", ["calm"])).toBe(false);
    expect(trustedTag(T.VBD!, 5, "calmed", ["calm"])).toBe(true);
    expect(trustedTag(sure, 5, "dough", [])).toBe(true);
  });
});
