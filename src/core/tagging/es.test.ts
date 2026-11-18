import { describe, expect, it } from "vitest";
import { spanishTagger } from "./es";
import type { PerceptronModel } from "./perceptron";
import type { TaggedWord, TokenTag } from "./tagger";

/**
 * A model that knows some words for sure and scores the others from one feature: a
 * word ending in -ado is a participle (by a margin of 3), any other a noun (by 0).
 */
const MODEL: PerceptronModel = {
  tags: ["NOUN", "VERB.Part"],
  words: {
    del: "ADP",
    el: "DET",
    ha: "AUX.Fin",
    "d'": "ADP",
    madrid: "PROPN",
  },
  weights: { "s3 ado": [1, 30] },
  scale: 10,
};
const tagger = spanishTagger(MODEL);

describe("spanishTagger: tag", () => {
  it("tags each token as written, a contraction by its first word's tag", () => {
    expect(tagger.tag(["del", "Madrid", "d’"]).map((t) => t.tag)).toEqual([
      "ADP",
      "PROPN",
      "ADP",
    ]);
  });
  it("gives the dictionaries' part of speech, inflection and confidence", () => {
    const [el, ha, comprado, casa, madrid] = tagger.tag([
      "El",
      "ha",
      "comprado",
      "casa",
      "Madrid",
    ]);
    expect(el).toEqual({
      tag: "DET",
      label: "determiner",
      inflected: false,
      morph: true,
      proper: false,
      confidence: Infinity,
    });
    expect(ha).toMatchObject({ label: "verb", inflected: true });
    expect(comprado).toEqual({
      tag: "VERB.Part",
      label: "verb",
      inflected: true,
      morph: true,
      proper: false,
      confidence: 3,
    });
    expect(casa).toMatchObject({ label: "noun", confidence: 0 });
    expect(madrid).toMatchObject({ label: "noun", proper: true });
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
  DET: "determiner",
  ADP: "preposition",
  NUM: "numeral",
};

function tagOf(tag: string): TokenTag {
  return {
    tag,
    label: LABELS[tag.split(".")[0]!]!,
    inflected: /\.(Fin|Part|Ger)$/.test(tag),
    morph: true,
    proper: false,
    confidence: Infinity,
  };
}

/** Words "form/TAG[/base]", all trusted. */
function sentence(text: string): TaggedWord[] {
  return text.split(" ").map((item) => {
    const pause = item.startsWith(",");
    const [form, tag, ...bases] = item.replace(/^,/, "").split("/");
    return {
      form: form!,
      bases: bases.length > 0 ? bases : [form!],
      tag: tagOf(tag!),
      trusted: true,
      pauseBefore: pause,
    };
  });
}

const usesOf = (text: string) => tagger.uses(sentence(text));

describe("spanishTagger: uses", () => {
  it("takes an AUX before a participle, gerund or infinitive for an auxiliary", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("ha/AUX.Fin/haber comido/VERB.Part/comer")).toEqual([
      true,
      false,
    ]);
    expect(aux("está/AUX.Fin/estar lloviendo/VERB.Ger/llover")[0]).toBe(true);
    expect(aux("puede/AUX.Fin/poder venir/VERB.Inf")[0]).toBe(true);
    // Clitics and adverbs may stand between.
    expect(aux("no/ADV lo/PRON he/AUX.Fin/haber visto/VERB.Part/ver")[2]).toBe(
      true,
    );
  });
  it("takes no copula or verb for an auxiliary", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("es/AUX.Fin/ser importante/ADJ")[0]).toBe(false);
    expect(aux("tiene/VERB.Fin/tener comido/VERB.Part/comer")[0]).toBe(false);
    // A pause ends the search.
    expect(aux("ha/AUX.Fin/haber ,comido/VERB.Part/comer")[0]).toBe(false);
  });
  it("tells how an inflected verb is used", () => {
    const verbal = (text: string) => usesOf(text).map((u) => u.verbal);
    expect(verbal("creo/VERB.Fin/creer")[0]).toBe("finite");
    expect(verbal("ha/AUX.Fin/haber comido/VERB.Part/comer")[1]).toBe("aux");
    expect(verbal("está/AUX.Fin/estar lloviendo/VERB.Ger/llover")[1]).toBe(
      "aux",
    );
    // ser / estar + a participle without an agent: a state; with "por", a passive.
    expect(verbal("está/AUX.Fin/estar cerrado/VERB.Part/cerrar")[1]).toBe(
      false,
    );
    expect(
      verbal("fue/AUX.Fin/ser elegido/VERB.Part/elegir por/ADP todos/PRON")[1],
    ).toBe("other");
    expect(verbal("la/DET casa/NOUN")[1]).toBe(false);
  });
  it("finds no participle standing for a preposition", () => {
    expect(
      usesOf("incluido/VERB.Part/incluir el/DET precio/NOUN")[0]
        ?.prepositionSlot,
    ).toBe(false);
  });
});

describe("spanishTagger: role", () => {
  const roles = (text: string) => sentence(text).map(tagger.role);
  it("finds determiners and what opens a noun phrase", () => {
    const [el, casa, tres, que, de] = roles(
      "el/DET casa/NOUN tres/NUM que/PRON de/ADP",
    );
    expect(el).toMatchObject({ determiner: true, nounPhrase: true });
    expect([casa, tres].map((r) => r!.nounPhrase)).toEqual([true, true]);
    expect(que).toMatchObject({ nounPhrase: false, object: true });
    expect(de).toMatchObject({ preposition: true, partitive: true });
  });
  it("finds modals among the auxiliaries, not haber, ser or estar", () => {
    const [puede, ha, es, esta] = roles(
      "puede/AUX.Fin/poder ha/AUX.Fin/haber es/AUX.Fin/ser está/AUX.Fin/estar",
    );
    expect(puede!.modal).toBe(true);
    expect([ha, es, esta].map((r) => r!.modal)).toEqual([false, false, false]);
    expect([es, esta].map((r) => r!.be)).toEqual([true, true]);
  });
  it("finds personal pronouns and possessives, not the neuter lo", () => {
    const [yo, te, su, lo] = roles("yo/PRON te/PRON su/DET lo/PRON");
    expect([yo, te, su, lo].map((r) => r!.personal)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
  it("finds past participles, and no infinitive marker", () => {
    const [comido, comer] = roles("comido/VERB.Part/comer comer/VERB.Inf");
    expect(comido!.pastParticiple).toBe(true);
    expect(comer).toMatchObject({ pastParticiple: false, infinitive: false });
  });
  it("reads nothing from a tag that is not trusted", () => {
    const [word] = sentence("el/DET");
    expect(tagger.role({ ...word!, trusted: false }).determiner).toBe(false);
  });
});
