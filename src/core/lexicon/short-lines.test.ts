import { describe, expect, it } from "vitest";
import {
  cleanShort,
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
  it("removes countability markers 〈C〉 and 〈U〉 but keeps other 〈…〉 notes", () => {
    expect(cleanShort("〈C〉〈U〉『色』,色彩")).toBe("色,色彩");
    expect(cleanShort("〈人が〉『急ぐ』")).toBe("〈人が〉急ぐ");
  });
  it("gives nothing for a sense that is only a note", () => {
    expect(cleanShort("《be の仮定法過去》")).toBe("");
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
});

describe("japanesePointer", () => {
  it("knows forms of other words", () => {
    for (const line of [
      "goの過去",
      "getの過去・過去分詞",
      "childの複数形",
      "be の直説法一,二,三人称複数の過去形",
      "am not, is notの短縮形",
    ])
      expect(japanesePointer(line), line).toBe("form");
  });
  it("knows cross-references", () => {
    for (const line of ["=color", "=noon 1", "＝gymnasium"])
      expect(japanesePointer(line), line).toBe("reference");
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

  it("leaves out cross-references and later forms when other lines remain", () => {
    expect(
      shortLines(
        ["=lawyer", "代理人", "childの複数形", "=attorney", "弁護士"],
        "=lawyer",
        japanesePointer,
      ),
    ).toEqual(["代理人", "弁護士"]);
  });

  it("keeps a form that is the first sense first, then the meanings", () => {
    expect(
      shortLines(
        ["feelの過去・過去分詞", "フェルト,毛せん", "フェルト製品", "=felt2"],
        "feelの過去・過去分詞",
        japanesePointer,
      ),
    ).toEqual(["feelの過去・過去分詞", "フェルト,毛せん", "フェルト製品"]);
  });

  it("keeps pointers when nothing else is left", () => {
    expect(
      shortLines(["getの過去・過去分詞"], "getの過去", japanesePointer),
    ).toEqual(["getの過去・過去分詞"]);
    expect(
      shortLines(["goの過去", "=went"], "goの過去", japanesePointer),
    ).toEqual(["goの過去", "=went"]);
    expect(
      shortLines(["=gray", "", "=gray"], "=gray", japanesePointer),
    ).toEqual(["=gray"]);
  });

  it("falls back to the short meaning when every line is empty", () => {
    expect(shortLines(["", ""], "be の仮定法過去")).toEqual([
      "be の仮定法過去",
    ]);
    expect(shortLines([], "束")).toEqual(["束"]);
  });
});
