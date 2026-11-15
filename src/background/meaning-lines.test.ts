import { describe, expect, it } from "vitest";
import {
  definitionsToTranslate,
  lineOf,
  meaningLines,
  yourMeanings,
} from "./meaning-lines";

/** A dictionary whose lines are its senses' text in brackets, with the hint when there is one. */
const dictionary = {
  senseLine: (sense: { text: string; hint?: string }, glossLang?: string) =>
    `[${sense.text}${sense.hint ? ` / ${sense.hint}` : ""}${glossLang ? ` (${glossLang})` : ""}]`,
};

describe("lineOf", () => {
  const base = { nativeLang: "ja", dictionary, translations: {} };

  it("shows an AI meaning as the model answered", () => {
    expect(
      lineOf({ from: "ai", text: "（パン生地の）折り込み" }, base),
    ).toEqual({ line: "（パン生地の）折り込み" });
  });

  it("makes a dictionary meaning's line from the entry's own sense, with its hint", () => {
    const entry = {
      senses: [
        { pos: "noun", text: "lámpara, farol", hint: "source of illumination" },
      ],
    };
    expect(
      lineOf(
        { from: "dictionary", text: "lámpara, farol", pos: "noun" },
        { ...base, entry },
      ),
    ).toEqual({ line: "[lámpara, farol / source of illumination]" });
  });

  it("shows an English definition in its cached translation, as a hover line", () => {
    const meaning = {
      from: "dictionary" as const,
      text: "To reveal a secret.",
      glossLang: "en",
    };
    expect(definitionsToTranslate([meaning], "ja")).toEqual([
      "To reveal a secret.",
    ]);
    expect(
      lineOf(meaning, {
        ...base,
        translations: { "To reveal a secret.": "秘密を明かすこと。" },
      }),
    ).toEqual({ line: "秘密を明かすこと" });
    // Not translated yet: in English, marked so.
    expect(lineOf(meaning, base)).toEqual({
      line: "[To reveal a secret. (en)]",
      lineLang: "en",
    });
  });

  it("does not translate a definition in the native language", () => {
    const meaning = {
      from: "dictionary" as const,
      text: "To bend.",
      glossLang: "en",
    };
    expect(definitionsToTranslate([meaning], "en")).toEqual([]);
    expect(lineOf(meaning, { ...base, nativeLang: "en" })).toEqual({
      line: "[To bend. (en)]",
    });
  });

  it("keeps the meaning's text without the dictionary, or when nothing of its line is left", () => {
    const meaning = {
      from: "dictionary" as const,
      text: "《be の直説法過去》",
    };
    expect(lineOf(meaning, { nativeLang: "ja", translations: {} })).toEqual({
      line: "《be の直説法過去》",
    });
    expect(
      lineOf(meaning, { ...base, dictionary: { senseLine: () => "" } }),
    ).toEqual({ line: "《be の直説法過去》" });
  });
});

describe("yourMeanings and meaningLines", () => {
  const meaning = (key: string, from: "ai" | "dictionary", text: string) => ({
    key,
    termId: "en:fold",
    from,
    text,
    createdAt: 0,
  });
  const choice = (sentence: string, meaningKey: string, at: number) => ({
    termId: "en:fold",
    sourceId: "s1",
    sentence,
    meaningKey,
    at,
    deviceId: "d1",
    url: "https://example.com/bread",
  });
  const data = {
    meanings: [
      meaning("m-dough", "ai", "（パン生地の）折り込み"),
      meaning("m-mix", "dictionary", "（料理で）…をさっくり混ぜる"),
    ],
    choices: [
      choice("A fold.", "m-mix", 30),
      choice("One more fold.", "m-dough", 10),
      choice("Give it a fold.", "m-dough", 20),
    ],
  };
  const lines = { nativeLang: "ja", dictionary, translations: {} };

  it("gives each meaning its line, the one chosen here first", () => {
    const found = yourMeanings(
      data,
      { url: "https://example.com/bread", sentence: "A fold." },
      lines,
    );
    expect(found.chosenHere).toBe("m-mix");
    expect(
      found.yourMeanings.map(({ key, count, line }) => [key, count, line]),
    ).toEqual([
      ["m-mix", 1, "[（料理で）…をさっくり混ぜる]"],
      ["m-dough", 2, "（パン生地の）折り込み"],
    ]);
  });

  it("lists the meanings most chosen first, the AI's tagged", () => {
    expect(meaningLines(data, lines)).toEqual([
      { key: "m-dough", line: "（パン生地の）折り込み", ai: true },
      { key: "m-mix", line: "[（料理で）…をさっくり混ぜる]" },
    ]);
  });
});
