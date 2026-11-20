import { describe, expect, it } from "vitest";
import {
  expansionOf,
  expansionsOf,
  moveFirst,
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

describe("moveFirst", () => {
  it("moves one item first, the others in their order", () => {
    expect(moveFirst([0, 1, 2, 3], 2)).toEqual([2, 0, 1, 3]);
  });
});
