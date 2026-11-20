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
  SCONJ: "conjunction",
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
  it("takes ser for an auxiliary only before a participle, the passive", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("fue/AUX.Fin/ser cancelado/VERB.Part/cancelar")[0]).toBe(true);
    // The copula of a clause: "lo que quiero es sacar", "era ser escuchado".
    expect(aux("es/AUX.Fin/ser sacar/VERB.Inf")[0]).toBe(false);
    expect(aux("era/AUX.Fin/ser ser/AUX.Inf/ser escuchado/VERB.Part")).toEqual([
      false,
      true,
      false,
    ]);
    // A form ser shares with ir is ir before a gerund: "fue creciendo".
    expect(
      usesOf("fue/AUX.Fin/ser/ir creciendo/VERB.Ger/crecer")[0],
    ).toMatchObject({ auxiliary: true, base: "ir" });
    expect(aux("es/AUX.Fin/ser creciendo/VERB.Ger/crecer")[0]).toBe(false);
  });
  it("reads a verb before an infinitive with the word that introduces it", () => {
    const construction = (text: string) =>
      usesOf(text).map((u) => u.construction);
    expect(
      construction("tengo/VERB.Fin/tener que/SCONJ irme/VERB.Inf/ir"),
    ).toEqual(["que", undefined, undefined]);
    expect(construction("vamos/AUX.Fin/ir a/ADP ver/VERB.Inf")[0]).toBe("a");
    expect(construction("suele/VERB.Fin/soler venir/VERB.Inf")[0]).toBe("");
    // No infinitive, or a pause before it.
    expect(construction("voy/VERB.Fin/ir a/ADP casa/NOUN")[0]).toBeUndefined();
    expect(construction("tengo/VERB.Fin/tener que/SCONJ ,ir/VERB.Inf")[0]).toBe(
      undefined,
    );
  });
  it("reads a sentence's first word tagged as a name for its capital as its verb before an infinitive", () => {
    const named = (
      form: string,
      bases: string[],
      lower: string,
    ): TaggedWord => ({
      form,
      bases,
      tag: { ...tagOf("NOUN"), tag: "PROPN", proper: true, confidence: 5 },
      trusted: false,
      pauseBefore: false,
      lowerTag: tagOf(lower),
    });
    const venir = sentence("venir/VERB.Inf");
    expect(
      tagger.uses([
        named("suelo", ["suelo", "soler"], "VERB.Fin"),
        ...venir,
      ])[0],
    ).toMatchObject({ construction: "", base: "soler", grammarPos: "verb" });
    // In lower case no verb: "Para hacer", "Disculpas por venir".
    const hacer = sentence("hacer/VERB.Inf");
    expect(
      tagger.uses([named("para", ["para", "parar"], "ADP"), ...hacer])[0]
        ?.construction,
    ).toBeUndefined();
    // No infinitive after it.
    const casa = sentence("a/ADP casa/NOUN");
    expect(
      tagger.uses([named("tengo", ["tener"], "VERB.Fin"), ...casa])[0]
        ?.construction,
    ).toBeUndefined();
  });
  it("reads a pronoun que as the relative, shown by the conjunction", () => {
    expect(
      usesOf("cosa/NOUN que/PRON quiero/VERB.Fin/querer")[1],
    ).toMatchObject({
      grammarPos: "conjunction",
    });
    expect(usesOf("que/SCONJ venga/VERB.Fin/venir")[0]?.grammarPos).toBe(
      undefined,
    );
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
  it("reads a clitic that is also an article, with no verb after it, as the article", () => {
    const label = (text: string, i: number) => usesOf(text)[i]?.label;
    expect(label("lo/PRON que/PRON dijo/VERB.Fin/decir", 0)).toBe("determiner");
    expect(label("lo/PRON mejor/ADJ", 0)).toBe("determiner");
    expect(label("lo/PRON de/ADP ayer/ADV", 0)).toBe("determiner");
    // Before its verb, or another clitic, it is the pronoun.
    expect(label("lo/PRON dijo/VERB.Fin/decir", 0)).toBeUndefined();
    expect(label("lo/PRON he/AUX.Fin/haber visto/VERB.Part/ver", 0)).toBe(
      undefined,
    );
    expect(label("se/PRON lo/PRON dio/VERB.Fin/dar", 1)).toBeUndefined();
    // A noun after it is more often a verb the tagger missed; a pause ends the clause.
    expect(label("lo/PRON explico/NOUN", 0)).toBeUndefined();
    expect(label("no/ADV lo/PRON ,bueno/ADJ", 1)).toBeUndefined();
    // Clitics that are no article stay pronouns.
    expect(label("te/PRON mejor/ADJ", 0)).toBeUndefined();
  });
  it("reads a form ser shares with another verb as that verb where ser cannot stand", () => {
    const use = (text: string, i: number) => usesOf(text)[i];
    const fue = "fue/VERB.Fin/ser/ir";
    expect(use(`se/PRON ${fue} con/ADP`, 1)).toMatchObject({
      base: "ir",
      pronominal: true,
    });
    expect(use(`me/PRON ${fue} bien/ADV`, 1)).toMatchObject({ base: "ir" });
    expect(use(`le/PRON ${fue} bien/ADV`, 1)?.pronominal).toBeUndefined();
    expect(use(`${fue} a/ADP ver/VERB.Inf`, 0)).toMatchObject({ base: "ir" });
    expect(use(`${fue} a/ADP ver/VERB.Inf`, 0)?.pronominal).toBeUndefined();
    // The copula: an attribute "lo", a complement, a pause before "a".
    expect(use(`lo/PRON ${fue} para/ADP`, 1)?.base).toBeUndefined();
    expect(use(`${fue} importante/ADJ`, 0)?.base).toBeUndefined();
    expect(use(`${fue} ,a/ADP`, 0)?.base).toBeUndefined();
    // A form of ser alone.
    expect(use("se/PRON es/AUX.Fin/ser", 1)?.base).toBeUndefined();
    expect(use("se/PRON es/AUX.Fin/ser/e", 1)?.base).toBeUndefined();
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
