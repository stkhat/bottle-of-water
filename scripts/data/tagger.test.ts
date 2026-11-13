import { describe, expect, it } from "vitest";
import { tagSentence } from "../../src/core/tagging/perceptron.ts";
import { accuracy, readConllu, train } from "./tagger.ts";

const CONLLU = [
  "# sent_id = 1",
  "# text = I don't know.",
  "1\tI\tI\tPRON\tPRP\t_\t3\tnsubj\t_\t_",
  "2-3\tdon't\t_\t_\t_\t_\t_\t_\t_\t_",
  "2\tdo\tdo\tAUX\tVBP\t_\t4\taux\t_\t_",
  "3\tn't\tnot\tPART\tRB\t_\t4\tadvmod\t_\t_",
  "4\tknow\tknow\tVERB\tVB\t_\t0\troot\t_\tSpaceAfter=No",
  "5\t.\t.\tPUNCT\t.\t_\t4\tpunct\t_\t_",
  "",
  "# sent_id = 2",
  "1\tShe\tshe\tPRON\tPRP\t_\t2\tnsubj\t_\t_",
  "1.1\tgone\tgo\tVERB\tVBN\t_\t_\t_\t_\t_",
  "2\twalked\twalk\tVERB\tVBD\t_\t0\troot\t_\t_",
  "",
].join("\n");

describe("readConllu", () => {
  it("reads each sentence's tokens and treebank tags, without multiword or empty tokens", () => {
    expect(readConllu(CONLLU)).toEqual([
      {
        words: ["I", "do", "n't", "know", "."],
        tags: ["PRP", "VBP", "RB", "VB", "."],
      },
      { words: ["She", "walked"], tags: ["PRP", "VBD"] },
    ]);
  });
});

/** A small treebank: past tenses end in -ed, nouns follow "the". */
const SENTENCES = Array.from({ length: 40 }, (_, i) => ({
  words: ["The", `dog${i % 7}`, `walk${i % 5}ed`, "home", "."],
  tags: ["DT", "NN", "VBD", "RB", "."],
}));

describe("train", () => {
  // A treebank this small learns small weights: keep those from 0.5.
  const model = train(SENTENCES, { minWeight: 0.5 });

  it("learns to tag what it was trained on, words it never saw by their letters", () => {
    expect(accuracy(model, SENTENCES)).toBe(1);
    expect(
      tagSentence(model, ["The", "cat", "jumped", "home", "."]).map(
        (t) => t.tag,
      ),
    ).toEqual(["DT", "NN", "VBD", "RB", "."]);
  });
  it("tags words seen often with one tag without scoring them", () => {
    expect(model.words).toMatchObject({ the: "DT", home: "RB", ".": "." });
    expect(tagSentence(model, ["The"])[0]).toEqual({
      tag: "DT",
      margin: Infinity,
    });
  });
  it("keeps integer weights at the model's scale, small ones dropped", () => {
    expect(model.scale).toBe(10);
    const weights = Object.values(model.weights).flat();
    expect(weights.every(Number.isInteger)).toBe(true);
    for (const pairs of Object.values(model.weights))
      for (let i = 1; i < pairs.length; i += 2)
        expect(Math.abs(pairs[i]!)).toBeGreaterThanOrEqual(5);
    // The default drops weights under 2.
    expect(Object.keys(train(SENTENCES).weights).length).toBeLessThan(
      Object.keys(model.weights).length,
    );
  });
  it("gives the same model every time", () => {
    expect(JSON.stringify(train(SENTENCES, { minWeight: 0.5 }))).toBe(
      JSON.stringify(model),
    );
  });
});
