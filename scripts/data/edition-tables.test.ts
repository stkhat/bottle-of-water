import { describe, expect, it } from "vitest";
import type { KaikkiEntry } from "./common.ts";
import { GERMAN_WORD } from "./de-frequency.ts";
import {
  slimForms,
  tableForms,
  tablesEntry,
  translationSenses,
} from "./edition-tables.ts";

const entry = (fields: Partial<KaikkiEntry>): KaikkiEntry => ({
  word: "Widder",
  lang_code: "de",
  pos: "noun",
  ...fields,
});

describe("tableForms", () => {
  it("reads an inflection table's single words, without an article in brackets or the imperative's !", () => {
    const forms = tableForms(
      entry({
        word: "laufen",
        pos: "verb",
        forms: [
          { form: "läuft", tags: ["present"] },
          { form: "lauf!", tags: ["imperative", "singular"] },
          { form: "(das) Laufen", tags: ["nominative", "singular"] },
          { form: "gelaufen sein", tags: ["infinitive", "perfect"] },
          { form: "laufen", tags: ["infinitive"] },
        ],
      }),
      GERMAN_WORD,
    );
    expect(forms).toEqual(["läuft", "lauf"]);
  });
  it("leaves out abbreviations, auxiliaries and variants", () => {
    expect(
      tableForms(
        entry({
          forms: [
            { form: "Ari", tags: ["abbreviation"] },
            { form: "haben", tags: ["auxiliary", "perfect"] },
            { form: "Widdern", tags: ["dative", "plural"] },
            { form: "Wider", tags: ["variant", "plural"] },
          ],
        }),
        GERMAN_WORD,
      ),
    ).toEqual(["widdern"]);
  });
});

describe("translationSenses", () => {
  it("joins each sense's English translations, in the senses' order, a verb's with to", () => {
    const row = (word: string, sense_index: string) => ({
      lang_code: "en",
      word,
      sense_index,
    });
    expect(
      translationSenses(
        entry({
          translations: [
            row("ram", "1"),
            row("Aries", "2"),
            row("Aries", "2"),
            row("tup", "1"),
            row("Matsah )", "1"),
            { lang_code: "fr", word: "bélier", sense_index: "1" },
          ],
        }),
      ),
    ).toEqual([
      ["noun", "ram, tup"],
      ["noun", "Aries"],
    ]);
    expect(
      translationSenses(
        entry({
          word: "aufholen",
          pos: "verb",
          translations: [row("catch up", "1"), row("to gain on", "1")],
        }),
      ),
    ).toEqual([["verb", "to catch up, to gain on"]]);
  });
});

describe("tablesEntry", () => {
  it("keeps a name's headword, else its pointers, English translations and forms", () => {
    expect(
      tablesEntry(entry({ word: "Hans", pos: "name" }), GERMAN_WORD),
    ).toEqual({ word: "Hans", lang_code: "de", pos: "name" });
    const cut = tablesEntry(
      entry({
        translations: [{ lang_code: "en", word: "ram", sense_index: "1" }],
        forms: [{ form: "Widdern", tags: ["dative", "plural"] }],
        senses: [{ glosses: ["Schafbock"] }],
      }),
      GERMAN_WORD,
    );
    expect(cut?.translations).toEqual([
      { lang_code: "en", word: "ram", sense_index: "1" },
    ]);
    expect(slimForms(cut!)).toEqual(["widdern"]);
    expect(cut).not.toHaveProperty("senses");
    expect(tablesEntry(entry({ senses: [] }), GERMAN_WORD)).toBeUndefined();
  });
});
