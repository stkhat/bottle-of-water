import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/core/text/tokenize.ts";
import { frenchTag, readAligned } from "./fr-tagger.ts";

const CONLLU = [
  "# sent_id = 1",
  "# text = L'homme du nord-est a-t-il vu d'accord ?",
  "1\tL'\tle\tDET\t_\t_\t2\tdet\t_\tSpaceAfter=No",
  "2\thomme\thomme\tNOUN\t_\t_\t0\troot\t_\t_",
  "3-4\tdu\t_\t_\t_\t_\t_\t_\t_\t_",
  "3\tde\tde\tADP\t_\t_\t5\tcase\t_\t_",
  "4\tle\tle\tDET\t_\t_\t5\tdet\t_\t_",
  "5\tnord-est\tnord-est\tNOUN\t_\t_\t2\tnmod\t_\t_",
  "6\ta\tavoir\tAUX\t_\tMood=Ind|Tense=Pres|VerbForm=Fin\t8\taux\t_\tSpaceAfter=No",
  "7\t-t-il\til\tPRON\t_\t_\t8\tnsubj\t_\t_",
  "8\tvu\tvoir\tVERB\t_\tTense=Past|VerbForm=Part\t2\tacl\t_\t_",
  "9\td'\tde\tADP\t_\t_\t10\tcase\t_\tSpaceAfter=No",
  "10\taccord\taccord\tNOUN\t_\t_\t8\tobl\t_\t_",
  "11\t?\t?\tPUNCT\t_\t_\t2\tpunct\t_\t_",
  "",
  "# sent_id = 2",
  "# text = Texte perdu",
  "1\tAutre\tautre\tADJ\t_\t_\t0\troot\t_\t_",
  "",
].join("\n");

describe("frenchTag", () => {
  it("adds the verb form to verbs and auxiliaries, the present participle as a gerund", () => {
    expect(frenchTag("VERB", "Tense=Past|VerbForm=Part")).toBe("VERB.Part");
    expect(frenchTag("VERB", "Tense=Pres|VerbForm=Part")).toBe("VERB.Ger");
    expect(frenchTag("AUX", "Mood=Ind|VerbForm=Fin")).toBe("AUX.Fin");
    expect(frenchTag("VERB", "VerbForm=Inf")).toBe("VERB.Inf");
    expect(frenchTag("VERB", "_")).toBe("VERB.Fin");
    expect(frenchTag("NOUN", "Gender=Masc")).toBe("NOUN");
  });
});

describe("readAligned", () => {
  const split = (whole: (word: string) => boolean) => (text: string) =>
    tokenize(text, "fr", whole).filter((token) => token.text.trim() !== "");

  it("tags Langle's tokens with the treebank token each starts in", () => {
    const { sentences, skipped } = readAligned(
      CONLLU,
      split(() => false),
    );
    expect(sentences).toEqual([
      {
        words: [
          ...["L'", "homme", "du", "nord", "-", "est", "a", "-", "t", "-"],
          ...["il", "vu", "d'", "accord", "?"],
        ],
        tags: [
          ...["DET", "NOUN", "ADP", "NOUN", "NOUN", "NOUN", "AUX.Fin"],
          ...["PRON", "PRON", "PRON", "PRON", "VERB.Part", "ADP", "NOUN"],
          "PUNCT",
        ],
        fixed: Array.from({ length: 15 }, () => false),
      },
    ]);
    // The second sentence's token is not in its text.
    expect(skipped).toBe(1);
  });
  it("keeps a word the pack reads whole as one token, with its first part's tag", () => {
    const { sentences } = readAligned(
      CONLLU,
      split((word) => word === "d'accord"),
    );
    expect(sentences[0]!.words.slice(-2)).toEqual(["d'accord", "?"]);
    expect(sentences[0]!.tags.slice(-2)).toEqual(["ADP", "PUNCT"]);
  });
  it("marks the words of a fixed expression after its first", () => {
    const fixed = [
      "# text = Un peu plus.",
      "1\tUn\tun\tDET\t_\t_\t3\tadvmod\t_\t_",
      "2\tpeu\tpeu\tNOUN\t_\t_\t1\tfixed\t_\t_",
      "3\tplus\tplus\tADV\t_\t_\t0\troot\t_\tSpaceAfter=No",
      "4\t.\t.\tPUNCT\t_\t_\t3\tpunct\t_\t_",
      "",
    ].join("\n");
    expect(
      readAligned(
        fixed,
        split(() => false),
      ).sentences[0]!.fixed,
    ).toEqual([false, true, false, false]);
  });
});
