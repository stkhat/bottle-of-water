import { describe, expect, it } from "vitest";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
} from "./dictionary";

const dictionary = createEnJaDictionary({
  dict: {
    dough: [
      "練り粉,こね粉,生パン",
      ["練り粉,こね粉,生パン", "《おもに米俗》金銭,ぜに"],
    ],
    "figure out": ["…を理解する", ["…を理解する", "…を計算する"]],
    tangy: ["ぴりっとする", ["ぴりっとする,刺激的な"]],
    found: [
      "findの過去・過去分詞",
      [
        "findの過去・過去分詞",
        "…を『創設する』,設立する(establish)",
        "=found2",
        "…を『創設する』,設立する(establish)",
        "〈C〉(…の上に)〈建物など〉を建てる;(…に)…の基礎を置く",
        "〈物〉を鋳造する",
        "発酵体",
      ],
    ],
    went: ["goの過去", ["goの過去"]],
    go: ["行く", ["『行く』,出かける", "去る", "進む"]],
    find: ["…を見つける", ["…を『見つける』", "…を見つけだす"]],
    anyway: ["=anyhow", ["=anyhow"]],
    anyhow: ["どうしても", ["《否定文で》『どうしても』", "いずれにせよ"]],
    were: ["be の仮定法過去", ["《be の直説法過去》", "《be の仮定法過去》"]],
  },
  // Japanese translations of phrases EJDict lacks.
  phrases: {
    "figure out": ["（訳されない）", ["（訳されない）"]],
    "give up": ["諦める", ["諦める", "『やめる』"]],
  },
  // English definitions of phrases neither has.
  defs: {
    "give up": ["(unused)", [["verb", "(unused)"]]],
    "search for": ["Synonym of look for", [["verb", "Synonym of look for"]]],
    "look for": [
      "To seek",
      [
        ["verb", "To seek; to try to find."],
        ["verb", "To expect."],
      ],
    ],
    "from scratch": [
      "From the beginning",
      [
        ["prepositional phrase", "From the beginning, from zero."],
        ["adverb", "Without using anything already made."],
      ],
    ],
  },
  pos: { dough: ["noun"], tangy: ["adjective"], give: ["verb"] },
  ipa: {
    dough: "/doʊ/",
    figure: "/ˈfɪɡjɚ/",
    out: "/aʊt/",
    give: "/ɡɪv/",
    up: "/ʌp/",
    from: "/fɹʌm/",
    scratch: "/skɹætʃ/",
  },
});

describe("createEnJaDictionary", () => {
  it("gives a word's short translation", () => {
    expect(dictionary.entry("dough")?.short).toBe("練り粉,こね粉,生パン");
    expect(dictionary.entry("Dough")?.short).toBe("練り粉,こね粉,生パン");
  });

  it("gives a word's entry with IPA and labeled senses", () => {
    expect(dictionary.entry("dough")).toEqual({
      head: "dough",
      kind: "word",
      ipa: "/doʊ/",
      short: "練り粉,こね粉,生パン",
      lines: ["練り粉,こね粉,生パン", "金銭,ぜに"],
      senses: [
        { pos: "noun", text: "練り粉,こね粉,生パン" },
        { pos: "noun", text: "《おもに米俗》金銭,ぜに" },
      ],
    });
  });

  it("gives the hover card up to three senses as short lines, cross-references and repeats left out", () => {
    // The form it is of stays first, with that word's first meaning: the word on
    // the page is most likely that form.
    expect(dictionary.entry("found")?.lines).toEqual([
      "findの過去・過去分詞",
      "…を見つける",
      "…を創設する,設立する(establish)",
    ]);
    expect(dictionary.entry("found")?.short).toBe("findの過去・過去分詞");
  });

  it("follows a pointer to the meanings of the word it names", () => {
    expect(dictionary.entry("went")?.lines).toEqual([
      "goの過去",
      "行く,出かける",
      "去る",
    ]);
    expect(dictionary.entry("anyway")?.lines).toEqual([
      "どうしても",
      "いずれにせよ",
    ]);
    // The dictionary window keeps the entry as it is.
    expect(dictionary.entry("went")?.short).toBe("goの過去");
    expect(dictionary.entry("went")?.senses).toEqual([{ text: "goの過去" }]);
  });

  it("keeps the short meaning when every line is empty", () => {
    expect(dictionary.entry("were")?.lines).toEqual(["be の仮定法過去"]);
  });

  it("gives a phrase's entry with its words' IPA joined", () => {
    expect(dictionary.entry(" Figure  out ")).toEqual({
      head: "figure out",
      kind: "phrase",
      ipa: "/ˈfɪɡjər aʊt/",
      short: "…を理解する",
      lines: ["…を理解する", "…を計算する"],
      senses: [{ text: "…を理解する" }, { text: "…を計算する" }],
    });
  });

  it("takes a phrase EJDict lacks from the Japanese translations, without labels", () => {
    expect(dictionary.entry("Give up")?.short).toBe("諦める");
    expect(dictionary.entry("give up")).toEqual({
      head: "give up",
      kind: "phrase",
      ipa: "/ɡɪv ʌp/",
      short: "諦める",
      lines: ["諦める", "やめる"],
      senses: [{ text: "諦める" }, { text: "やめる" }],
    });
  });

  it("takes a phrase neither has from the English definitions, marked as English", () => {
    expect(dictionary.entry("from scratch")?.short).toBe("From the beginning");
    expect(dictionary.entry("from scratch")).toEqual({
      head: "from scratch",
      kind: "phrase",
      ipa: "/frʌm skrætʃ/",
      short: "From the beginning",
      // Translated at display time: one line.
      lines: ["From the beginning"],
      glossLang: "en",
      senses: [
        { pos: "prepositional phrase", text: "From the beginning, from zero." },
        { pos: "adverb", text: "Without using anything already made." },
      ],
    });
  });

  it("follows an English definition that only points to another term to that term's definitions", () => {
    expect(dictionary.entry("search for")).toMatchObject({
      short: "Synonym of look for",
      lines: ["To seek", "To expect"],
      glossLang: "en",
    });
  });

  it("marks only English definitions with their language", () => {
    expect(dictionary.entry("dough")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("figure out")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("give up")).not.toHaveProperty("glossLang");
  });

  it("leaves out the IPA when there is none", () => {
    expect(dictionary.entry("tangy")).not.toHaveProperty("ipa");
  });

  it("gives undefined for an unknown term", () => {
    expect(dictionary.entry("zzyzx")?.short).toBeUndefined();
    expect(dictionary.entry("zzyzx")).toBeUndefined();
    expect(dictionary.entry("figure it out")).toBeUndefined();
    expect(dictionary.entry("figure it out")?.short).toBeUndefined();
  });
});

describe("createDefsDictionary", () => {
  const dictionary = createDefsDictionary({
    defs: {
      comer: [
        "to eat",
        [
          ["verb", "to eat"],
          ["verb", "to have lunch"],
        ],
      ],
      casa: ["house", [["noun", "house"]]],
      "a escondidas": ["secretly", [["adverb", "secretly, covertly"]]],
      fue: [
        "third-person singular preterite indicative of ir",
        [
          ["verb", "third-person singular preterite indicative of ir"],
          ["verb", "third-person singular preterite indicative of ser"],
        ],
      ],
      casas: ["Plural of casa", [["noun", "Plural of casa"]]],
      vela: [
        "candle",
        [
          ["noun", "candle; taper."],
          ["noun", "Alternative form of velo"],
          ["noun", "sail"],
          ["noun", "vigil"],
          ["noun", "wake"],
        ],
      ],
    },
    ipa: { comer: "/koˈmeɾ/", a: "/a/", escondidas: "/eskonˈdidas/" },
  });

  it("gives a word's short meaning", () => {
    expect(dictionary.entry("comer")?.short).toBe("to eat");
    expect(dictionary.entry("Comer")?.short).toBe("to eat");
  });

  it("gives a word's entry with IPA and the senses' parts of speech, in the target language", () => {
    expect(dictionary.entry("comer")).toEqual({
      head: "comer",
      kind: "word",
      ipa: "/koˈmeɾ/",
      short: "to eat",
      lines: ["to eat", "to have lunch"],
      senses: [
        { pos: "verb", text: "to eat" },
        { pos: "verb", text: "to have lunch" },
      ],
    });
  });

  it("gives the hover card up to three senses as short lines, pointers left out unless alone", () => {
    expect(dictionary.entry("vela")?.lines).toEqual([
      "candle",
      "sail",
      "vigil",
    ]);
    expect(dictionary.entry("fue")?.lines).toEqual([
      "third-person singular preterite indicative of ir",
      "third-person singular preterite indicative of ser",
    ]);
  });

  it("follows a form to the meanings of the word it names", () => {
    expect(dictionary.entry("casas")?.lines).toEqual([
      "Plural of casa",
      "house",
    ]);
  });

  it("gives a phrase's entry with its words' IPA joined", () => {
    expect(dictionary.entry(" A  escondidas ")).toEqual({
      head: "a escondidas",
      kind: "phrase",
      ipa: "/a eskonˈdidas/",
      short: "secretly",
      lines: ["secretly, covertly"],
      senses: [{ pos: "adverb", text: "secretly, covertly" }],
    });
  });

  it("leaves out the IPA when there is none", () => {
    expect(dictionary.entry("casa")).not.toHaveProperty("ipa");
  });

  it("gives undefined for an unknown term", () => {
    expect(dictionary.entry("zzyzx")?.short).toBeUndefined();
    expect(dictionary.entry("zzyzx")).toBeUndefined();
    expect(dictionary.entry("__proto__")).toBeUndefined();
  });
});

describe("createPairDictionary", () => {
  const dictionary = createPairDictionary({
    dict: {
      light: [
        "luz",
        [
          ["noun", "Luz."],
          ["noun", "lámpara, farol", "source of illumination"],
        ],
        0,
      ],
    },
    defs: {
      light: ["Visible radiation", [["noun", "Visible radiation."]]],
      "give up": ["To surrender", [["verb", "To surrender."]]],
    },
    ipa: { light: "/laɪt/" },
  });

  it("looks a term up in the pair pack, keeping translation-table hints", () => {
    expect(dictionary.entry("Light")?.short).toBe("luz");
    expect(dictionary.entry("light")).toEqual({
      head: "light",
      kind: "word",
      ipa: "/laɪt/",
      short: "luz",
      // A translation table's sense gives its first word.
      lines: ["Luz", "lámpara"],
      senses: [
        { pos: "noun", text: "Luz." },
        {
          pos: "noun",
          text: "lámpara, farol",
          hint: "source of illumination",
        },
      ],
    });
  });
  it("falls back to the English definitions, marked as English", () => {
    expect(dictionary.entry("give up")).toEqual({
      head: "give up",
      kind: "phrase",
      short: "To surrender",
      lines: ["To surrender"],
      senses: [{ pos: "verb", text: "To surrender." }],
      glossLang: "en",
    });
  });
  it("has nothing for a term neither has", () => {
    expect(dictionary.entry("zzyzx")).toBeUndefined();
    expect(dictionary.entry("zzyzx")?.short).toBeUndefined();
  });
});
