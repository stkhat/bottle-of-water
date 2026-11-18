import { describe, expect, it } from "vitest";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
} from "./dictionary";
import type { PairPack } from "../packs/types";

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
    fine: [
      "罰金",
      [
        "罰金",
        "〈人〉に罰金を科する",
        "(物・事が)『りっぱな』,みごとな",
        "(人が)『優れた』,りっぱな",
      ],
    ],
    saw: ["seeの過去", ["seeの過去", "『のこぎり』"]],
    better: [
      "いっそうよい",
      ["(『good』 の比較級;最上級は 『best』)『いっそうよい』"],
    ],
    go: ["行く", ["『行く』,出かける", "去る", "進む"]],
    find: ["…を見つける", ["…を『見つける』", "…を見つけだす"]],
    anyway: ["=anyhow", ["=anyhow"]],
    anyhow: ["どうしても", ["《否定文で》『どうしても』", "いずれにせよ"]],
    were: ["be の仮定法過去", ["《be の直説法過去》", "《be の仮定法過去》"]],
    japan: ["黒い漆", ["黒い漆(うるし)", "…に黒漆を塗る"]],
    mark: ["跡", ["〈C〉『跡』", "『印』"]],
    us: ["我々を", ["『我々を』"]],
    oh: ["おお", ["『おお』"]],
    paris: ["パリ", ["『パリ』(フランスの首都)"]],
    germany: ["ドイツ", ["ドイツ"]],
    frank: ["率直な", ["『率直な』"]],
    november: ["11月", ["『11月』(《略》Nov.)"]],
    street: ["通り", ["『通り』,街路"]],
    sun: ["太陽", ["《the~》『太陽』"]],
    sunday: ["日曜日", ["『日曜日』"]],
  },
  // EJDict's capitalised headwords, apart (acronyms under their capitals).
  capital: {
    japan: ["日本", ["『日本』"]],
    mark: ["聖マルコ", ["聖マルコ(『St.~』;4人の福音書の記者の一人)"]],
    US: ["合衆国", ["United States 合衆国"]],
    OH: ["Ohio", ["Ohio"]],
    paris: ["パリ", ["『パリ』(フランスの首都)"]],
    germany: ["ドイツ", ["ドイツ"]],
    frank: ["フランク人", ["フランク人(ゲルマン人の一部族)"]],
    lincoln: ["リンカン", ["リンカン(『Abraham~』;1809‐1865;米国の大統領)"]],
    // Abbreviations, under their key with the period.
    "nov.": ["November", ["November"]],
    "st.": ["Street", ["Street", "Saint(複SS.,Sts.)聖…,セント…"]],
    "sun.": ["Sunday", ["Sunday"]],
  },
  // Japanese translations of phrases EJDict lacks.
  phrases: {
    "figure out": ["（訳されない）", ["（訳されない）"]],
    "give up": ["諦める", ["諦める", "『やめる』"]],
    // Several senses of a translation table, with their English sense and their
    // parts of speech.
    "break up": [
      "別れる",
      ["《to end a relationship》別れる,手を切る", "《to disintegrate》壊れる"],
      "v v",
    ],
    "you know": [
      "分かるでしょ",
      ["《used to check understanding》分かるでしょ", "《pause》あのー,えーと"],
      "h i",
    ],
  },
  // English definitions of phrases neither has.
  defs: {
    nov: ["A novice", [["noun", "A novice."]]],
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
  // As the data build labels EJDict's senses.
  sensePos: { fine: "n~ v a* a*", saw: "v n*" },
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
  it("makes one sense's line as the hover card's lines do: an EJDict sense or an English definition", () => {
    expect(dictionary.senseLine({ text: "《おもに米俗》金銭,ぜに" })).toBe(
      "金銭,ぜに",
    );
    expect(
      dictionary.senseLine({ text: "To seek; to try to find." }, "en"),
    ).toBe("To seek");
  });

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

  it("labels senses as the data build did", () => {
    expect(dictionary.entry("fine")?.senses.slice(0, 3)).toEqual([
      { pos: "noun", posBy: "weak", text: "罰金" },
      { pos: "verb", text: "〈人〉に罰金を科する" },
      { pos: "adjective", core: true, text: "(物・事が)りっぱな,みごとな" },
    ]);
  });

  it("shows the senses of the part of speech the page's tag gives first (rule A2)", () => {
    expect(dictionary.entry("fine", undefined, "adjective")?.lines).toEqual([
      "(物・事が)りっぱな,みごとな",
      "(人が)優れた,りっぱな",
      "罰金",
    ]);
    expect(dictionary.entry("fine", undefined, "noun")?.lines).toEqual(
      dictionary.entry("fine")?.lines,
    );
    // The short meaning and the senses stay as the dictionary has them.
    const adjective = dictionary.entry("fine", undefined, "adjective");
    expect(adjective?.short).toBe("罰金");
    expect(adjective?.senses[0]?.text).toBe("罰金");
    // A form of a verb gives way to the noun in "a saw", and is not followed.
    expect(dictionary.entry("saw", undefined, "noun")?.lines).toEqual([
      "のこぎり",
    ]);
    expect(dictionary.entry("saw", undefined, "verb")?.lines[0]).toBe(
      "seeの過去",
    );
  });

  it("takes an English definition's short meaning from the tagged part of speech", () => {
    expect(dictionary.entry("from scratch", undefined, "adverb")).toMatchObject(
      { short: "Without using anything already made", glossLang: "en" },
    );
    expect(dictionary.entry("from scratch")?.short).toBe("From the beginning");
  });

  it("outlines a headword for choosing a word's base form (rule A1)", () => {
    expect(dictionary.outline("dough")).toEqual({
      firstMeaning: true,
      meaning: true,
      pos: ["noun"],
    });
    expect(dictionary.outline("went")).toEqual({
      formOf: "go",
      firstMeaning: false,
      meaning: false,
      pos: [],
    });
    expect(dictionary.outline("found")).toMatchObject({
      formOf: "find",
      firstMeaning: false,
      meaning: true,
    });
    expect(dictionary.outline("better")).toMatchObject({
      formOf: "good",
      firstMeaning: true,
    });
    expect(dictionary.outline("anyway")).toMatchObject({
      firstMeaning: false,
      meaning: false,
    });
    // English definitions where EJDict has nothing.
    expect(dictionary.outline("search for")).toMatchObject({
      firstMeaning: false,
    });
    expect(dictionary.outline("look for")).toMatchObject({
      firstMeaning: true,
      pos: ["verb"],
    });
    expect(dictionary.outline("zzyzx")).toBeUndefined();
  });

  it("gives a capitalised word its capitalised headword's senses first", () => {
    expect(dictionary.entry("japan", "capital")?.lines).toEqual([
      "日本",
      "黒い漆",
      "…に黒漆を塗る",
    ]);
    expect(dictionary.entry("japan", "capital")?.short).toBe("日本");
    expect(dictionary.entry("us", "upper")?.lines).toEqual([
      "United States 合衆国",
      "我々を",
    ]);
  });

  it("gives a capitalised word EJDict has only as an abbreviation the meanings it stands for", () => {
    expect(dictionary.entry("nov", "capital")).toMatchObject({
      short: "11月(Nov.)",
      lines: ["11月(Nov.)"],
      senses: [{ text: "11月(《略》Nov.)", hint: "November" }],
    });
    expect(dictionary.entry("st", "capital")?.lines).toEqual([
      "通り,街路",
      "Saint(複SS.,Sts.)聖…,セント…",
    ]);
    // In lower case, or where the page does not say: the word's own definition.
    expect(dictionary.entry("nov", "lower")?.short).toBe("A novice");
    expect(dictionary.entry("nov")?.short).toBe("A novice");
    // A word EJDict has keeps its own senses ("the Sun" is not Sunday).
    expect(dictionary.entry("sun", "capital")?.lines).toEqual(["太陽"]);
  });

  it("gives a word in lower case its lowercase senses only", () => {
    expect(dictionary.entry("japan", "lower")?.lines).toEqual([
      "黒い漆",
      "…に黒漆を塗る",
    ]);
    expect(dictionary.entry("us", "lower")?.lines).toEqual(["我々を"]);
    // A word written only with capitals keeps its senses.
    expect(dictionary.entry("paris", "lower")?.short).toBe("パリ");
  });

  it("leaves out capitalised senses about one person or without a gloss", () => {
    expect(dictionary.entry("mark", "capital")?.lines).toEqual(["跡", "印"]);
    expect(dictionary.entry("oh", "upper")?.lines).toEqual(["おお"]);
  });

  it("gives every sense, lowercase first, when the page does not say how the word was written", () => {
    expect(dictionary.entry("japan")?.lines).toEqual([
      "黒い漆",
      "…に黒漆を塗る",
      "日本",
    ]);
    expect(dictionary.entry("us")?.lines).toEqual([
      "我々を",
      "United States 合衆国",
    ]);
  });

  it("says what a capitalised headword means for a name", () => {
    expect(dictionary.capitalMeaning("japan")).toBe("word");
    expect(dictionary.capitalMeaning("paris")).toBe("name");
    expect(dictionary.capitalMeaning("Germany")).toBe("name");
    // About one person, a people or a lifespan: no meaning for other bearers.
    expect(dictionary.capitalMeaning("mark")).toBeUndefined();
    expect(dictionary.capitalMeaning("frank")).toBeUndefined();
    expect(dictionary.capitalMeaning("lincoln")).toBeUndefined();
    expect(dictionary.capitalMeaning("dough")).toBeUndefined();
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

  it("gives a translation table's senses one per line, the English sense as a hint (C1)", () => {
    expect(dictionary.entry("break up")).toMatchObject({
      short: "別れる",
      lines: ["別れる,手を切る", "壊れる"],
      senses: [
        { pos: "verb", text: "《to end a relationship》別れる,手を切る" },
        { pos: "verb", text: "《to disintegrate》壊れる" },
      ],
    });
  });

  it("reads a translation table's parts of speech, for a discourse marker's senses (C2)", () => {
    expect(dictionary.entry("you know")?.lines).toEqual([
      "分かるでしょ",
      "あのー,えーと",
    ]);
    expect(
      dictionary.entry("you know", undefined, "interjection")?.lines,
    ).toEqual(["あのー,えーと", "分かるでしょ"]);
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

  it("outlines a form by the word it names", () => {
    expect(dictionary.outline("casas")).toEqual({
      formOf: "casa",
      firstMeaning: false,
      meaning: false,
      pos: ["noun"],
    });
    expect(dictionary.outline("comer")).toMatchObject({ firstMeaning: true });
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
  it("makes one sense's line as the hover card's lines do", () => {
    const [own, table] = dictionary.entry("light")!.senses;
    expect(dictionary.senseLine(own!)).toBe("Luz");
    expect(dictionary.senseLine(table!)).toBe("lámpara");
    expect(dictionary.senseLine({ text: "To surrender." }, "en")).toBe(
      "To surrender",
    );
  });
  it("outlines a term from the pair pack or the English definitions", () => {
    expect(dictionary.outline("light")).toEqual({
      firstMeaning: true,
      meaning: true,
      pos: ["noun"],
    });
    expect(dictionary.outline("give up")).toMatchObject({ pos: ["verb"] });
    expect(dictionary.outline("zzyzx")).toBeUndefined();
  });

  describe("pointer senses", () => {
    const THIRD = "Tercera persona del singular del presente simple de";
    const dict: PairPack = {
      best: [
        "Superlativo",
        [
          ["adjective", "Superlativo de good.", null, "good"],
          ["verb", "Vencer."],
        ],
        0,
      ],
      good: ["Bueno", [["adjective", "Bueno."]], 0],
      children: [
        "Plural",
        [["noun", "Forma del plural de child.", null, "child"]],
        0,
      ],
      child: ["Niño", [["noun", "Niño."]], 0],
      told: [
        "Pasado simple",
        [["verb", "Pasado simple del verbo (to) tell.", null, "tell"]],
        0,
      ],
      tell: [
        "Señal",
        [
          ["noun", "Señal."],
          ["verb", "Contar."],
          ["verb", "Decir."],
        ],
        0,
      ],
      has: ["Tercera", [["verb", `${THIRD} (to) have.`, null, "have"]], 0],
      have: ["Tener", [["verb", "Tener."]], 0],
      does: [
        "Plural",
        [
          ["noun", "Plural de doe.", null, "doe"],
          ["verb", `${THIRD} do.`, null, "do"],
        ],
        0,
      ],
    };
    const forms = createPairDictionary({ dict, defs: {}, ipa: {} });

    it("shows a verb form second, after its base's first meaning, in the order of the pointer's part of speech", () => {
      // told → tell's verbs before its noun, also when the tag says a noun.
      for (const pos of ["verb", "noun", undefined])
        expect(forms.entry("told", undefined, pos)?.lines).toEqual([
          "Contar",
          "Pasado simple del verbo tell",
          "Decir",
        ]);
      // A dense script (Chinese) shows it first, as Japanese does.
      const zh = createPairDictionary({
        dict,
        defs: {},
        ipa: {},
        native: "zh",
      });
      expect(zh.entry("told", undefined, "verb")?.lines).toEqual([
        "Pasado simple del verbo tell",
        "Contar",
        "Decir",
      ]);
    });
    it("shows other forms that fit the cap first: comparatives, plurals", () => {
      expect(forms.entry("best", undefined, "adjective")?.lines).toEqual([
        "Superlativo de good",
        "Bueno",
        "Vencer",
      ]);
      expect(forms.entry("children", undefined, "noun")?.lines).toEqual([
        "Forma del plural de child",
        "Niño",
      ]);
    });
    it("leaves a pointer wider than the cap out while a meaning shows, but for an auxiliary", () => {
      expect(forms.entry("has", undefined, "verb")?.lines).toEqual(["Tener"]);
      expect(forms.entry("has")?.lines).toEqual(["Tener"]);
      // An auxiliary ("has been"): the pointer says what it means there.
      expect(forms.entry("has", undefined, "auxiliary")?.lines).toEqual([
        `${THIRD} have`,
        "Tener",
      ]);
    });
    it("outlines a pointer sense as a form of its target", () => {
      expect(forms.outline("told")).toEqual({
        formOf: "tell",
        firstMeaning: false,
        meaning: false,
        pos: ["verb"],
      });
      expect(forms.outline("does")?.formOf).toBe("doe");
    });
    it("keeps the pointer's text as a sense, without a hint", () => {
      expect(forms.entry("told")?.senses).toEqual([
        { pos: "verb", text: "Pasado simple del verbo (to) tell." },
      ]);
    });
  });

  describe("with a tag", () => {
    const dict: PairPack = {
      // es: Wikcionario leaves its degrees unmarked.
      better: [
        "Mejorar",
        [
          ["verb", "Mejorar"],
          ["adjective", "Comparativo irregular de good"],
          ["unknown", "Comparativo irregular de well"],
        ],
        0,
      ],
      good: [
        "Bueno",
        [
          ["noun", "Bien"],
          ["adjective", "Bueno"],
          ["adjective", "Mejor"],
        ],
        0,
      ],
      nuts: [
        "Plural",
        [
          ["noun", "Plural de nut", null, "nut"],
          ["adjective", "Loco"],
        ],
        0,
      ],
      nut: [
        "Nuez",
        [
          ["noun", "Nuez"],
          ["noun", "Fruta seca"],
        ],
        0,
      ],
      // fr: a gloss that starts with the base is the native word spelt the same.
      contented: ["Content", [["adjective", "Content, satisfait"]], 0],
      content: ["Contenu", [["adjective", "Satisfait"]], 0],
      // A translation table's senses: the auxiliary's is the second.
      have: [
        "avere",
        [
          ["verb", "avere, tenere", "1. to possess"],
          [
            "verb",
            "essere, avere",
            "10. auxiliary used in forming the perfect",
          ],
        ],
        0,
      ],
    };
    const dictionary = createPairDictionary({
      dict,
      defs: {},
      ipa: {},
      lemmas: { better: ["good", "well"], contented: "content" },
      pos: {
        good: ["adjective", "noun"],
        well: ["adverb"],
        content: ["adjective", "noun"],
      },
    });

    it("reads an unmarked degree as a pointer: its base's meanings of the tagged part of speech come before the word's own of another", () => {
      expect(dictionary.entry("better", undefined, "adjective")?.lines).toEqual(
        ["Comparativo irregular de good", "Bueno", "Mejor"],
      );
      expect(dictionary.outline("better")).toMatchObject({
        firstMeaning: true,
        meaning: true,
      });
      // Where it does not lead, it stays a meaning, in the dictionary's order.
      expect(dictionary.entry("better")?.lines).toEqual([
        "Mejorar",
        "Comparativo irregular de good",
        "Comparativo irregular de well",
      ]);
      // Without a lemma pack nothing is read.
      const plain = createPairDictionary({ dict, defs: {}, ipa: {} });
      expect(plain.entry("better", undefined, "adjective")?.lines).toEqual([
        "Comparativo irregular de good",
        "Mejorar",
        "Comparativo irregular de well",
      ]);
    });
    it("keeps a plural's own meanings of another part of speech before more of its base's", () => {
      expect(dictionary.entry("nuts", undefined, "noun")?.lines).toEqual([
        "Plural de nut",
        "Nuez",
        "Loco",
      ]);
    });
    it("does not read a native word spelt as the base as a pointer", () => {
      expect(
        dictionary.entry("contented", undefined, "adjective")?.lines,
      ).toEqual(["Content, satisfait"]);
    });
    it("shows an auxiliary's senses its source calls auxiliary first", () => {
      expect(dictionary.entry("have", undefined, "auxiliary")?.lines).toEqual([
        "essere",
        "avere",
      ]);
      expect(dictionary.entry("have", undefined, "verb")?.lines).toEqual([
        "avere",
        "essere",
      ]);
    });
  });
});
