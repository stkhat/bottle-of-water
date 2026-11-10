import { describe, expect, it } from "vitest";
import { languageName, languageOption, languagePair } from "./languages";

describe("languageOption", () => {
  it("names a language as a menu offers it, in its own script too", () => {
    expect(languageOption("en")).toBe("English");
    expect(languageOption("ja")).toBe("Japanese (日本語)");
    expect(languageOption("es")).toBe("Spanish (Español)");
  });

  it("shows an unknown code as it is", () => {
    expect(languageOption("de")).toBe("de");
    expect(languageOption("constructor")).toBe("constructor");
  });
});

describe("languageName", () => {
  it("names a language as a sentence does", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName("es")).toBe("Spanish");
    expect(languageName("de")).toBe("de");
  });
});

describe("languagePair", () => {
  it("names the learning language, then the native one", () => {
    expect(languagePair("en", "ja")).toBe("English → Japanese");
    expect(languagePair("es", "en")).toBe("Spanish → English");
  });
});
