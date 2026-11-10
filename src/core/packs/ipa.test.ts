import { describe, expect, it } from "vitest";
import { ipaFor } from "./ipa";

const ipa = { figure: "/ˈfɪɡjɚ/", out: "/aʊt/", dough: "/doʊ/" };

describe("ipaFor", () => {
  it("gives a word's IPA", () => {
    expect(ipaFor("dough", ipa)).toBe("/doʊ/");
    expect(ipaFor("Dough", ipa)).toBe("/doʊ/");
  });
  it("joins the words of a phrase inside one pair of slashes", () => {
    expect(ipaFor("figure out", ipa)).toBe("/ˈfɪɡjɚ aʊt/");
    expect(ipaFor(" figure  out ", ipa)).toBe("/ˈfɪɡjɚ aʊt/");
  });
  it("gives undefined when any word has no IPA", () => {
    expect(ipaFor("figure it out", ipa)).toBeUndefined();
    expect(ipaFor("zzyzx", ipa)).toBeUndefined();
    expect(ipaFor("", ipa)).toBeUndefined();
  });
  it("uses one transcription of a value that holds several", () => {
    const mixed = {
      ...ipa,
      play: "/pleɪ̯/ [pɫ̥eɪ̯ ~ pʰɫeɪ̯]",
      groin: "/ˈɡɹoɪ̯n/ ~ /ˈɡɹɔɪ̯n/",
      aha: "[ɑˈhɑ] ~ [ˈɑhɑ]",
      abc: "/eɪ biː ˈsiː/",
    };
    expect(ipaFor("play", mixed)).toBe("/pleɪ̯/");
    expect(ipaFor("play out", mixed)).toBe("/pleɪ̯ aʊt/");
    expect(ipaFor("groin", mixed)).toBe("/ˈɡɹoɪ̯n/");
    expect(ipaFor("aha", mixed)).toBe("[ɑˈhɑ]");
    expect(ipaFor("aha out", mixed)).toBe("/ɑˈhɑ aʊt/");
    expect(ipaFor("abc", mixed)).toBe("/eɪ biː ˈsiː/");
    expect(ipaFor("comma", { comma: "[ˈkɑ.mə ~ ˈkɑ.mʌ]" })).toBe("[ˈkɑ.mə]");
    expect(ipaFor("finale", { finale: "/fəˈnɑli" })).toBe("/fəˈnɑli/");
    expect(ipaFor("bath", { bath: "[bæθ~bɛəθ]" })).toBeUndefined();
    expect(ipaFor("dough", { dough: "doʊ ~ dəʊ" })).toBeUndefined();
  });
});
