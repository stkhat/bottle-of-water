import { describe, expect, it } from "vitest";
import { frenchTagger } from "./fr";
import type { PerceptronModel } from "./perceptron";
import type { TaggedWord, TokenTag } from "./tagger";

/** A model that knows a few words for sure and tags every other one as a noun it is not sure of. */
const MODEL: PerceptronModel = {
  tags: ["NOUN", "VERB.Fin"],
  words: { du: "ADP", "l'": "DET", est: "AUX.Fin" },
  weights: {},
  scale: 10,
};
const tagger = frenchTagger(MODEL);

describe("frenchTagger: tag", () => {
  it("tags each token as written, ’ as '", () => {
    expect(tagger.tag(["du", "l’", "est", "pain"])).toEqual([
      expect.objectContaining({ tag: "ADP", label: "preposition" }),
      expect.objectContaining({ tag: "DET", label: "determiner" }),
      expect.objectContaining({ tag: "AUX.Fin", inflected: true }),
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
};

function tagOf(tag: string): TokenTag {
  return {
    tag,
    label: LABELS[tag.split(".")[0]!]!,
    inflected: /\.(Fin|Part|Ger)$/.test(tag),
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

describe("frenchTagger: uses", () => {
  it("takes avoir or être before a participle or infinitive for an auxiliary", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("a/AUX.Fin/a/avoir mangé/VERB.Part/manger")).toEqual([
      true,
      false,
    ]);
    // Reflexive être, the negation and object pronouns between.
    expect(aux("s'/PRON est/AUX.Fin/est/être levé/VERB.Part/lever")[1]).toBe(
      true,
    );
    expect(
      aux("n'/ADV l'/PRON a/AUX.Fin/a/avoir pas/ADV vu/VERB.Part/vu/voir")[2],
    ).toBe(true);
    // A copula, a pause.
    expect(aux("est/AUX.Fin/est/être grand/ADJ")[0]).toBe(false);
    expect(aux("a/AUX.Fin/a/avoir ,mangé/VERB.Part/manger")[0]).toBe(false);
  });
  it("takes aller before an infinitive for an auxiliary: the near future", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("vais/VERB.Fin/aller le/PRON faire/VERB.Inf/faire")[0]).toBe(
      true,
    );
    expect(aux("va/VERB.Fin/va/aller à/ADP Paris/PROPN")[0]).toBe(false);
    expect(aux("veut/VERB.Fin/vouloir partir/VERB.Inf")[0]).toBe(false);
  });
  it("takes pouvoir and devoir for modal auxiliaries, but after a reflexive pronoun", () => {
    const aux = (text: string) => usesOf(text).map((u) => u.auxiliary);
    expect(aux("peux/VERB.Fin/pouvoir pas/ADV venir/VERB.Inf")[0]).toBe(true);
    expect(aux("doit/VERB.Fin/devoir partir/VERB.Inf")[0]).toBe(true);
    expect(
      aux("a/AUX.Fin/avoir pu/VERB.Part/pouvoir le/PRON voir/VERB.Inf")[1],
    ).toBe(true);
    // The infinitive left unsaid ("oui, je peux"), an object ("j'en peux plus").
    expect(aux("je/PRON peux/VERB.Fin/pouvoir")[1]).toBe(true);
    expect(aux("tu/PRON peux/VERB.Fin/pouvoir pas/ADV ,non/ADV")[1]).toBe(true);
    expect(aux("j'/PRON en/PRON peux/ADJ/pouvoir plus/ADV")[2]).toBe(true);
    // The impersonal "il se peut"; the noun.
    expect(aux("il/PRON se/PRON peut/VERB.Fin/pouvoir")[2]).toBe(false);
    expect(aux("le/DET pouvoir/NOUN")[1]).toBe(false);
    expect(aux("les/DET devoirs/VERB.Fin/devoir")[1]).toBe(false);
    expect(aux("pour/ADP pouvoir/VERB.Inf partir/VERB.Inf")[1]).toBe(true);
    expect(aux("tu/DET peux/VERB.Fin/pouvoir ,tu/PRON")[1]).toBe(true);
    // A form only of a modal whatever the tags ("tu peux faire", "on peut l'écrire");
    // one that is a word of its own as a verb only ("puis": then).
    expect(aux("tu/PRON peux/ADJ/pouvoir faire/VERB.Inf")[1]).toBe(true);
    expect(aux("on/PRON peut/VERB.Fin/pouvoir l'/DET écrire/NOUN")[1]).toBe(
      true,
    );
    expect(aux("puis/ADV?/puis/pouvoir partir/VERB.Inf")[0]).toBe(false);
  });
  it("tells how a verb is used: a participle after avoir is a compound tense", () => {
    const verbal = (text: string) => usesOf(text).map((u) => u.verbal);
    expect(verbal("dit/VERB.Fin/dit/dire")[0]).toBe("finite");
    expect(verbal("a/AUX.Fin/a/avoir dit/VERB.Part/dit/dire")[1]).toBe("aux");
    expect(verbal("pour/ADP voir/VERB.Inf")[1]).toBe("other");
    expect(verbal("la/DET maison/NOUN")[1]).toBe(false);
  });
  it("reads être + participle as a compound tense for verbs that take être and reflexives, else a state", () => {
    const use = (text: string, i: number) => usesOf(text)[i];
    expect(
      use("est/AUX.Fin/est/être venu/VERB.Part/venu/venir", 1)?.verbal,
    ).toBe("aux");
    expect(
      use("s'/PRON est/AUX.Fin/est/être levé/VERB.Part/lever", 2)?.verbal,
    ).toBe("aux");
    expect(
      use("me/PRON le/PRON suis/AUX.Fin/être dit/VERB.Part/dit/dire", 3)
        ?.verbal,
    ).toBe("aux");
    expect(
      use("vous/PRON vous/PRON êtes/AUX.Fin/être vus/VERB.Part/voir", 3)
        ?.verbal,
    ).toBe("aux");
    // A state reads as an adjective; with an agent, a passive.
    expect(
      use("suis/AUX.Fin/être désolé/VERB.Part/désolé/désoler", 1),
    ).toMatchObject({ verbal: false, grammarPos: "adjective" });
    expect(
      use("vous/PRON êtes/AUX.Fin/être fatigué/VERB.Part/fatigué/fatiguer", 2)
        ?.verbal,
    ).toBe(false);
    // After "été", a passive.
    expect(
      use("été/AUX.Part/été/être blessé/VERB.Part/blessé/blesser", 1)?.verbal,
    ).toBe("other");
    expect(
      use("est/AUX.Fin/est/être construit/VERB.Part/construire par/ADP", 1)
        ?.verbal,
    ).toBe("other");
  });
  it("reads a verb form right after a determiner or preposition as a noun", () => {
    const use = (text: string, i: number) => usesOf(text)[i];
    expect(use("l'/DET été/AUX.Part/été/être", 1)).toMatchObject({
      label: "noun",
      verbal: "other",
    });
    expect(use("d'/ADP été/AUX.Part/été/être", 1)?.label).toBe("noun");
    expect(use("le/DET fait/VERB.Part/fait/faire que/SCONJ", 1)?.base).toBe(
      undefined,
    );
    // An infinitive after a preposition, a pronoun before a verb, an untrusted determiner.
    expect(use("de/ADP faire/VERB.Inf", 1)?.label).toBeUndefined();
    expect(use("l'/PRON est/AUX.Fin/est/être", 1)?.label).toBeUndefined();
    expect(use("l'/DET? est/AUX.Fin/est/être", 1)?.label).toBeUndefined();
  });
  it("gives a negation word its part of speech with ne, trusted or not", () => {
    const pos = (text: string, i: number) => usesOf(text)[i]?.grammarPos;
    expect(pos("ne/ADV connais/VERB.Fin personne/NOUN?", 2)).toBe("pronoun");
    expect(pos("n'/ADV y/PRON a/VERB.Fin/a/avoir rien/PRON", 3)).toBe(
      "pronoun",
    );
    expect(pos("personne/NOUN ne/ADV sait/VERB.Fin", 0)).toBe("pronoun");
    expect(pos("je/PRON ne/ADV sais/VERB.Fin pas/ADV", 3)).toBe("adverb");
    // No "ne", or "ne" in another clause.
    expect(pos("une/DET personne/NOUN", 1)).toBeUndefined();
    expect(pos("ne/ADV pars/VERB.Fin ,personne/NOUN", 2)).toBeUndefined();
  });
  it("decides the base of a closed class of verb forms whatever the tag's margin", () => {
    const base = (text: string, i: number) => usesOf(text)[i]?.base;
    // Tagged AUX, trusted or not.
    expect(base("on/PRON est/AUX.Fin?/est/être là/ADV", 1)).toBe("être");
    expect(base("je/PRON suis/AUX.Fin/être/suivre", 1)).toBe("être");
    // A form of avoir or être with no trusted tag.
    expect(base("Est/PROPN?/est/être ce/PRON", 0)).toBe("être");
    // After a subject pronoun and object pronouns, whatever the tag.
    expect(base("tu/PRON les/PRON as/NOUN/as/avoir", 2)).toBe("avoir");
    expect(usesOf("tu/PRON les/PRON as/NOUN/as/avoir")[2]?.grammarPos).toBe(
      "verb",
    );
    expect(base("les/DET as/NOUN/as/avoir", 1)).toBeUndefined();
    // A participle whose auxiliary is avoir; not one after être.
    expect(base("as/AUX.Fin/as/avoir fait/VERB.Part?/fait/faire", 1)).toBe(
      "faire",
    );
    expect(
      base(
        "ai/AUX.Fin/avoir été/AUX.Part/été/être lâche/VERB.Part?/lâche/lâcher",
        2,
      ),
    ).toBeUndefined();
    expect(
      base("est/AUX.Fin/est/être parfait/VERB.Part?/parfait/parfaire", 1),
    ).toBeUndefined();
    // Any verb form right after a subject pronoun, not a pronoun.
    expect(base("tu/PRON joues/NOUN/joue/jouer", 1)).toBe("jouer");
    expect(base("je/PRON me/PRON sens/NOUN/sens/sentir", 2)).toBe("sentir");
    expect(base("je/PRON lui/PRON/lui/luire", 1)).toBeUndefined();
    expect(base("ce/DET livre/NOUN/livre/livrer", 1)).toBeUndefined();
    // After a pronoun that stands only before a verb, whatever its subject ("cette
    // journée me fatigue", "ne marche pas"), or ça where a clause starts; a verb tag
    // the tagger is unsure of too.
    expect(base("journée/NOUN me/PRON fatigue/NOUN/fatigue/fatiguer", 2)).toBe(
      "fatiguer",
    );
    expect(base("ne/ADV marche/NOUN/marche/marcher", 1)).toBe("marcher");
    expect(base("mais/CCONJ ça/PRON marche/NOUN/marche/marcher", 2)).toBe(
      "marcher",
    );
    expect(base("ça/PRON fait/VERB.Fin?/fait/faire", 1)).toBe("faire");
    // Not ça after a verb or adverb (its object), nor the negation's word.
    expect(
      base("trouve/VERB.Fin toujours/ADV ça/PRON plus/ADV/plus/plaire", 3),
    ).toBeUndefined();
    expect(
      base("ne/ADV plus/ADV/plus/plaire se/PRON demander/VERB.Inf", 1),
    ).toBeUndefined();
    // aller before an infinitive.
    expect(base("va/VERB.Fin?/va/aller pleuvoir/VERB.Inf", 0)).toBe("aller");
    // A verb form the tagger is unsure of after avoir, adverbs and pronouns between,
    // is its participle; not before de or à (avoir's idioms), nor after avoir's own
    // participle. A causative faire before an infinitive.
    expect(
      base("vous/PRON avez/AUX.Fin/avoir fait/NOUN?/fait/faire ,ce/PRON", 2),
    ).toBe("faire");
    expect(
      base("l'/PRON as/AUX.Fin/avoir mal/ADV fait/NOUN?/fait/faire", 3),
    ).toBe("faire");
    expect(
      base("as/VERB.Fin/avoir pas/ADV envie/NOUN?/envie/envier de/ADP", 2),
    ).toBeUndefined();
    expect(
      base(
        "avais/AUX.Fin/avoir eu/VERB.Part/eu/avoir entrée/NOUN?/entrée/entrer",
        2,
      ),
    ).toBeUndefined();
    expect(base("la/PRON fait/NOUN?/fait/faire naître/VERB.Inf", 1)).toBe(
      "faire",
    );
    // Not after a determiner or preposition: "l'été", "en été".
    expect(base("l'/DET été/AUX.Part/été/être", 1)).toBeUndefined();
    expect(base("en/ADP été/VERB.Part?/été/être", 1)).toBeUndefined();
    // A noun tag there stands however unsure ("vers l'Est"), but not after a subject
    // pronoun, whose object pronoun the tagger read as the determiner ("tu l'as").
    expect(base("vers/ADP l'/DET est/NOUN?/est/être", 2)).toBeUndefined();
    expect(base("tu/PRON l'/DET as/NOUN?/as/avoir", 2)).toBe("avoir");
  });
  it("reads a word the tagger is unsure of after être as a copula as an adjective", () => {
    const pos = (text: string, i: number) => usesOf(text)[i]?.grammarPos;
    expect(pos("c'/PRON est/AUX.Fin/être nul/NOUN?", 2)).toBe("adjective");
    expect(pos("c'/PRON était/AUX.Fin/être vraiment/ADV nul/NOUN?", 3)).toBe(
      "adjective",
    );
    // A trusted tag, an auxiliary, a pause.
    expect(pos("c'/PRON est/AUX.Fin/être moi/PRON", 2)).toBeUndefined();
    expect(pos("est/AUX.Fin/être venu/VERB.Part?/venu/venir", 1)).not.toBe(
      "adjective",
    );
    expect(pos("est/AUX.Fin/être ,nul/NOUN?", 1)).toBeUndefined();
  });
  it("finds a participle standing for a preposition at a clause's start or after a noun", () => {
    const slot = (text: string, i: number) => usesOf(text)[i]?.prepositionSlot;
    expect(slot("vu/VERB.Part/vu/voir la/DET situation/NOUN", 0)).toBe(true);
    expect(slot("frais/NOUN compris/VERB.Part/compris/comprendre", 1)).toBe(
      true,
    );
    expect(slot("a/AUX.Fin/a/avoir vu/VERB.Part/vu/voir", 1)).toBe(false);
  });
});

describe("frenchTagger: role", () => {
  const roles = (text: string) => sentence(text).map(tagger.role);
  it("finds determiners, noun phrases, prepositions and the partitive de", () => {
    const [le, chat, que, de] = roles("le/DET chat/NOUN que/PRON d'/ADP");
    expect(le).toMatchObject({ determiner: true, nounPhrase: true });
    expect(chat!.nounPhrase).toBe(true);
    expect(que).toMatchObject({ nounPhrase: false, object: true });
    expect(de).toMatchObject({ preposition: true, partitive: true });
  });
  it("finds modals among the auxiliaries, not avoir or être", () => {
    const [fait, a, est] = roles(
      "fait/AUX.Fin/faire a/AUX.Fin/a/avoir est/AUX.Fin/est/être",
    );
    expect([fait, a, est].map((r) => r!.modal)).toEqual([true, false, false]);
    expect(est!.be).toBe(true);
  });
  it("finds personal pronouns and possessives, not the neuter ça or en", () => {
    const personal = roles("je/PRON t'/PRON son/DET ça/PRON en/PRON").map(
      (r) => r.personal,
    );
    expect(personal).toEqual([true, true, true, false, false]);
  });
  it("finds past participles, and no infinitive marker", () => {
    const [vu, voir] = roles("vu/VERB.Part/voir voir/VERB.Inf");
    expect(vu!.pastParticiple).toBe(true);
    expect(voir).toMatchObject({ pastParticiple: false, infinitive: false });
  });
});

describe("frenchTagger: pronominal verbs and the relative que", () => {
  const use = (text: string, i: number) => usesOf(text)[i]!;
  it("reads a verb after a reflexive pronoun that agrees with its subject as pronominal", () => {
    expect(
      use("il/PRON se/PRON rend/VERB.Fin/rend/rendre compte/NOUN", 2)
        .pronominal,
    ).toBe(true);
    expect(
      use("je/PRON me/PRON suis/AUX.Fin/suis/être rendu/VERB.Part/rendre", 3)
        .pronominal,
    ).toBe(true);
    // "me" with another subject is an object.
    expect(
      use("ça/PRON me/PRON fait/VERB.Fin/fait/faire plaisir/NOUN", 2)
        .pronominal,
    ).toBeUndefined();
  });
  it("reads que after its antecedent as the relative pronoun, by the conjunction's senses", () => {
    expect(
      use("la/DET chose/NOUN qu'/PRON il/PRON dit/VERB.Fin/dire", 2).grammarPos,
    ).toBe("conjunction");
    // After a neuter pronoun it is "what"; before an inverted verb, a question.
    expect(
      use("ce/PRON qu'/PRON il/PRON dit/VERB.Fin/dire", 1).grammarPos,
    ).toBeUndefined();
    expect(
      use("chose/NOUN qu'/PRON est/AUX.Fin/être ce/PRON que/PRON", 1)
        .grammarPos,
    ).toBeUndefined();
  });
});
