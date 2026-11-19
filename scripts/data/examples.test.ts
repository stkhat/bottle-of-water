import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countExamples,
  createCaseCounter,
  examplePieces,
  phraseVariants,
} from "./examples.ts";

describe("examplePieces", () => {
  it("cuts the entry's own headword out where kaikki marks it in bold", () => {
    expect(
      examplePieces({
        text: "Please give up; you know it’s over.",
        bold_text_offsets: [
          [12, 14],
          [7, 11],
        ],
      }),
    ).toEqual(["Please ", " ", "; you know it's over."]);
    expect(examplePieces({ text: "No marks." })).toEqual(["No marks."]);
    expect(examplePieces({})).toEqual([]);
  });
});

describe("phraseVariants", () => {
  it("writes each word as written or as an inflected form", () => {
    const variants = phraseVariants(
      ["give up", "spill the beans"],
      new Map([
        ["give", ["gave", "given"]],
        ["bean", ["beans"]],
      ]),
    );
    expect([...variants]).toEqual([
      ["give up", "give up"],
      ["spill the beans", "spill the beans"],
      ["gave up", "give up"],
      ["given up", "give up"],
    ]);
  });

  it("counts a key as written for itself, not as another key's variant", () => {
    const variants = phraseVariants(
      ["nach haus", "nach hause"],
      new Map([["haus", ["hause", "häuser"]]]),
    );
    expect(variants.get("nach hause")).toBe("nach hause");
    expect(variants.get("nach häuser")).toBe("nach haus");
  });
});

describe("countExamples", () => {
  it("counts words and phrases over every example, without the entries' own headwords", async () => {
    const fixture = join(
      import.meta.dirname,
      "fixtures",
      "kaikki-phrases.jsonl",
    );
    const counts = await countExamples(
      fixture,
      phraseVariants(["you know", "kind of", "give up", "new york"], new Map()),
    );
    expect(counts.phrases.get("you know")).toBe(5);
    expect(counts.phrases.get("kind of")).toBe(2);
    // "give" cuts "give" out of its example, "up" cuts "up".
    expect(counts.phrases.get("give up")).toBeUndefined();
    expect(counts.phrases.get("new york")).toBe(1);
    expect(counts.words.get("know")).toBe(6);
    expect(counts.tokens).toBeGreaterThan(40);
  });
});

describe("createCaseCounter", () => {
  const entry = (lang: string, ...texts: string[]) => ({
    word: "x",
    lang_code: lang,
    senses: [{ glosses: ["x"], examples: texts.map((text) => ({ text })) }],
  });

  it("counts a word capitalised inside a sentence and in lower case", () => {
    const cases = createCaseCounter("es");
    cases.add(
      entry(
        "es",
        "Viajé a Chile en mayo, y luego a Chile, 2 veces.",
        "Me gusta el chile.",
      ),
    );
    expect(cases.counts.get("chile")).toEqual([2, 1]);
  });
  it("leaves out sentence starts, words after punctuation or a quote, and other languages", () => {
    const cases = createCaseCounter("es");
    cases.add(entry("es", "Chile es largo. Chile es «Chile» (Chile)."));
    cases.add(entry("en", "We went to Chile."));
    expect(cases.counts.get("chile")).toBeUndefined();
  });
  it("leaves out ALL-CAPS words", () => {
    const cases = createCaseCounter("es");
    cases.add(entry("es", "la sede de la ONU en Ginebra"));
    expect(cases.counts.get("onu")).toBeUndefined();
    expect(cases.counts.get("ginebra")).toEqual([1, 0]);
  });
});
