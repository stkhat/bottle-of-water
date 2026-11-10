import { describe, expect, it } from "vitest";
import { learningLanguages, nativeLanguages, speechLang } from "./languages";

describe("learningLanguages", () => {
  it("lists English, then Spanish", () => {
    expect(learningLanguages()).toEqual(["en", "es"]);
  });
});

describe("nativeLanguages", () => {
  it("lists the languages each learning language has a dictionary into", () => {
    expect(nativeLanguages("en")).toEqual(["ja"]);
    expect(nativeLanguages("es")).toEqual(["en"]);
  });

  it("has none for a language without a pack", () => {
    expect(nativeLanguages("de")).toEqual([]);
    expect(nativeLanguages("toString")).toEqual([]);
  });
});

describe("speechLang", () => {
  it("picks a regional voice for each learning language", () => {
    expect(speechLang("en")).toBe("en-US");
    expect(speechLang("es")).toBe("es-ES");
  });

  it("keeps other codes as they are", () => {
    expect(speechLang("de")).toBe("de");
    expect(speechLang("constructor")).toBe("constructor");
  });
});
