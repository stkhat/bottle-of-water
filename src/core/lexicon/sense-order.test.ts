import { describe, expect, it } from "vitest";
import type { Sense } from "./lookup";
import {
  accepts,
  AUXILIARY,
  inOrder,
  lacksSenseOf,
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
    // An edition's sense the data build labelled an auxiliary's (es "haber").
    const esHave: Sense[] = [
      { pos: "verb", text: "tener" },
      { pos: "auxiliary", text: "haber (como verbo auxiliar)" },
    ];
    expect(senseOrder(esHave, AUXILIARY)).toEqual([1, 0]);
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
