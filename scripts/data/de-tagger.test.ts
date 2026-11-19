import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/core/text/tokenize.ts";
import { germanTag } from "./de-tagger.ts";
import { readAligned } from "./fr-tagger.ts";

const CONLLU = [
  "# sent_id = 1",
  "# text = Er fängt im Haus an.",
  "1\tEr\ter\tPRON\tPPER\t_\t2\tnsubj\t_\t_",
  "2\tfängt\tfangen\tVERB\tVVFIN\tVerbForm=Fin\t0\troot\t_\t_",
  "3-4\tim\t_\t_\t_\t_\t_\t_\t_\t_",
  "3\tin\tin\tADP\tAPPR\t_\t5\tcase\t_\t_",
  "4\tdem\tder\tDET\tART\t_\t5\tdet\t_\t_",
  "5\tHaus\tHaus\tPROPN\tNN\t_\t2\tobl\t_\t_",
  "6\tan\tan\tADP\tPTKVZ\t_\t2\tcompound:prt\t_\tSpaceAfter=No",
  "7\t.\t.\tPUNCT\t$.\t_\t2\tpunct\t_\t_",
  "",
].join("\n");

describe("germanTag", () => {
  it("adds the verb form, reads STTS's auxiliaries as AUX and its particles as PART.Vz", () => {
    expect(germanTag("VERB", "VerbForm=Part", "VVPP")).toBe("VERB.Part");
    expect(germanTag("VERB", "VerbForm=Fin", "VAFIN")).toBe("AUX.Fin");
    expect(germanTag("AUX", "VerbForm=Inf", "VMINF")).toBe("AUX.Inf");
    expect(germanTag("ADP", "_", "PTKVZ")).toBe("PART.Vz");
    expect(germanTag("ADV", "_", "PTKVZ")).toBe("PART.Vz");
  });
  it("reads a common word GSD tags as a proper noun inside a name as the word it is", () => {
    expect(germanTag("PROPN", "_", "NN")).toBe("NOUN");
    expect(germanTag("PROPN", "_", "ADJA")).toBe("ADJ");
    expect(germanTag("PROPN", "_", "NE")).toBe("PROPN");
  });
});

describe("readAligned over German", () => {
  it("tags Langle's tokens, a contraction with its preposition's tag", () => {
    const { sentences } = readAligned(
      CONLLU,
      (text) =>
        tokenize(text, "de").filter((token) => token.text.trim() !== ""),
      germanTag,
    );
    expect(sentences).toEqual([
      {
        words: ["Er", "fängt", "im", "Haus", "an", "."],
        tags: ["PRON", "VERB.Fin", "ADP", "NOUN", "PART.Vz", "PUNCT"],
      },
    ]);
  });
});
