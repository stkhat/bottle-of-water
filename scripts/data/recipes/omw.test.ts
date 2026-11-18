import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  englishSenses,
  lemmaOf,
  parseWordnet,
  readWordnet,
  readWordnetMeanings,
  synsetKey,
  synsetLemmas,
} from "./omw.ts";
import { termKeyOf } from "./recipe.ts";

const OMW = join(import.meta.dirname, "..", "fixtures", "omw", "omw-1.4");
const english = readWordnet(join(OMW, "omw-en", "omw-en.xml"));
const italian = readWordnet(join(OMW, "omw-it", "omw-it.xml"));
const termKey = termKeyOf({
  vocab: new Set(["bank", "light", "upset", "give", "up"]),
  lemmas: {},
  phrases: new Set(["give up"]),
});

describe("parseWordnet", () => {
  it("reads entries with their senses and counts in order, and synsets with members and their first definition", () => {
    const bank = english.entries.find(
      (e) => e.lemma === "bank" && e.pos === "n",
    );
    expect(bank?.senses).toEqual([
      {
        id: "omw-en-bank-09213565-n",
        synset: "omw-en-09213565-n",
        count: 25,
      },
      {
        id: "omw-en-bank-08420278-n",
        synset: "omw-en-08420278-n",
        count: 20,
      },
    ]);
    expect(english.synsets.get("omw-en-01186408-s")).toEqual({
      members: ["omw-en-light-01186408-s"],
      definition:
        "of comparatively little physical weight or density; 'light' as a feather",
    });
    expect(italian.synsets.get("omw-it-08420278-n")?.members).toEqual([
      "omw-it-banca-08420278-n",
      "omw-it-istituto_di_credito-08420278-n",
    ]);
  });
  it("decodes entities in attributes", () => {
    const { entries } = parseWordnet(
      '<LexicalEntry id="x"><Lemma writtenForm="l&apos;acqua &amp; co" partOfSpeech="n" /><Sense id="s" synset="omw-it-00000001-n" /></LexicalEntry>',
    );
    expect(entries[0]?.lemma).toBe("l'acqua & co");
  });
});

describe("synsetKey", () => {
  it("is the offset and part of speech, satellites counted as adjectives", () => {
    expect(synsetKey("omw-it-09213565-n")).toBe("09213565-n");
    expect(synsetKey("omw-en-01186408-s")).toBe("01186408-a");
    expect(synsetKey("omw-cmn-01186408-a")).toBe("01186408-a");
    expect(synsetKey("not-a-synset")).toBeUndefined();
  });
});

describe("lemmaOf", () => {
  it("closes up a '+' join and drops notes in brackets and underscores", () => {
    expect(lemmaOf("婚姻+的")).toBe("婚姻的");
    expect(lemmaOf("呼吸 + する")).toBe("呼吸する");
    expect(lemmaOf("trzymanie steru (rządów)")).toBe("trzymanie steru");
    expect(lemmaOf("resuscytacja krążeniowo-oddechowa[edytuj]")).toBe(
      "resuscytacja krążeniowo-oddechowa",
    );
    expect(lemmaOf("istituto_di_credito")).toBe("istituto di credito");
    expect(lemmaOf("l'energia")).toBe("l'energia");
  });
  it("drops what is not a word: markers, lists, descriptions with commas, numbers, acronyms", () => {
    expect(lemmaOf("GAP!")).toBeUndefined();
    expect(lemmaOf("c / c")).toBeUndefined();
    expect(lemmaOf("człowiek, który się komunikuje")).toBeUndefined();
    expect(lemmaOf("5")).toBeUndefined();
    expect(lemmaOf("V")).toBeUndefined();
    expect(lemmaOf("A.F.")).toBeUndefined();
    expect(lemmaOf("s")).toBeUndefined();
    expect(lemmaOf("(nota)")).toBeUndefined();
  });
  it("keeps a word in an uncased script and a capitalised word", () => {
    expect(lemmaOf("基本上")).toBe("基本上");
    expect(lemmaOf("看")).toBe("看");
    expect(lemmaOf("B电池")).toBe("B电池");
    expect(lemmaOf("Ferdinando-Magellano-(1480-1521)")).toBe(
      "Ferdinando-Magellano",
    );
    expect(lemmaOf("Russia")).toBe("Russia");
  });
});

describe("synsetLemmas", () => {
  it("lists each synset's lemmas, those naming more synsets first, then in the wordnet's order", () => {
    const lemmas = synsetLemmas(italian);
    // riva names two synsets, sponda one; GAP! is no lemma.
    expect(lemmas.get("09213565-n")).toEqual(["riva", "sponda"]);
    expect(lemmas.get("08420278-n")).toEqual(["banca", "istituto di credito"]);
    expect(lemmas.get("02367032-v")).toEqual(["rinunciare"]);
    expect(lemmas.get("02343374-v")).toEqual(["depositare"]);
  });
  it("keeps at most three lemmas per synset", () => {
    const xml = ["aa", "bb", "cc", "dd"]
      .map(
        (w) =>
          `<LexicalEntry id="${w}"><Lemma writtenForm="${w}" partOfSpeech="n" /><Sense id="s-${w}" synset="omw-xx-00000001-n" /></LexicalEntry>`,
      )
      .join("");
    const synset =
      '<Synset id="omw-xx-00000001-n" members="s-aa s-bb s-cc s-dd" />';
    expect(synsetLemmas(parseWordnet(xml + synset)).get("00000001-n")).toEqual([
      "aa",
      "bb",
      "cc",
    ]);
  });
});

describe("englishSenses", () => {
  it("files the senses under the pack's term keys, each part of speech's main sense first", () => {
    const senses = englishSenses(english, termKey);
    expect([...senses.keys()].sort()).toEqual([
      "bank",
      "give up",
      "light",
      "upset",
    ]);
    // Nouns are bank's most frequent part of speech (25 + 20 tagged uses, verbs 2).
    expect(senses.get("bank")).toEqual([
      { synset: "omw-en-09213565-n", pos: "noun", rank: 0 },
      { synset: "omw-en-02343374-v", pos: "verb", rank: 0 },
      { synset: "omw-en-08420278-n", pos: "noun", rank: 1 },
    ]);
    expect(senses.get("light")?.map(({ pos }) => pos)).toEqual([
      "noun",
      "adjective",
    ]);
  });
});

describe("readWordnetMeanings", () => {
  it("gives each term its synsets' native lemmas with the part of speech and the English definition as the hint", () => {
    const terms = readWordnetMeanings({ english, native: italian, termKey });
    expect(Object.fromEntries(terms)).toEqual({
      bank: {
        short: "riva",
        senses: [
          [
            "noun",
            "riva, sponda",
            "sloping land (especially the slope beside a body of water)",
          ],
          ["verb", "depositare", "put into a bank account"],
          [
            "noun",
            "banca, istituto di credito",
            "a financial institution that accepts deposits and channels the money into lending activities",
          ],
        ],
      },
      // The noun's synset has no Italian lemmas.
      light: {
        short: "leggero",
        senses: [
          [
            "adjective",
            "leggero",
            "of comparatively little physical weight or density",
          ],
        ],
      },
      "give up": {
        short: "rinunciare",
        senses: [["verb", "rinunciare", "stop maintaining or insisting on"]],
      },
    });
  });
  it("leaves out a term whose main senses have no native lemmas", () => {
    // upset's second sense has an Italian lemma, its first (main) one none.
    const terms = readWordnetMeanings({ english, native: italian, termKey });
    expect(terms.has("upset")).toBe(false);
  });
});
