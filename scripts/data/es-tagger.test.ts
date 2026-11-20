import { describe, expect, it } from "vitest";
import { lemmaCounts, readSurface, spanishTag } from "./es-tagger.ts";

const CONLLU = [
  "# sent_id = 1",
  "# text = Dímelo del todo.",
  "1-3\tDímelo\t_\t_\t_\t_\t_\t_\t_\t_",
  "1\tDí\tdecir\tVERB\t_\tMood=Imp|VerbForm=Fin\t0\troot\t_\t_",
  "2\tme\tyo\tPRON\t_\tCase=Dat\t1\tiobj\t_\t_",
  "3\tlo\tél\tPRON\t_\tCase=Acc\t1\tobj\t_\t_",
  "4-5\tdel\t_\t_\t_\t_\t_\t_\t_\t_",
  "4\tde\tde\tADP\t_\t_\t6\tcase\t_\t_",
  "5\tel\tel\tDET\t_\t_\t6\tdet\t_\t_",
  "6\ttodo\ttodo\tPRON\t_\t_\t1\tobl\t_\t_",
  "6.1\tdicho\tdecir\tVERB\t_\tVerbForm=Part\t_\t_\t_\t_",
  "7\t.\t.\tPUNCT\t_\t_\t1\tpunct\t_\t_",
  "",
  "1\tHa\thaber\tAUX\t_\tVerbForm=Fin\t2\taux\t_\t_",
  "2\tcreído\tcreer\tVERB\t_\tGender=Masc|VerbForm=Part\t0\troot\t_\t_",
  "",
].join("\n");

describe("spanishTag", () => {
  it("adds the verb form to verbs and auxiliaries only", () => {
    expect(spanishTag("VERB", "Mood=Ind|VerbForm=Fin")).toBe("VERB.Fin");
    expect(spanishTag("AUX", "VerbForm=Inf")).toBe("AUX.Inf");
    expect(spanishTag("VERB", "VerbForm=Conv")).toBe("VERB.Ger");
    expect(spanishTag("VERB", "_")).toBe("VERB.Fin");
    expect(spanishTag("NOUN", "Gender=Fem")).toBe("NOUN");
  });
});

describe("readSurface", () => {
  it("reads the tokens as written, a multiword token with its first word's tag", () => {
    expect(readSurface(CONLLU)).toEqual([
      {
        words: ["Dímelo", "del", "todo", "."],
        tags: ["VERB.Fin", "ADP", "PRON", "PUNCT"],
        fixed: [false, false, false, false],
      },
      {
        words: ["Ha", "creído"],
        tags: ["AUX.Fin", "VERB.Part"],
        fixed: [false, false],
      },
    ]);
  });
});

describe("lemmaCounts", () => {
  it("counts the words' lemmas and tags in lower case, not multiword or empty tokens", () => {
    const { byForm, byLemma, byTag } = lemmaCounts([CONLLU, CONLLU]);
    expect(byForm.get("ha haber")).toBe(2);
    expect(byForm.get("dí decir")).toBe(2);
    expect(byForm.has("dímelo _")).toBe(false);
    expect(byLemma.get("decir")).toBe(2);
    expect(byTag.get("del ADP")).toBeUndefined();
    expect(byTag.get("de ADP")).toBe(2);
    expect(byTag.get("creído VERB")).toBe(2);
  });
});
