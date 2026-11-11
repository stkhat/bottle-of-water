import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { posLabel } from "./common.ts";
import { importKaikki } from "./kaikki.ts";

type KaikkiResult = Awaited<ReturnType<typeof importKaikki>>;

const fixture = join(import.meta.dirname, "fixtures", "kaikki.jsonl");
const vocab = [
  "loaf",
  "loaves",
  "ferment",
  "dough",
  "colour",
  "color",
  "good",
  "well",
  "sheep",
  "may",
  "monday",
  "the",
  "we'll",
  "i",
  "look",
  "my",
  "would",
  "play",
  "groin",
  "aha",
  "abc",
  "comma",
  "finale",
  "bath",
];

describe("importKaikki", () => {
  let result: KaikkiResult;
  beforeAll(async () => {
    result = await importKaikki(fixture, vocab, {
      loaves: ["", ["loafの複数形"]],
    });
  });

  it("maps inflected forms to their base", () => {
    expect(result.lemmas.loaves).toBe("loaf");
    expect(result.lemmas.ferments).toBe("ferment");
    expect(result.lemmas.fermenting).toBe("ferment");
    expect(result.lemmas.loafed).toBe("loaf");
    expect(result.lemmas.colours).toBe("colour");
  });
  it("lists every base, sorted, when a form has several", () => {
    expect(result.lemmas.better).toEqual(["good", "well"]);
  });
  it("ignores alternative, obsolete, dialectal, misspelt and nonstandard forms", () => {
    for (const form of [
      "loafes",
      "fermente",
      "fermentit",
      "fermint",
      "sheeps",
    ]) {
      expect(result.lemmas).not.toHaveProperty(form);
    }
  });
  it("ignores the forms of entries that are only misspellings, and of letters", () => {
    expect(result.lemmas.better).toEqual(["good", "well"]);
    expect(result.lemmas).not.toHaveProperty("is");
  });
  it("ignores forms equal to the base, multi-word forms and bases outside the vocabulary", () => {
    for (const form of [
      "sheep",
      "more good",
      "zzyzxes",
      "figures of speech",
      "-",
    ]) {
      expect(result.lemmas).not.toHaveProperty(form);
    }
  });
  it("skips entries that are not English", () => {
    expect(result.lemmas).not.toHaveProperty("doughe");
    expect(result.ipa.dough).not.toBe("/x/");
  });
  it("uses entries spelt like the vocabulary word, and other casings only when there are none", () => {
    expect(result.lemmas).not.toHaveProperty("mays");
    expect(result.lemmas.might).toBe("may");
    expect(result.pos.may).toEqual(["verb"]);
    expect(result.lemmas.mondays).toBe("monday");
    expect(result.pos.monday).toEqual(["proper noun"]);
    expect(result.ipa.monday).toBe("/ˈmʌndeɪ/");
  });
  it("chooses the General American or US IPA, preferring a phonemic /…/ one", () => {
    expect(result.ipa.loaf).toBe("/loʊf/");
    expect(result.ipa.dough).toBe("/doʊ/");
    expect(result.ipa.ferment).toBe("/fɚˈmɛnt/");
    expect(result.ipa.the).toBe("/ðiː/");
  });
  it("keeps one transcription: the phonemic /…/ part, or the first of several", () => {
    expect(result.ipa.play).toBe("/pleɪ̯/");
    expect(result.ipa.groin).toBe("/ˈɡɹoɪ̯n/");
    expect(result.ipa.aha).toBe("[ɑˈhɑ]");
    expect(result.ipa.comma).toBe("[ˈkɑ.mə]");
    expect(result.ipa.finale).toBe("/fəˈnɑli/");
    expect(result.ipa).not.toHaveProperty("bath");
    expect(result.ipa.abc).toBe("/eɪ biː ˈsiː/");
  });
  it("falls back to an IPA without accent tags or notes", () => {
    expect(result.ipa.look).toBe("/lʊk/");
    expect(result.ipa.well).toBe("/wɛɫ/");
  });
  it("accepts a stressed or strong form in the fallback, but not a weak one", () => {
    expect(result.ipa.my).toBe("/maɪ/");
    expect(result.ipa.would).toBe("/wʊd/");
  });
  it("leaves out words with only a non-US IPA", () => {
    expect(result.ipa).not.toHaveProperty("colour");
    expect(result.ipa).not.toHaveProperty("may");
  });
  it("collects parts of speech in the order they appear", () => {
    expect(result.pos.loaf).toEqual(["noun", "verb"]);
    expect(result.pos.good).toEqual(["adjective"]);
    expect(result.pos.well).toEqual(["adverb"]);
    expect(result.pos.the).toEqual(["article"]);
    expect(result.pos).not.toHaveProperty("zzyzx");
  });
  it("counts lines it cannot parse instead of failing", () => {
    expect(result.stats).toEqual({ entries: 28, unparsable: 1 });
  });
});

describe("posLabel", () => {
  it.each([
    ["adj", "adjective"],
    ["adv", "adverb"],
    ["prep", "preposition"],
    ["pron", "pronoun"],
    ["conj", "conjunction"],
    ["intj", "interjection"],
    ["det", "determiner"],
    ["num", "numeral"],
    ["name", "proper noun"],
    ["prep_phrase", "prepositional phrase"],
    ["noun", "noun"],
    ["phrase", "phrase"],
  ])("labels %s as %s", (pos, label) => {
    expect(posLabel(pos)).toBe(label);
  });
});

describe("importKaikki: forms that are vocabulary words", () => {
  // Trimmed from real kaikki lines.
  const fixture = join(import.meta.dirname, "fixtures", "kaikki-confirm.jsonl");
  // Glosses as in EJDict.
  const dict = {
    is: ["", ["beの三人称・単数・現在"]],
    does: ["", ["doの三人称・単数・直説法現在形"]],
    has: ["", ["haveの三人称単数現在"]],
    lives: ["", ["lifeの複数形"]],
    news: ["", ["(新しい)『報道』,記事;(一般的に)知らせ,たより"]],
    better: [
      "",
      [
        "(『good』 の比較級;最上級は 『best』)『いっそうよい』",
        "(『well』の比較級;最上級はbest)『いっそううまく』",
      ],
    ],
    rose: ["", ["〈C〉『バラの花』"]],
    this: ["", ["《近くの人・物・事を指して》『これ』"]],
  } satisfies Record<string, [string, string[]]>;
  const forms = Object.keys(dict);
  const bases = ["be", "i", "do", "doe", "have", "ha", "life", "live", "new"];
  const vocab = [...forms, ...bases, "good", "well", "rise", "thi", "ii"];
  let lemmas: KaikkiResult["lemmas"];
  beforeAll(async () => {
    lemmas = (await importKaikki(fixture, vocab, dict)).lemmas;
  });

  it("keeps a base confirmed by the form's own form-of sense and named in its gloss", () => {
    expect(lemmas.is).toBe("be");
    expect(lemmas.does).toBe("do");
    expect(lemmas.has).toBe("have");
    expect(lemmas.better).toEqual(["good", "well"]);
  });
  it("keeps a base confirmed by a verb inflection even when the gloss does not name it", () => {
    expect(lemmas.lives).toEqual(["life", "live"]);
    expect(lemmas.rose).toBe("rise");
  });
  it("drops a base the form's own entries do not confirm", () => {
    expect(lemmas).not.toHaveProperty("this");
  });
  it("drops a noun-plural base the gloss does not name", () => {
    expect(lemmas).not.toHaveProperty("news");
  });
  it("takes no forms from Roman numerals", () => {
    expect(lemmas).not.toHaveProperty("iis");
  });
  it("drops single-letter bases for forms outside the vocabulary too", async () => {
    const result = await importKaikki(
      fixture,
      vocab.filter((word) => word !== "is"),
      dict,
    );
    expect(result.lemmas.is).toBe("be");
  });
});
