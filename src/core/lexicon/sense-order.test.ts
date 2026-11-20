import { describe, expect, it } from "vitest";
import type { Sense } from "./lookup";
import {
  accepts,
  AUXILIARY,
  constructionPos,
  inOrder,
  lacksSenseOf,
  PRONOMINAL,
  PRONOMINAL_ACCUSATIVE,
  PRONOMINAL_DATIVE,
  senseOrder,
} from "./sense-order";

/** Senses from "text:pos[~|?][*]" items ("~" a weak guess, "?" from the neighbours, "*" core). */
const senses = (...items: string[]): Sense[] =>
  items.map((item) => {
    const [text, label = ""] = item.split(":");
    const pos = label.replace(/[~?*]/g, "");
    return {
      text: text!,
      ...(pos && { pos }),
      ...(label.includes("~") && { posBy: "weak" as const }),
      ...(label.includes("?") && { posBy: "gap" as const }),
      ...(label.includes("*") && { core: true as const }),
    };
  });

const shown = (list: Sense[], pos: string) =>
  inOrder(list, senseOrder(list, pos)).map((sense) => sense.text);

describe("senseOrder (rule A2)", () => {
  // EJDict's "fine": 罰金 (a noun guess), …を科する (a verb), りっぱな (core adjectives).
  const fine = senses(
    "罰金:noun~",
    "罰金を科する:verb",
    "みごとな:adjective",
    "りっぱな:adjective*",
    "優れた:adjective?",
  );
  it("shows the tagged part of speech's senses first when the first sense says another, its core one leading", () => {
    expect(shown(fine, "adjective")).toEqual([
      "りっぱな",
      "みごとな",
      "優れた",
      "罰金",
      "罰金を科する",
    ]);
    expect(shown(fine, "verb")).toEqual([
      "罰金を科する",
      "罰金",
      "みごとな",
      "りっぱな",
      "優れた",
    ]);
  });
  it("keeps the order when the first sense fits the tag", () => {
    expect(senseOrder(fine, "noun")).toBeUndefined();
    // A tagged pronoun or proper noun counts as a noun sense ("nothing").
    expect(accepts("noun", "pronoun")).toBe(true);
    expect(accepts("preposition", "conjunction")).toBe(true);
    expect(accepts("adverb", "adjective")).toBe(false);
  });
  it("keeps the order without evidence against the first sense", () => {
    // Unlabelled, or labelled from its neighbours.
    expect(
      senseOrder(senses("正しい", "単に:adverb"), "adverb"),
    ).toBeUndefined();
    expect(
      senseOrder(senses("正しい:adjective?", "単に:adverb"), "adverb"),
    ).toBeUndefined();
    // A noun guess also fits an adverb (今, 現在).
    expect(
      senseOrder(senses("現在:noun~", "今:adverb"), "adverb"),
    ).toBeUndefined();
    // No sense of the tagged part of speech.
    expect(
      senseOrder(senses("罰金:noun", "優れた:adjective"), "verb"),
    ).toBeUndefined();
  });
  it("takes the unlabelled senses right before the tagged block into it", () => {
    // EJDict's "attempt": 企てる (a verb), then 企て,試み unlabelled before its nouns.
    const attempt = senses("企てる:verb", "企て", "攻撃:noun~", "未遂");
    expect(shown(attempt, "noun")).toEqual(["企て", "攻撃", "企てる", "未遂"]);
  });
  it("starts from the first usable sense", () => {
    const list = senses("(empty)", "罰金:noun", "りっぱな:adjective");
    expect(senseOrder(list, "adjective", (i) => i > 0)).toEqual([2, 0, 1]);
  });
  it("puts an auxiliary's senses its source calls auxiliary first", () => {
    // en-it "have": a translation table's senses, with their English senses.
    const have: Sense[] = [
      { pos: "verb", text: "avere, tenere", hint: "1. to possess" },
      { pos: "verb", text: "farsi", hint: "15. engage in sexual intercourse" },
      {
        pos: "verb",
        text: "avere, essere",
        hint: "10. auxiliary used in forming the perfect",
      },
    ];
    expect(senseOrder(have, AUXILIARY)).toEqual([2, 0, 1]);
    expect(senseOrder(have, "verb")).toBeUndefined();
    // None, or one first already: the dictionary's order.
    expect(senseOrder(have.slice(0, 2), AUXILIARY)).toBeUndefined();
    expect(senseOrder(have.slice(2), AUXILIARY)).toBeUndefined();
    // A definitions pack marks them (French avoir: "used to form the compound tenses").
    const avoir: Sense[] = [
      { pos: "verb", text: "to have; to own" },
      {
        pos: "verb",
        text: "used to form the compound tenses",
        auxiliary: true,
      },
    ];
    expect(senseOrder(avoir, AUXILIARY)).toEqual([1, 0]);
    expect(senseOrder(avoir, "verb")).toBeUndefined();
    // An edition's sense the data build labelled an auxiliary's (es "haber").
    const esHave: Sense[] = [
      { pos: "verb", text: "tener" },
      { pos: "auxiliary", text: "haber (como verbo auxiliar)" },
    ];
    expect(senseOrder(esHave, AUXILIARY)).toEqual([1, 0]);
  });
  it("reads an auxiliary with no sense its source calls auxiliary as the verb it is", () => {
    // French devoir before an infinitive: "must", not the noun "duty".
    const devoir = senses("duty:noun", "homework:noun", "must:verb");
    expect(senseOrder(devoir, AUXILIARY)).toEqual([2, 0, 1]);
    // A verb's lead, or a closed class's: the dictionary's order.
    expect(
      senseOrder(senses("must:verb", "duty:noun"), AUXILIARY),
    ).toBeUndefined();
    expect(
      senseOrder(senses("can:particle", "know:verb"), AUXILIARY),
    ).toBeUndefined();
  });
});

describe("senseOrder for a pronominal verb", () => {
  it("puts the senses labelled reflexive first, else reads it as a verb", () => {
    // French passer: "il se passe" → to happen; "il passe" → to pass.
    const passer = senses(
      "to pass:verb",
      "to spend:verb",
      "to happen:reflexive",
    );
    expect(senseOrder(passer, PRONOMINAL)).toEqual([2, 0, 1]);
    expect(senseOrder(passer, "verb")).toBeUndefined();
    // Leading already; none labelled so (a verb whose pronoun is its object).
    expect(
      senseOrder(senses("to remember:reflexive", "memory:noun"), PRONOMINAL),
    ).toBeUndefined();
    expect(senseOrder(senses("duty:noun", "must:verb"), PRONOMINAL)).toEqual([
      1, 0,
    ]);
  });
  it("puts a pronominal verb's senses of its pronoun's case first", () => {
    const vorstellen = senses(
      "to introduce:verb",
      "to introduce oneself:reflexive",
      "to imagine:dative reflexive",
    );
    expect(senseOrder(vorstellen, PRONOMINAL_DATIVE)).toEqual([2, 0, 1]);
    expect(senseOrder(vorstellen, PRONOMINAL_ACCUSATIVE)).toEqual([1, 0, 2]);
    expect(senseOrder(vorstellen, PRONOMINAL)).toEqual([1, 2, 0]);
    // None of that case: the verb's own order.
    expect(
      senseOrder(
        senses("to make:verb", "to fare:reflexive"),
        PRONOMINAL_DATIVE,
      ),
    ).toBeUndefined();
  });
  it("puts a pronoun's senses of its number first", () => {
    const sie: Sense[] = [
      { text: "she; her", pos: "pronoun", number: "singular" },
      { text: "they; them", pos: "pronoun", number: "plural" },
      { text: "you (polite)", pos: "pronoun" },
    ];
    expect(senseOrder(sie, "pronoun plural")).toEqual([1, 2, 0]);
    expect(senseOrder(sie, "pronoun singular")).toBeUndefined();
    // No pronoun sense of that number: the dictionary's order ("es sind").
    expect(
      senseOrder(
        [
          { text: "it", pos: "pronoun", number: "singular" },
          { text: "the", pos: "article" },
        ],
        "pronoun plural",
      ),
    ).toBeUndefined();
  });
});

describe("senseOrder for a verb before an infinitive", () => {
  /** Senses from "text:pos:construction" items (construction words joined by "|"). */
  const said = (...items: string[]): Sense[] =>
    items.map((item) => {
      const [text, pos, words] = item.split(":");
      return {
        text: text!,
        pos: pos!,
        ...(words !== undefined && { construction: words.split("|") }),
      };
    });
  const tener = said(
    "to have:verb",
    "to hold:verb",
    "to have to:verb:que",
    "to be necessary:verb:que",
  );
  it("puts the senses said with the word that introduces it first", () => {
    expect(shown(tener, constructionPos("verb", "que"))).toEqual([
      "to have to",
      "to be necessary",
      "to have",
      "to hold",
    ]);
    // Another word, or none: the verb's order.
    expect(shown(tener, constructionPos("verb", "de"))).toEqual(
      tener.map((sense) => sense.text),
    );
    const ir = said(
      "to go:verb",
      "to go on (doing something):auxiliary",
      "to be going to:auxiliary:a",
    );
    expect(shown(ir, constructionPos("verb", "a"))[0]).toBe("to be going to");
  });
  it("keeps a lead that already gives each of its items", () => {
    const empezar = said(
      "to start, begin, to get started:verb",
      "to start:verb:a",
    );
    expect(shown(empezar, constructionPos("verb", "a"))[0]).toBe(
      "to start, begin, to get started",
    );
  });
  it("keeps an auxiliary's lead before a bare infinitive, where the tag reads a verb", () => {
    const soler = said(
      "to be accustomed to doing something:auxiliary",
      "used to:verb",
    );
    expect(shown(soler, "verb")[0]).toBe("used to");
    expect(shown(soler, constructionPos("verb", ""))[0]).toBe(
      "to be accustomed to doing something",
    );
    const dejar = said(
      "to leave:verb",
      "to leave (to cause, result in):auxiliary",
    );
    expect(shown(dejar, constructionPos("verb", ""))[0]).toBe("to leave");
  });
  it("takes a pronominal verb's sense only where the verb reads as pronominal", () => {
    const mettre = said("to put:verb", "to start:reflexive:à");
    expect(shown(mettre, constructionPos("verb", "à"))[0]).toBe("to put");
    expect(shown(mettre, constructionPos(PRONOMINAL, "à"))[0]).toBe("to start");
  });
});

describe("lacksSenseOf", () => {
  it("says so only when every sense states another part of speech", () => {
    // pt "other": only the verb "tratar como diferente".
    expect(lacksSenseOf(senses("tratar:verb"), "adjective")).toBe(true);
    expect(
      lacksSenseOf(senses("tratar:verb", "outro:adjective"), "adjective"),
    ).toBe(false);
    // A label guessed or taken from neighbours, or none: no evidence.
    expect(lacksSenseOf(senses("tratar:verb", "outro"), "adjective")).toBe(
      false,
    );
    expect(lacksSenseOf(senses("tratar:verb~"), "adjective")).toBe(false);
    expect(lacksSenseOf([], "adjective")).toBe(false);
    // An auxiliary's senses are labelled verbs.
    expect(lacksSenseOf(senses("ter:verb"), AUXILIARY)).toBe(false);
    // Closed classes are labelled differently by the tagger and the sources.
    expect(lacksSenseOf(senses("todo:adjective"), "determiner")).toBe(false);
    expect(lacksSenseOf(senses("segundo:numeral"), "adjective")).toBe(false);
  });
});
