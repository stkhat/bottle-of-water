import { describe, expect, it } from "vitest";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
  withCompounds,
  withPhraseCase,
  withWrittenHeads,
} from "./dictionary";
import type { PairPack } from "../packs/types";
import { writesPhrase } from "./expansions";

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
    // An abbreviation filed with its capitals ("PM,P.M.,p.m.").
    "p.m.": [
      "paymaster",
      ["paymaster", "Prime Minister", "『午後』(ラテン語post meridiemの略)"],
    ],
    "a.m.": ["ante meridiem 午前", ["ante meridiem 午前", "『午前』"]],
  },
  // EJDict's capitalised headwords, apart (acronyms under their capitals), and the
  // capital-only words' meanings.
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
    AI: ["人工知能", ["《artificial intelligence》人工知能"]],
    tokyo: ["東京", ["東京"]],
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
    nov: [["noun", "A novice."]],
    // An initialism of several things, the most translated first.
    dea: [
      ["noun", "A hydroxy secondary amine."],
      ["proper noun", "Initialism of Drug Enforcement Administration."],
    ],
    gpu: [
      ["noun", "Initialism of State Political Directorate."],
      ["noun", "graphics processing unit: A specialized electronic circuit."],
    ],
    "give up": [["verb", "(unused)"]],
    "search for": [["verb", "Synonym of look for"]],
    "look for": [
      ["verb", "To seek; to try to find."],
      ["verb", "To expect."],
    ],
    "from scratch": [
      ["prepositional phrase", "From the beginning; from zero."],
      ["adverb", "Without using anything already made."],
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

  it("gives a capitalised word its capitalised headword alone, written so", () => {
    expect(dictionary.entry("japan", "capital")).toMatchObject({
      head: "Japan",
      short: "日本",
      lines: ["日本"],
    });
    expect(dictionary.entry("us", "upper")).toMatchObject({
      head: "US",
      lines: ["United States 合衆国"],
    });
    // In a run of capitals, perhaps a name's word: its lowercase senses follow.
    expect(dictionary.entry("japan", "run")).toMatchObject({
      head: "japan",
      lines: ["日本", "黒い漆", "…に黒漆を塗る"],
    });
    // Where the page does not say, the word's own senses, then the capitalised ones.
    expect(dictionary.entry("japan")).toMatchObject({
      head: "japan",
      lines: ["黒い漆", "…に黒漆を塗る", "日本"],
    });
    expect(dictionary.entry("japan", "lower")?.lines).toEqual([
      "黒い漆",
      "…に黒漆を塗る",
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

  it("gives a word with no lowercase entry its capitalised one however it is written", () => {
    expect(dictionary.entry("ai", "upper")?.lines).toEqual(["人工知能"]);
    expect(dictionary.entry("ai")?.lines).toEqual(["人工知能"]);
    expect(dictionary.entry("tokyo", "capital")?.lines).toEqual(["東京"]);
    expect(dictionary.entry("tokyo")?.short).toBe("東京");
    expect(dictionary.capitalMeaning("tokyo")).toBe("word");
  });

  it("leads an abbreviation filed with its capitals with its core translation", () => {
    expect(dictionary.entry("p.m.")?.lines).toEqual([
      "午後(ラテン語post meridiemの略)",
      "paymaster",
      "Prime Minister",
    ]);
    expect(dictionary.entry("p.m.")?.short).toBe(
      "午後(ラテン語post meridiemの略)",
    );
    // One whose first sense has Japanese keeps its order.
    expect(dictionary.entry("a.m.")?.lines).toEqual([
      "ante meridiem 午前",
      "午前",
    ]);
  });

  it("leads an abbreviation with the expansion its document spells out", () => {
    const spelledOut = (text: string) => (phrase: string) =>
      writesPhrase(text, phrase);
    const news = spelledOut("The Prime Minister spoke at 5 P.M. today.");
    const pm = dictionary.entry("p.m.", "upper", undefined, undefined, news);
    expect(pm).toMatchObject({
      short: "Prime Minister",
      lines: ["Prime Minister", "午後(ラテン語post meridiemの略)", "paymaster"],
    });
    // Senses stay in the dictionary's order (its core translation first).
    expect(pm?.senses[0]?.text).toBe("午後(ラテン語post meridiemの略)");
    // An English definition (DEA, from en-defs).
    const show = spelledOut(
      "The DEA? That's the Drug Enforcement Administration.",
    );
    expect(
      dictionary.entry("dea", "upper", undefined, undefined, show),
    ).toMatchObject({
      short: "Initialism of Drug Enforcement Administration",
      // The pointer itself: the other senses' meanings do not take its place.
      lines: ["Initialism of Drug Enforcement Administration"],
    });
    expect(dictionary.entry("dea", "upper")?.short).toBe(
      "A hydroxy secondary amine",
    );
    // A document that spells none out leaves the dictionary's order.
    expect(
      dictionary.entry("dea", "upper", undefined, undefined, spelledOut("DEA"))
        ?.short,
    ).toBe("A hydroxy secondary amine");
  });

  it("leads with the expansion its document writes inflected, by the pack's base forms", () => {
    const text = "Graphics processing units (GPUs) are specialized circuits.";
    const bases = (word: string) => (word === "units" ? ["unit"] : []);
    expect(
      dictionary.entry("gpu", "upper", undefined, undefined, (phrase) =>
        writesPhrase(text, phrase, bases),
      )?.short,
    ).toBe("graphics processing unit: A specialized electronic circuit");
    // As written only, the plural spells nothing out.
    expect(
      dictionary.entry("gpu", "upper", undefined, undefined, (phrase) =>
        writesPhrase(text, phrase),
      )?.short,
    ).toBe("Initialism of State Political Directorate");
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
        { pos: "prepositional phrase", text: "From the beginning; from zero." },
        { pos: "adverb", text: "Without using anything already made." },
      ],
    });
  });

  it("shows a long English definition, until it is translated, within the English cap", () => {
    const long = createEnJaDictionary({
      dict: {},
      sensePos: {},
      capital: {},
      phrases: {},
      pos: {},
      ipa: {},
      defs: {
        "hold out": [
          [
            "verb",
            "To keep resisting an attack or a demand for a long time without giving in.",
          ],
        ],
      },
    });
    expect(long.entry("hold out")?.lines).toEqual([
      "To keep resisting an attack or a demand…",
    ]);
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

describe("withWrittenHeads", () => {
  it("writes a capital-only word's head as the word is written", () => {
    const heads = withWrittenHeads(dictionary, (key) =>
      key === "ai" ? "AI" : undefined,
    );
    expect(heads.entry("ai")?.head).toBe("AI");
    expect(heads.entry("ai")?.lines).toEqual(["人工知能"]);
    expect(heads.entry("dough")?.head).toBe("dough");
    expect(heads.entry("zzyzx")).toBeUndefined();
  });
});

describe("createDefsDictionary: capitalised headwords (German)", () => {
  const dictionary = createDefsDictionary({
    defs: {
      sie: [
        ["pronoun", "she; her"],
        ["pronoun", "they; them"],
        ["pronoun", "you (polite, singular and plural)", "capital"],
      ],
      essen: [
        ["verb", "to eat"],
        ["noun", "food", "capital"],
      ],
      vater: [["noun", "father", "capital"]],
    },
    ipa: {},
  });
  it("shows a capitalised word's capitalised senses first", () => {
    expect(dictionary.entry("sie", "capital", "pronoun")).toMatchObject({
      head: "Sie",
      short: "you (polite, singular and plural)",
      lines: ["you (polite, singular and plural)", "she", "they"],
    });
    expect(dictionary.entry("sie", undefined, "pronoun")).toMatchObject({
      head: "sie",
      lines: ["she", "they", "you (polite, singular and plural)"],
    });
  });
  it("writes the headword capitalised when its first line is a capitalised headword's", () => {
    expect(dictionary.entry("vater")?.head).toBe("Vater");
    expect(dictionary.entry("essen", undefined, "noun")?.head).toBe("Essen");
    expect(dictionary.entry("essen", undefined, "verb")?.head).toBe("essen");
  });
});

describe("withCompounds", () => {
  const defs = createDefsDictionary({
    defs: {
      bahn: [["noun", "railway", "capital"]],
      system: [
        ["noun", "system", "capital"],
        ["noun", "period", "capital"],
      ],
    },
    ipa: {},
  });
  const dictionary = withCompounds(defs, (key) =>
    /^(?:B|b)ahnsystem$/.test(key)
      ? { key: "bahnsystem", parts: ["bahn", "system"], noun: true }
      : undefined,
  );
  it("reads a compound by its parts' meanings, then its head's", () => {
    expect(dictionary.entry("bahnsystem", "capital")).toMatchObject({
      head: "Bahnsystem",
      expansion: "Bahn + System",
      lines: ["railway + system", "period"],
      senses: defs.entry("system")!.senses,
    });
    expect(dictionary.outline("bahnsystem")).toEqual(defs.outline("system"));
    expect(dictionary.entry("bahn")?.head).toBe("Bahn");
    expect(dictionary.entry("bahnhof")).toBeUndefined();
  });
  it("reads a part by its sense as a part, without an English article", () => {
    const parts = withCompounds(
      createDefsDictionary({
        defs: {
          bahn: [
            ["noun", "route, trail", "capital"],
            ["noun", "railway/railroad or rail transport", "capital"],
          ],
          "bahn-": [["noun", "railway/railroad or rail transport", "capital"]],
          schlüssel: [["noun", "a key", "capital"]],
          netz: [["noun", "net", "capital"]],
        },
        ipa: {},
      }),
      (key) =>
        /^bahnnetz$/i.test(key)
          ? { key: "bahnnetz", parts: ["bahn", "netz"], noun: true }
          : /^schlüsselnetz$/i.test(key)
            ? { key: "schlüsselnetz", parts: ["schlüssel", "netz"], noun: true }
            : undefined,
    );
    expect(parts.entry("bahnnetz", "capital")?.lines[0]).toBe("railway + net");
    expect(parts.entry("schlüsselnetz", "capital")?.lines[0]).toBe("key + net");
  });
  it("reads a part whose entry opens with a pointer by its target's meaning", () => {
    const parts = withCompounds(
      createDefsDictionary({
        defs: {
          karten: [["noun", "plural of Karte", "capital"]],
          karte: [["noun", "map", "capital"]],
          dienst: [["noun", "service", "capital"]],
          dienste: [["noun", "plural of Dienst", "capital"]],
        },
        ipa: {},
      }),
      (key) =>
        /^kartendienste$/i.test(key)
          ? { key: "kartendienste", parts: ["karten", "dienste"], noun: true }
          : undefined,
    );
    expect(parts.entry("kartendienste", "capital")).toMatchObject({
      lines: ["map + service"],
      short: "service",
      expansion: "Karten + Dienste",
    });
  });
});

describe("withPhraseCase", () => {
  const defs = createDefsDictionary({
    defs: {
      "auf jeden fall": [["phrase", "in any case"]],
      "zu tun haben": [["verb", "to have to do"]],
      fall: [["noun", "case", "capital"]],
      haus: [["noun", "house", "capital"]],
      tun: [
        ["verb", "to do"],
        ["noun", "doing", "capital"],
      ],
      jeder: [["determiner", "every"]],
    },
    ipa: {},
  });
  const LEMMAS: Record<string, readonly string[]> = {
    jeden: ["jeder"],
    hause: ["haus"],
  };
  const dictionary = withPhraseCase(defs, (word) => LEMMAS[word] ?? [word]);
  it("writes each word of a phrase's headword as its base's card does", () => {
    expect(dictionary.entry("auf jeden fall")?.head).toBe("auf jeden Fall");
    expect(dictionary.entry("zu tun haben")?.head).toBe("zu tun haben");
    expect(dictionary.entry("fall")?.head).toBe("Fall");
  });
});

describe("createDefsDictionary", () => {
  const dictionary = createDefsDictionary({
    defs: {
      comer: [
        ["verb", "to eat"],
        ["verb", "to have lunch"],
      ],
      casa: [["noun", "house"]],
      "a escondidas": [["adverb", "secretly, covertly"]],
      fue: [
        ["verb", "third-person singular preterite indicative of ir"],
        ["verb", "third-person singular preterite indicative of ser"],
      ],
      casas: [["noun", "Plural of casa"]],
      haber: [
        ["verb", "to exist"],
        ["verb", "to have; forms the perfect aspect", "auxiliary"],
      ],
      vela: [
        ["noun", "candle; taper."],
        ["noun", "Alternative form of velo"],
        ["noun", "sail"],
        ["noun", "vigil"],
        ["noun", "wake"],
      ],
    },
    ipa: { comer: "/koˈmeɾ/", a: "/a/", escondidas: "/eskonˈdidas/" },
  });

  it("makes an entry's short definition from its first sense, which the pack does not store", () => {
    expect(dictionary.entry("vela")?.short).toBe("candle");
    expect(dictionary.entry("haber")?.short).toBe("to exist");
  });

  it("shows the senses the pack marks as an auxiliary's first where the word is one", () => {
    expect(dictionary.entry("haber", undefined, "auxiliary")?.lines).toEqual([
      "to have",
      "to exist",
    ]);
    expect(dictionary.entry("haber", undefined, "verb")?.lines).toEqual([
      "to exist",
      "to have",
    ]);
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
      // The first sense's (the pack does not store it).
      short: "secretly, covertly",
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

describe("createPairDictionary over a learning pair (German → French)", () => {
  const dictionary = createPairDictionary({
    dict: {
      essen: [
        [
          ["verb", "manger"],
          ["noun", "repas, nourriture"],
        ],
        0,
        [1],
      ],
      vater: [[["noun", "père"]], 0, [0]],
      gehen: [[["verb", "aller"]], 1],
    },
    defs: { laufen: [["verb", "to run"]] },
    ipa: {},
    native: "fr",
  });

  it("shows a capitalised word's capitalised senses first, the headword capitalised", () => {
    expect(dictionary.entry("essen", "capital")).toMatchObject({
      head: "Essen",
      short: "repas, nourriture",
      lines: ["repas, nourriture", "manger"],
    });
    expect(dictionary.entry("essen", "lower")).toMatchObject({
      head: "essen",
      lines: ["manger", "repas, nourriture"],
    });
    // At a sentence start the tag decides (rule A2).
    expect(dictionary.entry("essen", undefined, "noun")?.lines[0]).toBe(
      "repas, nourriture",
    );
    expect(dictionary.entry("vater", "capital")?.head).toBe("Vater");
    expect(dictionary.entry("vater")?.senses).toEqual([
      { pos: "noun", text: "père", capital: true },
    ]);
  });
  it("falls back to the learning language's English definitions", () => {
    expect(dictionary.entry("gehen")?.lines).toEqual(["aller"]);
    expect(dictionary.entry("laufen")).toMatchObject({
      short: "to run",
      glossLang: "en",
    });
  });
});

describe("createPairDictionary", () => {
  const dictionary = createPairDictionary({
    dict: {
      // A short the pack stores, as the data build made it (format 4: only where it
      // is not the senses').
      light: [
        [
          ["noun", "Luz."],
          ["noun", "lámpara, farol", "source of illumination"],
        ],
        0,
        null,
        "luz",
      ],
      lamp: [[["noun", "lámpara, farol", "source of illumination"]], 1],
      lantern: [[["noun", "Farol."]], 0],
    },
    defs: {
      light: [["noun", "Visible radiation."]],
      "give up": [["verb", "To surrender."]],
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
  it("makes a short the pack does not store from the first sense", () => {
    // A translation table's first word; an edition's gloss as a definition.
    expect(dictionary.entry("lamp")?.short).toBe("lámpara");
    expect(dictionary.entry("lantern")?.short).toBe("Farol");
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
        [
          ["adjective", "Superlativo de good.", null, "good"],
          ["verb", "Vencer."],
        ],
        0,
      ],
      good: [[["adjective", "Bueno."]], 0],
      children: [[["noun", "Forma del plural de child.", null, "child"]], 0],
      child: [[["noun", "Niño."]], 0],
      told: [[["verb", "Pasado simple del verbo (to) tell.", null, "tell"]], 0],
      tell: [
        [
          ["noun", "Señal."],
          ["verb", "Contar."],
          ["verb", "Decir."],
        ],
        0,
      ],
      has: [[["verb", `${THIRD} (to) have.`, null, "have"]], 0],
      have: [[["verb", "Tener."]], 0],
      had: [[["verb", "Pasado de have.", null, "have"]], 0],
      does: [
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
      // The verb "to beat" is no adjective's line (`onTag`).
      expect(forms.entry("best", undefined, "adjective")?.lines).toEqual([
        "Superlativo de good",
        "Bueno",
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
      expect(forms.entry("had", undefined, "auxiliary")?.lines).toEqual([
        "Pasado de have",
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

  describe("capitalised headwords", () => {
    // Capitalised headwords sit under their capital key, with what they mean (format 3).
    const dict = {
      japan: [[["noun", "laca japonesa"]], 0],
      Japan: [[["proper noun", "Japón"]], 0, "name"],
      Thursday: [[["noun", "jueves", "day of the week"]], 1, "word"],
      china: [[["noun", "porcelana"]], 0],
      China: [[["proper noun", "China"]], 0],
    } as unknown as PairPack;
    const capitals = createPairDictionary({ dict, defs: {}, ipa: {} });

    it("shows a capitalised word's meaning alone when it has one, written so", () => {
      expect(capitals.entry("Japan", "capital")).toMatchObject({
        head: "Japan",
        lines: ["Japón"],
      });
      expect(capitals.entry("japan")?.lines).toEqual(["laca japonesa"]);
      expect(capitals.entry("japan", "upper")?.lines[0]).toBe("Japón");
      // The gloss is the headword itself: the lowercase entry alone.
      expect(capitals.entry("China", "capital")?.lines).toEqual(["porcelana"]);
    });
    it("keeps acronyms for words written in capitals", () => {
      const acronyms = createPairDictionary({
        dict: {
          and: [[["conjunction", "y"]], 0],
          AND: [[["noun", "Y lógico"]], 0, "word"],
          us: [[["pronoun", "nos"]], 0],
          US: [[["proper noun", "EE. UU."]], 1, "name"],
        } as unknown as PairPack,
        defs: {},
        ipa: {},
      });
      // A capitalised "And" is no acronym.
      expect(acronyms.entry("And", "capital")?.lines).toEqual(["y"]);
      expect(acronyms.entry("AND", "upper")?.lines).toEqual(["Y lógico"]);
      // An abbreviation keeps its period.
      expect(acronyms.entry("US", "upper")).toMatchObject({
        head: "US",
        lines: ["EE. UU."],
      });
      expect(acronyms.capitalMeaning("us")).toBeUndefined();
    });
    it("shows lines equal apart from case once, as the page writes the word", () => {
      const variants = {
        congress: [
          [
            ["noun", "congreso"],
            ["verb", "reunirse"],
          ],
          0,
        ],
        Congress: [[["proper noun", "Congreso"]], 1, "word"],
        assumption: [
          [
            ["noun", "supposizione", "supposition"],
            ["noun", "Assunzione", "feast"],
            ["noun", "assunzione", "the act of assuming"],
          ],
          1,
        ],
        // German: case tells a noun ("Positiv", the grammar term) from an adjective.
        house: [[["noun", "Haus"]], 0],
        tree: [[["noun", "Baum"]], 0],
        positive: [
          [
            ["adjective", "Positiv", "grammar: describing the primary sense"],
            ["adjective", "positiv", "legal: formally laid down"],
          ],
          0,
        ],
      } as unknown as PairPack;
      const es = createPairDictionary({ dict: variants, defs: {}, ipa: {} });
      // es Congress: the capitalised headword's line, not its lowercase twin.
      expect(es.entry("Congress", "capital")?.lines).toEqual(["Congreso"]);
      // it assumption in lower case: the lowercase variant where the first one stood.
      expect(es.entry("assumption", "lower")?.lines).toEqual([
        "supposizione",
        "assunzione",
      ]);
      expect(es.entry("Assumption", "capital")?.lines).toEqual([
        "supposizione",
        "Assunzione",
      ]);
      // A pair that writes most of its nouns capitalised keeps case variants.
      const nouns = Object.fromEntries(
        Object.entries(variants).filter(
          ([key]) => !["congress", "Congress", "assumption"].includes(key),
        ),
      );
      const de = createPairDictionary({ dict: nouns, defs: {}, ipa: {} });
      expect(de.entry("positive", "lower")?.lines).toEqual([
        "Positiv",
        "positiv",
      ]);
      // Different parts of speech stay apart in any pair.
      const pos = createPairDictionary({
        dict: {
          one: [
            [
              ["numeral", "uno"],
              ["noun", "Uno"],
            ],
            0,
          ],
        } as unknown as PairPack,
        defs: {},
        ipa: {},
      });
      expect(pos.entry("one", "lower")?.lines).toEqual(["uno", "Uno"]);
    });
    it("shows the lowercase entry alone for a word in lower case or where the page does not say", () => {
      expect(capitals.entry("japan", "lower")?.lines).toEqual([
        "laca japonesa",
      ]);
      // A sentence start, a caseless document: "It's" is not IT.
      expect(capitals.entry("Japan")?.lines).toEqual(["laca japonesa"]);
    });
    it("takes the capitalised entry for a word with no lowercase one, however written", () => {
      for (const written of ["capital", "lower", undefined] as const)
        expect(capitals.entry("thursday", written)?.lines).toEqual(["jueves"]);
      expect(capitals.outline("thursday")).toMatchObject({ meaning: true });
    });
    it("says what a capitalised headword means, as the data build found", () => {
      expect(capitals.capitalMeaning("Japan")).toBe("name");
      expect(capitals.capitalMeaning("thursday")).toBe("word");
      expect(capitals.capitalMeaning("China")).toBeUndefined();
      expect(capitals.capitalMeaning("light")).toBeUndefined();
    });
  });

  describe("with a tag", () => {
    const dict: PairPack = {
      // es: Wikcionario leaves its degrees unmarked.
      better: [
        [
          ["verb", "Mejorar"],
          ["adjective", "Comparativo irregular de good"],
          ["unknown", "Comparativo irregular de well"],
        ],
        0,
      ],
      good: [
        [
          ["noun", "Bien"],
          ["adjective", "Bueno"],
          ["adjective", "Mejor"],
        ],
        0,
      ],
      nuts: [
        [
          ["noun", "Plural de nut", null, "nut"],
          ["adjective", "Loco"],
        ],
        0,
      ],
      nut: [
        [
          ["noun", "Nuez"],
          ["noun", "Fruta seca"],
        ],
        0,
      ],
      // fr: a gloss that starts with the base is the native word spelt the same.
      contented: [[["adjective", "Content, satisfait"]], 0],
      content: [[["adjective", "Satisfait"]], 0],
      // A translation table's senses: the auxiliary's is the second.
      have: [
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
      // Not the verb "mejorar", nor good's noun "bien" (`onTag`).
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
        "Comparativo irregular de well",
      ]);
    });
    it("shows only the senses a word's tag can mean, while it can mean one", () => {
      // good/JJ: not the noun "bien".
      expect(dictionary.entry("good", undefined, "adjective")?.lines).toEqual([
        "Bueno",
        "Mejor",
      ]);
      // A mistag: no sense is a verb, so the lines are all there is.
      expect(dictionary.entry("nut", undefined, "verb")?.lines).toEqual([
        "Nuez",
        "Fruta seca",
      ]);
      // No tag, no choice.
      expect(dictionary.entry("good")?.lines).toEqual([
        "Bien",
        "Bueno",
        "Mejor",
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
    it("reads a degree whose line is the meaning a qualifier introduces as that meaning", () => {
      const later = createPairDictionary({
        dict: {
          later: [[["adverb", "Comparativo de late: más tarde"]], 0],
          late: [[["adverb", "Tarde"]], 0],
        },
        defs: {},
        ipa: {},
        lemmas: { later: "late" },
        pos: { late: ["adverb"] },
      });
      expect(later.entry("later", undefined, "adverb")?.lines).toEqual([
        "más tarde",
      ]);
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
    it("shows an auxiliary read as its base no meaning unless the base has auxiliary senses", () => {
      // en-it "has been" → have: avere, essere.
      expect(
        dictionary.entry("have", undefined, "auxiliary base")?.lines,
      ).toEqual(["essere", "avere"]);
      // en-ru "has been" → have, which has none: not "to own".
      expect(
        dictionary.entry("good", undefined, "auxiliary base"),
      ).toMatchObject({ lines: [], short: "Bien" });
    });
  });
});
