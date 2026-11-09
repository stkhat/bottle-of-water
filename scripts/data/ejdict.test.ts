import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanShort, parseEjdict, vocabularyOf } from "./ejdict.mjs";

const fixture = readFileSync(
  join(import.meta.dirname, "fixtures", "ejdict.txt"),
  "utf8",
);

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
});

describe("parseEjdict", () => {
  const dict = parseEjdict(fixture);

  it("splits the meaning on ' / ' into trimmed senses", () => {
    expect(dict.dough).toEqual([
      "練り粉,こね粉,生パン",
      ["練り粉,こね粉,生パン", "《おもに米俗》金銭,ぜに"],
    ]);
  });
  it("expands comma-separated variants into separate keys", () => {
    expect(dict.color).toEqual(dict.colour);
    expect(dict.color?.[0]).toBe("色,色彩");
  });
  it("lowercases headwords and keeps multi-word headwords", () => {
    expect(dict["figure of speech"]?.[1]).toEqual([
      "比喩(ひゆ)[的表現],言葉のあや",
    ]);
    expect(dict["jim crow"]).toEqual(["黒人差別", ["《米話》黒人差別"]]);
    expect(Object.keys(dict)).not.toContain("May");
  });
  it("takes the short from the first sense that is not empty after cleanup", () => {
    expect(dict.the?.[0]).toBe("その,あの");
  });
  it("keeps the note text when every sense is only a note", () => {
    expect(parseEjdict("were\t《be の過去形》 / 《be の仮定法過去》")).toEqual({
      were: ["be の過去形", ["《be の過去形》", "《be の仮定法過去》"]],
    });
  });
  it("merges headwords that differ only in case, lowercase headword first", () => {
    expect(dict.may).toEqual([
      "…かもしれない",
      [
        "《可能性の推量》…『かもしれない』",
        "《許可》…『してもよい』",
        "『5月』",
      ],
    ]);
  });
  it("ignores blank lines and CRLF line endings", () => {
    expect(parseEjdict("dough\tパン生地\r\n\r\n")).toEqual({
      dough: ["パン生地", ["パン生地"]],
    });
  });
});

describe("vocabularyOf", () => {
  it("is the single-word headwords", () => {
    expect(vocabularyOf(parseEjdict(fixture)).sort()).toEqual([
      "color",
      "colour",
      "dough",
      "loaf",
      "may",
      "the",
    ]);
  });
});
