import { describe, expect, it } from "vitest";
import {
  capLine,
  cleanShort,
  definitionLine,
  displayWidth,
  japaneseForm,
  japanesePointer,
  shortLines,
  shortOfDefinition,
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
  });
  it("leaves out notes in parentheses before cutting", () => {
    expect(capLine("(何かの)能力,力", 8)).toBe("能力,力");
    expect(capLine("(ある目標に)向く,(人に)向く,刺す", 14)).toBe("向く,刺す");
  });
  it("cuts hard with an ellipsis, at a space in Latin text", () => {
    expect(capLine("ちんぷんかんぷんの言葉", 10)).toBe("ちんぷん…");
    expect(capLine("A person who studies languages", 20)).toBe("A person who…");
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
});
