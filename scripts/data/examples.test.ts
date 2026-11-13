import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countExamples, examplePieces, phraseVariants } from "./examples.ts";

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
      ["gave up", "give up"],
      ["given up", "give up"],
      ["spill the beans", "spill the beans"],
    ]);
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
