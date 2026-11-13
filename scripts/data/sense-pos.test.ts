import { describe, expect, it } from "vitest";
import { inferPos, labelSenses, sensePos } from "./sense-pos.ts";

const pos = (senses: string[], candidates: string[]) =>
  labelSenses(senses, candidates).map((label) =>
    label.pos === undefined
      ? "-"
      : `${label.pos}${label.posBy ? `:${label.posBy}` : ""}`,
  );

describe("labelSenses", () => {
  it("labels a pointer by the form it names", () => {
    expect(
      pos(
        ["seeの過去", "『のこぎり』", "…を『のこぎりでひく』(切る)"],
        ["noun", "verb"],
      ),
    ).toEqual(["verb", "-", "verb"]);
    expect(pos(["boxの複数形"], ["noun", "verb"])).toEqual(["noun"]);
    expect(
      pos(
        ["(『good』 の比較級;最上級は 『best』)『いっそうよい』"],
        ["adjective", "adverb"],
      ),
    ).toEqual(["adjective"]);
  });
  it("reads EJDict's markers: {形} and the like, 〈C〉/〈U〉 for nouns in the first item", () => {
    expect(pos(["{形}要求の多い", "〈U〉要求"], ["adjective", "noun"])).toEqual(
      ["adjective", "noun"],
    );
    // A noun sense merged after a verb's does not make the sense a noun.
    expect(
      pos(["見える,姿を見せる・〈U〉見せること"], ["verb", "noun"]),
    ).toEqual(["verb"]);
  });
  it("reads notes that name a part of speech; a note alone heads the senses after it", () => {
    expect(
      pos(["《疑問代名詞》", "だれ", "どなた"], ["pronoun", "noun"]),
    ).toEqual(["pronoun", "pronoun", "pronoun"]);
    expect(
      pos(["《補語にのみ用いて》元気な", "罰金"], ["adjective", "noun"]),
    ).toEqual(["adjective", "noun:weak"]);
  });
  it("reads the main item's ending", () => {
    expect(
      pos(
        [
          "…を発酵させる",
          "発酵する",
          "『速い』,急速な",
          "『速く』,急速に",
          "断食",
        ],
        ["verb", "adjective", "adverb", "noun"],
      ),
    ).toEqual(["verb", "verb", "adjective", "adverb", "noun:weak"]);
    expect(pos(["…を含んで,入れて"], ["preposition", "verb"])).toEqual([
      "preposition",
    ]);
    expect(pos(["…に似た,のような"], ["preposition", "verb"])).toEqual([
      "preposition",
    ]);
  });
  it("reads nothing from a pattern's ending", () => {
    expect(pos(["『何も…ない』"], ["pronoun", "adjective"])).toEqual(["-"]);
  });
  it("labels only with the word's parts of speech, or the nearest one it has", () => {
    expect(pos(["静かな"], ["noun", "verb"])).toEqual(["-"]);
    expect(pos(["《疑問形容詞》どの"], ["determiner", "pronoun"])).toEqual([
      "determiner",
    ]);
  });
  it("fills an unlabelled run between two senses of the same part of speech", () => {
    expect(
      pos(["正しい", "当然の", "ちょうど", "公正な"], ["adjective", "adverb"]),
    ).toEqual(["adjective", "adjective", "adjective:gap", "adjective"]);
    // Not from a pointer: it names another word's form.
    expect(
      pos(["seeの過去", "『のこぎり』", "のこぎりでひく"], ["noun", "verb"]),
    ).toEqual(["verb", "-", "verb"]);
  });
  it("marks EJDict's core translations", () => {
    expect(
      labelSenses(["『りっぱな』,みごとな", "罰金"], ["adjective", "noun"]),
    ).toEqual([
      { pos: "adjective", core: true },
      { pos: "noun", posBy: "weak" },
    ]);
  });
});

describe("inferPos", () => {
  it("guesses a noun from a kanji or katakana ending, as a guess that also fits an adverb", () => {
    expect(inferPos("現在", ["noun", "adverb"])).toEqual({
      pos: "noun",
      weak: true,
    });
    expect(inferPos("ブーム", ["noun"])).toEqual({ pos: "noun", weak: true });
  });
});

describe("sensePos", () => {
  it("labels the words with several parts of speech, in the pack's code", () => {
    const { labels, senses, labelled } = sensePos(
      {
        fine: ["罰金", ["罰金", "〈人〉に罰金を科する", "『りっぱな』"]],
        dough: ["練り粉", ["練り粉"]],
        quiet: ["静かな", ["静かな"]],
      },
      {
        fine: ["noun", "verb", "adjective"],
        dough: ["noun"],
        quiet: ["verb", "noun"],
      },
    );
    expect(labels).toEqual({ fine: "n~ v a*" });
    expect({ senses, labelled }).toEqual({ senses: 4, labelled: 3 });
  });
});
