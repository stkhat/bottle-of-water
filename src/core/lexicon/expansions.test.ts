import { describe, expect, it } from "vitest";
import {
  expansionOf,
  expansionsOf,
  moveFirst,
  namesExpansion,
  spelledOutExpansion,
  spelledOutIn,
  spelledOutSense,
  writesPhrase,
} from "./expansions";

describe("expansionOf", () => {
  it("reads the words a sense spells an abbreviation out with", () => {
    expect(
      expansionOf("dea", "Initialism of Drug Enforcement Administration."),
    ).toBe("Drug Enforcement Administration");
    expect(expansionOf("pm", "Prime Minister")).toBe("Prime Minister");
    expect(expansionOf("u.s.", "United States 合衆国")).toBe("United States");
    expect(expansionOf("d.a.", "District of Attorney (米国の)地方検事")).toBe(
      "District of Attorney",
    );
    expect(expansionOf("un", "the United Nations")).toBe("the United Nations");
    expect(expansionOf("mo", "mail order")).toBe("mail order");
    // A definition headed by what it stands for, and a translation's hint.
    expect(
      expansionOf("gpu", "graphics processing unit: A specialized circuit."),
    ).toBe("graphics processing unit");
    expect(expansionOf("gpu", "《graphics processing unit》画像処理装置")).toBe(
      "graphics processing unit",
    );
  });

  it("reads each of a sense's alternatives", () => {
    expect(
      expansionsOf(
        "anc",
        "Initialism of active noise control or active noise cancellation.",
      ),
    ).toEqual(["active noise control", "active noise cancellation"]);
  });

  it("finds none in a definition, a one-word sense or a translation", () => {
    expect(
      expansionOf("dea", "A hydroxy secondary amine, used as a chemical"),
    ).toBeUndefined();
    expect(expansionOf("us", "unserviceable")).toBeUndefined();
    expect(expansionOf("pm", "promethiumの化学記号")).toBeUndefined();
    expect(expansionOf("a", "ante meridiem")).toBeUndefined();
  });
});

describe("writesPhrase", () => {
  it("finds a phrase in any case, as whole words", () => {
    const text = "That's the Drug Enforcement Administration's office.";
    expect(writesPhrase(text, "Drug Enforcement Administration")).toBe(true);
    expect(
      writesPhrase(
        "drug-enforcement administration",
        "Drug Enforcement Administration",
      ),
    ).toBe(true);
    expect(
      writesPhrase(
        "drug enforcement administrations",
        "Drug Enforcement Administration",
      ),
    ).toBe(false);
    expect(writesPhrase("a mail-order bride", "mail order")).toBe(true);
    expect(writesPhrase("email order", "mail order")).toBe(false);
    expect(writesPhrase("the Women's Army Corps", "Women's Army Corps")).toBe(
      true,
    );
    expect(writesPhrase("the women s army corps", "Women's Army Corps")).toBe(
      false,
    );
  });

  // A pack's base forms (`LanguagePack.lemmas`), in miniature.
  const BASES: Record<string, string[]> = {
    units: ["unit"],
    organizations: ["organization"],
    points: ["point"],
    senate: ["senate"],
    senates: ["senate"],
    unidades: ["unidad"],
    mice: ["mice", "mouse"],
  };
  const bases = (word: string) => BASES[word.toLowerCase()] ?? [];

  it("with the pack's base forms, finds a phrase the text writes inflected", () => {
    const gpus = "Graphics processing units (GPUs) are specialized circuits.";
    expect(writesPhrase(gpus, "graphics processing unit")).toBe(false);
    expect(writesPhrase(gpus, "graphics processing unit", bases)).toBe(true);
    // A plural's possessive, a hyphenated word, a phrase's first word.
    expect(
      writesPhrase(
        "Non-governmental organizations' work",
        "non-governmental organization",
        bases,
      ),
    ).toBe(true);
    expect(writesPhrase("many points of view", "point of view", bases)).toBe(
      true,
    );
    expect(
      writesPhrase("las unidades de medida", "unidad de medida", bases),
    ).toBe(true);
    // The phrase inflected, the text not: a base form in common.
    expect(
      writesPhrase("the United States Senate", "United States Senates", bases),
    ).toBe(true);
  });

  it("with the pack's base forms, still wants each word's form", () => {
    // Another word, or a form the pack does not know.
    expect(
      writesPhrase(
        "graphics processing unity",
        "graphics processing unit",
        bases,
      ),
    ).toBe(false);
    expect(
      writesPhrase(
        "graphics processing unitz",
        "graphics processing unit",
        bases,
      ),
    ).toBe(false);
    // A form starts as its base does: a word that does not is not looked up.
    const asked: string[] = [];
    writesPhrase("some mice and rats", "the mouse", (word) => {
      asked.push(word);
      return bases(word);
    });
    expect(asked).not.toContain("some");
    expect(writesPhrase("lab mice", "lab mouse", bases)).toBe(true);
  });
});

describe("spelledOutIn", () => {
  it("answers each phrase of one text", () => {
    const writes = spelledOutIn(
      "Central processing units (CPUs) and graphics processing units",
      (word) => (word.toLowerCase() === "units" ? ["unit"] : []),
    );
    expect(writes("central processing unit")).toBe(true);
    expect(writes("graphics processing unit")).toBe(true);
    expect(writes("tensor processing unit")).toBe(false);
  });
});

describe("spelledOutSense", () => {
  const senses = [
    "A hydroxy secondary amine",
    "Initialism of Drug Enforcement Administration.",
    "An endogenous fatty-acid ethanolamide",
  ];
  it("puts first the sense whose expansion the document writes", () => {
    const text =
      "Excuse me, the DEA? That's the Drug Enforcement Administration.";
    expect(
      spelledOutSense("dea", senses, (phrase) => writesPhrase(text, phrase)),
    ).toBe(1);
    // Either alternative of a sense ("an earbuds review": active noise cancellation).
    expect(
      spelledOutSense(
        "anc",
        [
          "Initialism of absolute neutrophil count.",
          "Initialism of active noise control or active noise cancellation.",
        ],
        (phrase) => writesPhrase("its active noise cancellation", phrase),
      ),
    ).toBe(1);
  });
  it("leaves the order where the document spells none out, or the first", () => {
    expect(spelledOutSense("dea", senses, () => false)).toBeUndefined();
    expect(
      spelledOutSense("pm", ["Prime Minister", "paymaster"], () => true),
    ).toBeUndefined();
  });
});

describe("spelledOutExpansion", () => {
  const writes = (text: string) => spelledOutIn(text, () => []);
  it("takes the expansion the document writes, the most notable first", () => {
    const ecthr = [
      "European Court of Human Rights",
      "European Convention on Human Rights",
    ];
    expect(
      spelledOutExpansion(
        ecthr,
        writes("the European Convention on Human Rights (ECHR)"),
      ),
    ).toBe("European Convention on Human Rights");
    expect(
      spelledOutExpansion(
        ecthr,
        writes(
          "The European Convention on Human Rights … the European Court of Human Rights",
        ),
      ),
    ).toBe("European Court of Human Rights");
  });
  it("takes a longer expansion before one it holds", () => {
    expect(
      spelledOutExpansion(
        ["aviation authority", "Civil Aviation Authority"],
        writes("the Civil Aviation Authority (CAA) said"),
      ),
    ).toBe("Civil Aviation Authority");
  });
  it("finds none where the document spells none out", () => {
    expect(
      spelledOutExpansion(
        ["New York City Police Department"],
        writes("The NYPD said on Monday"),
      ),
    ).toBeUndefined();
  });
});

describe("namesExpansion", () => {
  const nypd = "New York City Police Department";
  it("reads a hint, a hinted translation and a definition's head", () => {
    expect(
      namesExpansion({ text: "Departamento de Policía", hint: nypd }, nypd),
    ).toBe(true);
    expect(
      namesExpansion({ text: `《${nypd}》ニューヨーク市警察` }, nypd),
    ).toBe(true);
    expect(
      namesExpansion({ text: `${nypd}: Police force of New York City.` }, nypd),
    ).toBe(true);
    expect(namesExpansion({ text: `${nypd}.` }, nypd)).toBe(true);
  });
  it("is not about another expansion", () => {
    expect(
      namesExpansion(
        { text: "New York City Police Department Band: A band." },
        nypd,
      ),
    ).toBe(false);
    expect(
      namesExpansion({ text: "ニューヨーク市警察", hint: "NYPD" }, nypd),
    ).toBe(false);
  });
});

describe("moveFirst", () => {
  it("moves one item first, the others in their order", () => {
    expect(moveFirst([0, 1, 2, 3], 2)).toEqual([2, 0, 1, 3]);
  });
});
