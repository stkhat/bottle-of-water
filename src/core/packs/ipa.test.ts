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
});
