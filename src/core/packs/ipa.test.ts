import { describe, expect, it } from "vitest";
import { dictionaryIpa, ipaFor } from "./ipa";

const ipa = { figure: "/ˈfɪɡjɚ/", out: "/aʊt/", dough: "/doʊ/" };

describe("ipaFor", () => {
  it("gives a word's IPA", () => {
    expect(ipaFor("dough", ipa)).toBe("/doʊ/");
    expect(ipaFor("Dough", ipa)).toBe("/doʊ/");
  });
  it("joins the words of a phrase inside one pair of slashes", () => {
    expect(ipaFor("figure out", ipa)).toBe("/ˈfɪɡjər aʊt/");
    expect(ipaFor(" figure  out ", ipa)).toBe("/ˈfɪɡjər aʊt/");
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
    expect(ipaFor("play", mixed)).toBe("/pleɪ/");
    expect(ipaFor("play out", mixed)).toBe("/pleɪ aʊt/");
    expect(ipaFor("groin", mixed)).toBe("/ˈɡroɪn/");
    expect(ipaFor("aha", mixed)).toBe("[ɑˈhɑ]");
    expect(ipaFor("aha out", mixed)).toBe("/ɑˈhɑ aʊt/");
    expect(ipaFor("abc", mixed)).toBe("/eɪ biː ˈsiː/");
    expect(ipaFor("comma", { comma: "[ˈkɑ.mə ~ ˈkɑ.mʌ]" })).toBe("[ˈkɑmə]");
    expect(ipaFor("finale", { finale: "/fəˈnɑli" })).toBe("/fəˈnɑli/");
    expect(ipaFor("bath", { bath: "[bæθ~bɛəθ]" })).toBeUndefined();
    expect(ipaFor("dough", { dough: "doʊ ~ dəʊ" })).toBeUndefined();
  });
});

describe("dictionaryIpa", () => {
  it("drops syllable dots, tie bars and diacritics", () => {
    expect(dictionaryIpa("/ˌɛd͡ʒ.əˈkeɪ.ʃən/")).toBe("/ˌɛdʒəˈkeɪʃən/");
    expect(dictionaryIpa("/ˈbʌt‿ɪt/")).toBe("/ˈbʌtɪt/");
    expect(dictionaryIpa("/ˈbʌt.n̩/")).toBe("/ˈbʌtn/");
    expect(dictionaryIpa("[pʰɫ̥eɪ̯]")).toBe("[pleɪ]");
  });
  it("writes the narrow US letters as dictionaries do", () => {
    expect(dictionaryIpa("/ɪkˈstɹɔɹdɪnɛɹi/")).toBe("/ɪkˈstrɔrdɪnɛri/");
    expect(dictionaryIpa("/ˈfɪɡjɚ/")).toBe("/ˈfɪɡjər/");
    expect(dictionaryIpa("/bɝd/")).toBe("/bɜːrd/");
  });
  it("keeps stress, length, optional sounds and the nasal tilde", () => {
    expect(dictionaryIpa("/ˌtɛnˈfɔː(ɹ)/")).toBe("/ˌtɛnˈfɔː(r)/");
    expect(dictionaryIpa("/ɑ̃ˈkɔɹ/")).toBe("/ɑ̃ˈkɔr/");
  });
  it("leaves Spanish letters alone", () => {
    expect(dictionaryIpa("/aisˈlaɾ/")).toBe("/aisˈlaɾ/");
    expect(dictionaryIpa("/ˈt͡ʃiko/")).toBe("/ˈtʃiko/");
  });
});
