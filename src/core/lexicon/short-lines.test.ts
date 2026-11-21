import { describe, expect, it } from "vitest";
import {
  capLine,
  cleanShort,
  definitionLine,
  describes,
  displayWidth,
  editionLine,
  firstSentence,
  fitsPairCap,
  japaneseForm,
  japanesePointer,
  pointerLine,
  shortLines,
  shortOfDefinition,
  shortOfPairSenses,
  shortOfSenses,
  translatedLine,
} from "./short-lines";

describe("cleanShort", () => {
  it("removes 《…》 notes and 『』 marks and cuts at the first ;", () => {
    expect(cleanShort("《可能性の推量》…『かもしれない』;たぶん")).toBe(
      "…かもしれない",
    );
  });
  it("removes nested 《…》 notes", () => {
    expect(
      cleanShort("のらくらする《+『around』(『along』),《英》『about』》"),
    ).toBe("のらくらする");
  });
  it("removes EJDict's 〈C〉/〈U〉 and {形} marks but keeps other 〈…〉 notes", () => {
    expect(cleanShort("〈C〉〈U〉『色』,色彩")).toBe("色,色彩");
    expect(cleanShort("〈人が〉『急ぐ』")).toBe("〈人が〉急ぐ");
    expect(cleanShort("{形} 大丈夫な")).toBe("大丈夫な");
  });
  it("gives nothing for a sense that is only a note", () => {
    expect(cleanShort("《be の仮定法過去》")).toBe("");
  });

  it("cuts at the first sense separator outside brackets", () => {
    expect(cleanShort("…の,…のものである・…でできた")).toBe(
      "…の,…のものである",
    );
    expect(cleanShort("塩／食塩")).toBe("塩");
    expect(cleanShort("見ること 見える範囲")).toBe("見ること");
    expect(cleanShort("テキサス州(米国西南部の州;州都は Austin)")).toBe(
      "テキサス州(米国西南部の州;州都は Austin)",
    );
    expect(cleanShort("〈ある形・模様など〉を作る")).toBe(
      "〈ある形・模様など〉を作る",
    );
  });
  it("keeps a katakana name and Latin text whole", () => {
    expect(cleanShort("ジョン・スミス")).toBe("ジョン・スミス");
    expect(cleanShort("it is, it hasの短縮形")).toBe("it is, it hasの短縮形");
  });
  it("skips senses that come out empty", () => {
    expect(cleanShort("・・・・すべきである,するのが当然である")).toBe(
      "すべきである,するのが当然である",
    );
  });
  it("keeps a pointer whole", () => {
    expect(cleanShort("findの過去・過去分詞")).toBe("findの過去・過去分詞");
    expect(cleanShort("beの三人称・単数・現在")).toBe("beの三人称・単数・現在");
  });
  it("drops kana readings after kanji", () => {
    expect(cleanShort("戴冠(たいかん)式,即位式")).toBe("戴冠式,即位式");
    expect(cleanShort("私を(に)")).toBe("私を(に)");
  });
  it("drops repeated items", () => {
    expect(cleanShort("最後の,最後の,究極の")).toBe("最後の,究極の");
  });
  it("keeps a line within 25 Japanese characters", () => {
    expect(
      cleanShort("(名身が生れつき備えている,また物事を遂行できる)能力,力"),
    ).toBe("能力,力");
    expect(
      cleanShort(
        "〈人が〉(当然の権利として)…を要求する,請求する,を自分の物だと主張する",
      ),
    ).toBe("〈人が〉…を要求する,請求する");
  });
});

describe("capLine", () => {
  it("counts wide characters twice", () => {
    expect(displayWidth("能力 ab")).toBe(7);
  });
  it("keeps a line that fits", () => {
    expect(capLine("能力,力", 8)).toBe("能力,力");
  });
  it("cuts at the last comma that fits", () => {
    expect(capLine("能力,力量,手腕", 10)).toBe("能力,力量");
    expect(capLine("To seek, to try to find something", 20)).toBe("To seek");
    expect(capLine("锦标赛，联赛，比赛", 12)).toBe("锦标赛，联赛");
  });
  it("leaves out notes in parentheses before cutting", () => {
    expect(capLine("(何かの)能力,力", 8)).toBe("能力,力");
    expect(capLine("(ある目標に)向く,(人に)向く,刺す", 14)).toBe("向く,刺す");
  });
  it("cuts hard with an ellipsis, at a space in Latin text", () => {
    expect(capLine("ちんぷんかんぷんの言葉", 10)).toBe("ちんぷん…");
    expect(capLine("A person who studies languages", 20)).toBe("A person who…");
    expect(capLine("ab日本語の言葉です", 9)).toBe("ab日本語…");
  });
  it("gives marks over a letter no width, and cuts Thai between words", () => {
    // ผู้ is one letter with two marks over it.
    expect(displayWidth("ผู้แทน")).toBe(4);
    expect(capLine("การประชุมสภาผู้แทนราษฎรครั้งที่สองของปีนี้", 20)).toBe(
      "การประชุมสภาผู้แทน…",
    );
  });
  it("cuts a text whose words touch at a space between phrases, as at a comma", () => {
    const the =
      "คำใช้บ่งบอกเน้นคำนาม เพื่อให้รู้ว่าเป็นคำนามนี้โดยเฉพาะ ไม่ใช่อื่นใด";
    expect(capLine(the, 50)).toBe(
      "คำใช้บ่งบอกเน้นคำนาม เพื่อให้รู้ว่าเป็นคำนามนี้โดยเฉพาะ",
    );
    // The space after a comma cuts at the comma.
    expect(
      capLine("อาหารมื้อเย็น, งานเลี้ยงอาหารค่ำ, มื้อใหญ่ของวัน", 32),
    ).toBe("อาหารมื้อเย็น, งานเลี้ยงอาหารค่ำ");
    // Spaces between words are no phrase ends, in a line of touching words too.
    expect(capLine("A person who studies languages", 20)).toBe("A person who…");
    expect(capLine("アメリカ航空宇宙局 The National Aeronautics", 30)).toBe(
      "アメリカ航空宇宙局 The Nation…",
    );
  });
});

describe("shortOfSenses", () => {
  it("is the first sense's short definition (the definitions packs store none)", () => {
    expect(
      shortOfSenses([
        ["noun", "[Rare] A plan; a scheme."],
        ["verb", "To plan."],
      ]),
    ).toBe("A plan");
    expect(
      shortOfSenses([["verb", "to have; forms the perfect", "auxiliary"]]),
    ).toBe("to have");
  });
  it("is empty for an entry with no senses", () => {
    expect(shortOfSenses([])).toBe("");
  });
});

describe("shortOfPairSenses", () => {
  it("is a hinted sense's first translation (a translation table's, a wordnet's)", () => {
    expect(
      shortOfPairSenses([
        ["noun", "corteza, costra", "outer layer of bread"],
        ["noun", "Pieza de pan."],
      ]),
    ).toBe("corteza");
  });
  it("reads any other first sense as a definition: an edition's gloss, a pointer", () => {
    expect(shortOfPairSenses([["noun", "Pieza de pan."]])).toBe("Pieza de pan");
    expect(
      shortOfPairSenses([
        ["verb", "Pasado simple del verbo (to) tell.", null, "tell"],
      ]),
    ).toBe("Pasado simple del verbo (to) tell");
  });
  it("is empty for an entry with no senses", () => {
    expect(shortOfPairSenses([])).toBe("");
  });
});

describe("shortOfDefinition", () => {
  it("cuts at the first ; and drops a final period", () => {
    expect(shortOfDefinition("To reveal a secret; to tell.")).toBe(
      "To reveal a secret",
    );
    expect(shortOfDefinition(" From the beginning. ")).toBe(
      "From the beginning",
    );
    expect(shortOfDefinition("e.g. bread")).toBe("e.g. bread");
  });
  it("reads the full-width semicolon and period of Chinese glosses alike", () => {
    expect(shortOfDefinition("大学教师；学者")).toBe("大学教师");
    expect(shortOfDefinition("微笑。")).toBe("微笑");
  });
  it("does not cut inside brackets", () => {
    expect(shortOfDefinition("(of a person; informal) Dim; stupid.")).toBe(
      "(of a person; informal) Dim",
    );
  });
});

describe("definitionLine", () => {
  it("keeps a definition within 40 characters", () => {
    expect(definitionLine("To reveal a secret; to tell.")).toBe(
      "To reveal a secret",
    );
    expect(
      definitionLine("To seek, to try to find, to look around for something."),
    ).toBe("To seek, to try to find");
  });

  it("leaves out a note in square brackets that opens the gloss", () => {
    expect(definitionLine("[with dative] in (pertaining to)")).toBe(
      "in (pertaining to)",
    );
    expect(definitionLine("[auxiliary sein] to wander, to roam")).toBe(
      "to wander, to roam",
    );
    // Only a note: no line, the next sense shows.
    expect(
      definitionLine("[with nach (+ dative) ‘like someone/something’]"),
    ).toBe("");
    // A bracket later in the gloss is part of it.
    expect(definitionLine("to look [at something]")).toBe(
      "to look [at something]",
    );
  });

  it("gives the translations a description of the word names", () => {
    expect(
      definitionLine(
        "The most common adverb of negation in French, typically translating into English as not, don't, doesn't, etc.",
      ),
    ).toBe("not, don't, doesn't");
    expect(
      definitionLine(
        "Used to indicate that something exists (often with a certain property and/or in a certain location). Usually translated as there is/are or there exist(s)",
      ),
    ).toBe("there is/are, there exist(s)");
    // Not a description, nothing that translates, or a note in brackets: as written.
    expect(
      definitionLine(
        "used attributively, often translated into English as a compound word",
      ),
    ).toBe("used attributively");
    expect(
      definitionLine(
        'Denotes a part of a set, may be translated as "including" or such as in some situations.',
      ),
    ).toBe("Denotes a part of a set");
    expect(
      definitionLine(
        "hard (functions as an adverb in Spanish but translates as an adjective in English)",
      ),
    ).toBe("hard");
  });
});

describe("japaneseForm", () => {
  it("names the word a sense says this one is a form of, and what follows", () => {
    expect(japaneseForm("goの過去")).toEqual({
      target: "go",
      grammar: "過去",
      rest: "",
    });
    expect(japaneseForm("tell の過去・過去分詞")).toMatchObject({
      target: "tell",
      rest: "",
    });
    expect(
      japaneseForm(
        "haveの過去形・《過去のある時における動作の完了・結果》…『して[しまって]いた』",
      ),
    ).toEqual({
      target: "have",
      grammar: "過去形・",
      rest: "…して[しまって]いた",
    });
    expect(
      japaneseForm(
        "(『good』 の比較級;最上級は 『best』)『いっそうよい』,もっとすぐれた",
      ),
    ).toEqual({
      target: "good",
      grammar: "比較級;最上級は best",
      rest: "いっそうよい,もっとすぐれた",
    });
  });
  it("finds no form in a meaning, a reference or a pointer to several words", () => {
    expect(japaneseForm("『明白な』,決定的な")).toBeUndefined();
    expect(japaneseForm("=anyhow")).toBeUndefined();
    expect(japaneseForm("silverの化学記号")).toBeUndefined();
    expect(japaneseForm("am not, is notの短縮形")).toBeUndefined();
  });
});

describe("japanesePointer", () => {
  it("knows forms of other words and the word they name", () => {
    expect(japanesePointer("goの過去")).toEqual({ kind: "form", target: "go" });
    expect(japanesePointer("findの過去・過去分詞")).toEqual({
      kind: "form",
      target: "find",
    });
    expect(japanesePointer("childの複数形")).toEqual({
      kind: "form",
      target: "child",
    });
    expect(
      japanesePointer(
        "be の直説法一,二,三人称複数の過去形および二人称単数の過去形",
      ),
    ).toEqual({ kind: "form", target: "be" });
    expect(japanesePointer("sweep (掃く, 払う) の過去・過去分詞")).toEqual({
      kind: "form",
      target: "sweep",
    });
  });
  it("names no word when a form points to several", () => {
    expect(japanesePointer("am not, is notの短縮形")).toEqual({ kind: "form" });
    expect(japanesePointer("=Archeozoic,Archae")).toEqual({
      kind: "reference",
    });
  });
  it("names the first of several spellings of one word", () => {
    expect(japanesePointer("=OK,O.K.")).toEqual({
      kind: "reference",
      target: "ok",
    });
  });
  it("knows cross-references, without their sense number", () => {
    expect(japanesePointer("=anyhow")).toEqual({
      kind: "reference",
      target: "anyhow",
    });
    expect(japanesePointer("=noon 1")).toEqual({
      kind: "reference",
      target: "noon",
    });
    expect(japanesePointer("＝Mach number")).toEqual({
      kind: "reference",
      target: "mach number",
    });
  });
  it("leaves senses that say something of their own", () => {
    for (const line of [
      "のこぎり",
      "silverの化学記号",
      "=achoo (くしゃみの音)",
      "砂糖の円すい形の塊(=sugar loaf)",
      "(…の上に)〈建物など〉を建てる",
    ])
      expect(japanesePointer(line), line).toBeUndefined();
  });
});

describe("shortLines", () => {
  const entries: Record<string, string[]> = {
    go: ["行く", "去る", "進む", "=went"],
    find: ["…を見つける", "…を見つけだす"],
    anyhow: ["", "どうしても", "いずれにせよ", "どうにかこうにか", "=anyway"],
    those: ["それら", "あれら"],
  };
  const options = (head: string) => ({
    head,
    pointer: japanesePointer,
    follow: (target: string) => entries[target],
  });

  it("gives the first three lines in dictionary order", () => {
    expect(shortLines(["束", "房", "一団", "たくさん"], "束")).toEqual([
      "束",
      "房",
      "一団",
    ]);
  });

  it("leaves out empty lines and repeats", () => {
    expect(shortLines(["", "色,色彩", "", "色,色彩", "絵の具"], "色")).toEqual([
      "色,色彩",
      "絵の具",
    ]);
  });

  it("leaves out a line that says what one before it says", () => {
    expect(shortLines(["davvero", "veramente", "davvero?"], "x")).toEqual([
      "davvero",
      "veramente",
    ]);
    expect(shortLines(["Gracias", "¡Gracias!"], "x")).toEqual(["Gracias"]);
    expect(shortLines(["的", "...的"], "x")).toEqual(["的"]);
    // Case and brackets say something.
    expect(shortLines(["Morgen", "morgen"], "x")).toEqual(["Morgen", "morgen"]);
    expect(shortLines(["…を研究する", "(…を)研究する"], "x")).toHaveLength(2);
  });

  it("leaves out a shown line whose items earlier lines give, notes aside", () => {
    expect(
      shortLines(["must, to have to, should", "must", "should", "duty"], "x"),
    ).toEqual(["must, to have to, should"]);
    expect(
      shortLines(["for (intended for)", "for", "for, because of"], "x"),
    ).toEqual(["for (intended for)", "for, because of"]);
    expect(
      shortLines(["それは(を),そのことは(を)", "それは", "(遊戯の)鬼"], "x"),
    ).toEqual(["それは(を),そのことは(を)", "(遊戯の)鬼"]);
    // An item of its own keeps the line; case counts.
    expect(shortLines(["now", "now, then"], "x")).toEqual(["now", "now, then"]);
    expect(shortLines(["Morgen", "morgen"], "x")).toHaveLength(2);
  });

  it("follows a form to the word it names", () => {
    expect(shortLines(["goの過去"], "goの過去", options("went"))).toEqual([
      "goの過去",
      "行く",
      "去る",
    ]);
  });

  it("puts the form's first meaning before the word's own meanings", () => {
    expect(
      shortLines(
        ["findの過去・過去分詞", "…を創設する", "…を建てる"],
        "findの過去・過去分詞",
        options("found"),
      ),
    ).toEqual(["findの過去・過去分詞", "…を見つける", "…を創設する"]);
  });

  it("follows a cross-reference of a word with no meaning of its own", () => {
    expect(shortLines(["=anyhow"], "=anyhow", options("anyway"))).toEqual([
      "どうしても",
      "いずれにせよ",
      "どうにかこうにか",
    ]);
  });

  it("does not follow a pointer after the word's own meanings", () => {
    expect(
      shortLines(["彼らを(に)", "=those"], "彼らを(に)", options("them")),
    ).toEqual(["彼らを(に)"]);
    expect(
      shortLines(
        ["=lawyer", "代理人", "childの複数形", "=attorney", "弁護士"],
        "=lawyer",
        { pointer: japanesePointer },
      ),
    ).toEqual(["代理人", "弁護士"]);
  });

  it("follows one hop, never back to the word itself", () => {
    expect(
      shortLines(["=anyhow", "=anyway"], "=anyhow", options("anyway")),
    ).toEqual(["どうしても", "いずれにせよ", "どうにかこうにか"]);
    expect(shortLines(["=go"], "=go", options("go"))).toEqual(["=go"]);
  });

  it("keeps a form that is the first sense first, then the meanings", () => {
    expect(
      shortLines(
        ["feelの過去・過去分詞", "フェルト,毛せん", "フェルト製品", "=felt2"],
        "feelの過去・過去分詞",
        { pointer: japanesePointer },
      ),
    ).toEqual(["feelの過去・過去分詞", "フェルト,毛せん", "フェルト製品"]);
  });

  it("keeps pointers when nothing else is left", () => {
    expect(
      shortLines(["getの過去・過去分詞"], "getの過去", {
        pointer: japanesePointer,
      }),
    ).toEqual(["getの過去・過去分詞"]);
    expect(
      shortLines(["goの過去", "=went"], "goの過去", {
        pointer: japanesePointer,
      }),
    ).toEqual(["goの過去", "=went"]);
    expect(
      shortLines(["am not, is notの短縮形"], "", options("ain't")),
    ).toEqual(["am not, is notの短縮形"]);
  });

  it("falls back to the short meaning when every line is empty", () => {
    expect(shortLines(["", ""], "be の仮定法過去")).toEqual([
      "be の仮定法過去",
    ]);
    expect(shortLines([], "束")).toEqual(["束"]);
  });

  it("follows the short meaning when it is a pointer and every line is empty", () => {
    expect(shortLines(["", ""], "goの過去形", options("went"))).toEqual([
      "goの過去形",
      "行く",
      "去る",
    ]);
  });

  it("shows a first form that comes second after its target's first meaning", () => {
    expect(
      shortLines(["goの過去"], "goの過去", {
        ...options("went"),
        second: () => true,
      }),
    ).toEqual(["行く", "goの過去", "去る"]);
  });

  it("puts meanings of another part of speech after the followed ones", () => {
    const aside = (line: string) => line === "去る" || line === "行き";
    // went/VBD, its own noun "行き" set aside after go's verbs.
    expect(
      shortLines(["goの過去", "行き"], "goの過去", {
        ...options("went"),
        aside,
      }),
    ).toEqual(["goの過去", "行く", "進む"]);
    // Nothing followed: the order stays.
    expect(shortLines(["行き", "行く"], "行き", { aside })).toEqual([
      "行き",
      "行く",
    ]);
  });

  it("leaves a quiet first form out while a meaning shows", () => {
    const quiet = {
      ...options("went"),
      quiet: (line: string) => line === "goの過去",
    };
    // Before the cap of three lines: the card shows three meanings.
    expect(shortLines(["goの過去"], "goの過去", quiet)).toEqual([
      "行く",
      "去る",
      "進む",
    ]);
    // Nothing else to show: the form stays.
    expect(
      shortLines(["getの過去・過去分詞"], "", {
        pointer: japanesePointer,
        quiet: () => true,
      }),
    ).toEqual(["getの過去・過去分詞"]);
  });
});

describe("pointerLine", () => {
  it("is the pointer's first sense without notes and closing marks, whole", () => {
    expect(pointerLine("Pasado simple del verbo (to) tell.")).toBe(
      "Pasado simple del verbo tell",
    );
    expect(pointerLine("passado simples do verbo do:")).toBe(
      "passado simples do verbo do",
    );
    expect(
      pointerLine(
        "Tercera persona del singular (he, she, it) del presente simple de have",
      ),
    ).toBe("Tercera persona del singular del presente simple de have");
    expect(pointerLine("（非正式）does的紧缩")).toBe("does的紧缩");
  });
  it("fits 40 for a pointer that comes first, the native cap for one second", () => {
    expect(fitsPairCap("pasado simple del verbo tell")).toBe(true);
    expect(fitsPairCap("passado simples e particípio do verbo tell")).toBe(
      false,
    );
    expect(
      fitsPairCap("passado simples e particípio do verbo tell", true),
    ).toBe(true);
    expect(
      fitsPairCap(
        "Tercera persona del singular del presente simple de have",
        true,
      ),
    ).toBe(false);
  });
});

describe("firstSentence", () => {
  it("ends at a period before a capital or an arrow", () => {
    expect(firstSentence("Más. Comparativo de much")).toBe("Más");
    expect(firstSentence("Enfant . Note d’usage : Utilisé…")).toBe("Enfant");
    expect(firstSentence("Coche. → voir check mark")).toBe("Coche");
    expect(
      firstSentence("maison (famille). Note d’usage : le « h » est…"),
    ).toBe("maison (famille)");
  });
  it("does not end after an abbreviation or a number", () => {
    expect(firstSentence("EE. UU.")).toBe("EE. UU.");
    expect(firstSentence("a. de J. C. (antes de Jesucristo)")).toBe(
      "a. de J. C. (antes de Jesucristo)",
    );
    expect(firstSentence("3. Person Singular")).toBe("3. Person Singular");
    expect(firstSentence("Más. comparativo")).toBe("Más. comparativo");
    // An abbreviation the data build learned has a no-break space after it.
    expect(firstSentence("Gegenstand bzw.\u00a0Ergänzung. Note")).toBe(
      "Gegenstand bzw.\u00a0Ergänzung",
    );
  });
});

describe("editionLine", () => {
  it("drops sense subscripts after a word and an opening ellipsis", () => {
    expect(editionLine("Exigir, pedir₃")).toBe("Exigir, pedir");
    expect(editionLine("Ley₁₋₉")).toBe("Ley");
    expect(editionLine("Dioxígeno (O₂)")).toBe("Dioxígeno (O₂)");
    expect(editionLine("…służący do tworzenia pytań")).toBe(
      "służący do tworzenia pytań",
    );
    expect(editionLine("……上")).toBe("上");
  });
  it("drops a label of several words in brackets that opens it", () => {
    expect(editionLine("(w religiach monoteistycznych) Bóg")).toBe("Bóg");
    expect(
      editionLine("（同 are not, aren’t; is not, isn’t; am not）不是"),
    ).toBe("不是");
    // And an abbreviation in brackets: the data build brackets an edition's opening
    // label abbreviations (ru "истор. Британия", whose first sentence was "истор").
    expect(editionLine("(истор.) Британия")).toBe("Британия");
    expect(editionLine("(the Plough) (астрон.) Большая Медведица")).toBe(
      "Большая Медведица",
    );
    // One word in brackets is part of the meaning, or a note kept.
    expect(editionLine("(Ne) … pas")).toBe("(Ne) … pas");
    expect(editionLine("（现多）点燃，燃烧")).toBe("（现多）点燃，燃烧");
    // A gloss that is only a note stays.
    expect(editionLine("(neutro)")).toBe("(neutro)");
  });
  it("is the first sentence, without usage notes and closing marks", () => {
    expect(editionLine("Más. Comparativo de much")).toBe("Más");
    expect(editionLine("Tout à l’heure. Note d’usage : Placé…")).toBe(
      "Tout à l’heure",
    );
    expect(editionLine("equivalente à conjunção e:")).toBe(
      "equivalente à conjunção e",
    );
    expect(editionLine("Luz.")).toBe("Luz");
    expect(editionLine("EE. UU.")).toBe("EE. UU.");
  });
  it("is what a qualifier introduces", () => {
    expect(
      editionLine(
        "De un recurso o sustancia, generalmente alimento: consumir, usar",
      ),
    ).toBe("consumir, usar");
    expect(editionLine("często przed gerund: mój, swój")).toBe("mój, swój");
    expect(editionLine("„you are, 2. Person Singular:“ du bist")).toBe(
      "du bist",
    );
    expect(editionLine("United States → Stany Zjednoczone, USA")).toBe(
      "Stany Zjednoczone, USA",
    );
    // A colon in a later sense is that sense's own, not a qualifier of the gloss.
    expect(
      editionLine(
        "bloqueo; Situación dentro de un sistema informático en la que dos o más tareas por ejemplo: hilos o procesos están esperándose",
      ),
    ).toBe("bloqueo");
    // A translation and its explanation, or one word before the colon, stay.
    expect(editionLine("Mil millones: un 1 seguido por 9 ceros")).toBe(
      "Mil millones: un 1 seguido por 9 ceros",
    );
    expect(editionLine("tudo: todas as coisas")).toBe("tudo: todas as coisas");
    expect(editionLine("hora 10:30")).toBe("hora 10:30");
  });
  it("is the translations a description is followed by", () => {
    expect(
      editionLine(
        "Pronombre de segunda persona singular y plural; tú, vos, usted",
      ),
    ).toBe("tú, vos, usted");
    expect(
      editionLine("caso nominativo da segunda pessoa do singular, tu, você"),
    ).toBe("tu, você");
    // Items of more words after a description qualify it.
    expect(
      editionLine("Acción y efecto de comer, especialmente en grupo, juntos"),
    ).toBe("Acción y efecto de comer, especialmente en grupo");
    expect(editionLine("Nosotros, pronombre personal de primera persona")).toBe(
      "Nosotros, pronombre personal de primera persona",
    );
  });
  it("is cut to the native cap of 50", () => {
    expect(
      editionLine("służący do tworzenia czasów typu continuous i perfect"),
    ).toBe("służący do tworzenia czasów typu continuous i…");
  });
});

describe("describes", () => {
  it("knows a first item of more than three words outside brackets", () => {
    expect(describes("stosowany przed wyrazem znanym z kontekstu")).toBe(true);
    expect(describes("eles ou elas")).toBe(false);
    expect(describes("el, la, los, las")).toBe(false);
    expect(describes("on (do osoby lub zwierzęcia płci męskiej)")).toBe(false);
  });
});

describe("translatedLine", () => {
  it("drops a final period and repeated items", () => {
    expect(translatedLine("組み立て、構築、構築、または定式化。", "ja")).toBe(
      "組み立て、構築、または定式化",
    );
    expect(translatedLine("明らかに、明らかに", "ja")).toBe("明らかに");
  });

  it("keeps the first sentence of a long Japanese line, without notes in brackets", () => {
    expect(
      translatedLine(
        "丸みを帯びた、または雲の形をした輪郭。通常は単語を含み、漫画の思考を表す。",
        "ja",
      ),
    ).toBe("丸みを帯びた、または雲の形をした輪郭");
    // A particle the note leaves after a dependent ending goes with it.
    expect(
      translatedLine(
        "多くの場合、事前に決められた時間および/または場所で (誰か) と一緒に来る",
        "ja",
      ),
    ).toBe("事前に決められた時間および/または場所で一緒に来る");
    expect(
      translatedLine(
        "(文書や事実などの集まり) を調べて、それらを理解する、または整理する",
        "ja",
      ),
    ).toBe("調べて、それらを理解する、または整理する");
  });

  it("cuts a long Japanese line after a clause of its own, or keeps its main verb", () => {
    // The longer of a head that ends a clause and a tail.
    expect(
      translatedLine(
        "通過する、通過する、通過する、またはある場所を横切る、または別の場所に移動する",
        "ja",
      ),
    ).toBe("ある場所を横切る、または別の場所に移動する");
    expect(
      translatedLine(
        "誤って作成する、捏造する、偽造する、でっち上げる、または架空の話を作り上げて広める",
        "ja",
      ),
    ).toBe("誤って作成する、捏造する、偽造する、でっち上げる");
    // A head ending in …たり depends on what follows: the tail keeps the main verb.
    expect(
      translatedLine(
        "腕を伸ばしたり、手を動かしたりして、何かを手に入れようとする",
        "ja",
      ),
    ).toBe("手を動かしたりして、何かを手に入れようとする");
    // No comma: the longest tail after a particle, which keeps the main verb.
    expect(
      translatedLine(
        "トランスミッションまたは他のギアボックスで利用可能なギアの2番目",
        "ja",
      ),
    ).toBe("他のギアボックスで利用可能なギアの2番目");
    expect(
      translatedLine(
        "ドアまたは通路を通って部屋またはその他のスペースに入る",
        "ja",
      ),
    ).toBe("通路を通って部屋またはその他のスペースに入る");
  });

  it("caps a line in another language at 50 characters, its first sentence", () => {
    expect(
      translatedLine(
        "Ensamblar, construir, construir o formular algo nuevo y distinto.",
        "es",
      ),
    ).toBe("Ensamblar, construir");
    expect(
      translatedLine("Aumentar la velocidad de un motor parado.", "es"),
    ).toBe("Aumentar la velocidad de un motor parado");
    expect(translatedLine("Un saludo. Se usa por la mañana.", "es")).toBe(
      "Un saludo",
    );
    expect(translatedLine("问候。早上使用。", "zh")).toBe("问候");
  });
});
