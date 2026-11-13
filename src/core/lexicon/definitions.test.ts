import { describe, expect, it } from "vitest";
import {
  cleanDefinition,
  definitionPointer,
  definitionTexts,
  isUsageNote,
  MAX_TRANSLATED_SENSES,
} from "./definitions";

describe("cleanDefinition", () => {
  it("keeps a plain definition, trimmed", () => {
    expect(cleanDefinition("  To reveal a secret.  ")).toBe(
      "To reveal a secret.",
    );
    expect(cleanDefinition("So common as to be practically worthless")).toBe(
      "So common as to be practically worthless",
    );
  });

  it("drops leading labels", () => {
    expect(cleanDefinition("(idiomatic, informal) To reveal a secret.")).toBe(
      "To reveal a secret.",
    );
    expect(
      cleanDefinition("(sports) (transitive) To force out of a position."),
    ).toBe("To force out of a position.");
  });

  it("keeps a context that says what the sense applies to", () => {
    expect(cleanDefinition("(of rain) To strike with great force.")).toBe(
      "(of rain) To strike with great force.",
    );
    expect(cleanDefinition("(chiefly of time) To pass slowly.")).toBe(
      "(chiefly of time) To pass slowly.",
    );
    expect(cleanDefinition("(idiomatic) (of a person) To be idle.")).toBe(
      "(of a person) To be idle.",
    );
    expect(cleanDefinition("(of a person) doing nothing, idle")).toBe(
      "(of a person) doing nothing, idle",
    );
    expect(cleanDefinition("(+ de) to trust")).toBe("(+ de) to trust");
    expect(cleanDefinition("(in the plural) forces")).toBe(
      "(in the plural) forces",
    );
  });

  it("drops labels before a lowercase definition (Spanish → English)", () => {
    expect(cleanDefinition("(reflexive) to crack up")).toBe("to crack up");
    expect(
      cleanDefinition("(UK, Canada) idiot box, (US) boob tube (television)"),
    ).toBe("idiot box, (US) boob tube (television)");
  });

  it("keeps a leading parenthesis that is part of the definition", () => {
    for (const text of [
      "(not) in the slightest, not in the least",
      "(false) pretence, lame excuse",
      "(Someone or something) is gone and never coming back",
      "(Achieved or completed) with a single action; in a single stroke.",
      "(to enjoy the benefits of protectionist economic policies)",
    ])
      expect(cleanDefinition(text)).toBe(text);
  });

  it("leaves pointer senses out", () => {
    for (const text of [
      "Alternative form of address me.",
      "Alternate form of chale",
      "Alternative spelling of in color.",
      "Misspelling of well.",
      "Common misspelling of separate.",
      "Abbreviation of excelentísimo.",
      "Usual abbreviation of excelentísimo",
      "Initialism of for what it's worth.",
      "Acronym of as soon as possible.",
      "Clipping of examination.",
      "Ellipsis of give someone the cold shoulder.",
      "Short for refrigerator.",
      "plural of loaf",
      "simple past of rise",
      "Past tense of throw away.",
      "past participle of throw away",
      "Present participle of go.",
      "third-person singular simple present indicative of be",
      "second-person singular tuteo imperative of abstenerse",
      "tuteo second-person form of venir",
      "comparative degree of good and well",
      "Comparative form of good.",
      "Superlative form of good.",
      "Superlative of catch air",
      "Obsolete form of ferment.",
      "Archaic form of you.",
      "Eye dialect spelling of because.",
      "Nonstandard form of anyway.",
      "Non-standard spelling of alright.",
      "apheretic form of esperar (“to wait”)",
      "disused form of sin",
      "higher register form of criatura (“creature”)",
      "censored spelling of carajo",
      "minced form of like hell",
      "An intensive form of what",
      "A more intensive form of what.",
      "pejorative of cama",
      "Diminutive of casa.",
      "Humorous euphemism for piss down (rain heavily).",
      "Eggcorn of for all intents and purposes.",
      "only used in a contrapelo",
    ])
      expect(cleanDefinition(text), text).toBeUndefined();
  });

  it("leaves synonym senses out: the phrase they name would be translated word by word", () => {
    expect(cleanDefinition("Synonym of hang around.")).toBeUndefined();
    expect(cleanDefinition("synonym of acuñar")).toBeUndefined();
    expect(
      cleanDefinition("Synonym of put about (“to circulate a rumor”)"),
    ).toBeUndefined();
    expect(
      cleanDefinition("A partial synonym of take control."),
    ).toBeUndefined();
  });

  it("leaves standard spellings and forms out", () => {
    for (const text of [
      "Standard spelling of in favor",
      "British standard spelling of in splendor.",
      "American standard spelling of of the colours",
      "Canadian standard spelling of in colour.",
      "Australian standard spelling of in colour.",
      "UK standard spelling of in flying colors",
      "Commonwealth and Ireland standard spelling of in color",
      "British spelling of with flying colors.",
      "Standard form of anyway.",
    ])
      expect(cleanDefinition(text), text).toBeUndefined();
  });

  it("gives the definition after a pointer's colon", () => {
    expect(
      cleanDefinition("Synonym of get someone's back up: to annoy someone."),
    ).toBe("to annoy someone.");
    expect(
      cleanDefinition(
        "Synonym of let's go: a cheer of encouragement, support, etc",
      ),
    ).toBe("a cheer of encouragement, support, etc");
    expect(
      cleanDefinition(
        "Emphatic synonym of kick out: to remove, to eject, to expel.",
      ),
    ).toBe("to remove, to eject, to expel.");
    expect(
      cleanDefinition(
        "An emphatic form of believe me: you (the subject) had better believe me",
      ),
    ).toBe("you (the subject) had better believe me");
    expect(cleanDefinition("synonym of yo que tú: if I were you")).toBe(
      "if I were you",
    );
    expect(cleanDefinition("Synonym of no big deal:  ")).toBeUndefined();
  });

  it("finds pointers after labels and in any case", () => {
    expect(
      cleanDefinition("(Extreme sports) Superlative of catch air"),
    ).toBeUndefined();
    expect(cleanDefinition("(informal) SYNONYM OF hang out.")).toBeUndefined();
    expect(cleanDefinition("(informal) Synonym of cope: to remain calm.")).toBe(
      "to remain calm.",
    );
  });

  it("keeps definitions that only start like a pointer", () => {
    for (const text of [
      "A form of torture in which water is dripped onto the forehead.",
      "A variant of the game of darts in which players hit each section.",
      "An honorific form of address to a doctor.",
      "Money in the form of paper currency or coins.",
      "Of or relating to the sea.",
      "In a state of confusion.",
      "An expression of surprise.",
      "masculine singular definite article",
      "feminine (of or relating to women)",
      "See you later.",
    ])
      expect(cleanDefinition(text), text).toBe(text);
  });

  it("gives nothing for an empty definition or a label alone", () => {
    expect(cleanDefinition("")).toBeUndefined();
    expect(cleanDefinition("   ")).toBeUndefined();
    expect(cleanDefinition("(idiomatic, informal) ")).toBeUndefined();
    expect(cleanDefinition("(of a person)")).toBeUndefined();
  });
});

describe("definitionPointer", () => {
  it("knows inflections as forms of the word they name", () => {
    expect(definitionPointer("Plural of mouse.")).toEqual({
      kind: "form",
      target: "mouse",
    });
    expect(
      definitionPointer("third-person singular preterite indicative of ir"),
    ).toEqual({ kind: "form", target: "ir" });
  });
  it("knows synonyms, variants and the like as references", () => {
    expect(definitionPointer("Synonym of look for")).toEqual({
      kind: "reference",
      target: "look for",
    });
    expect(definitionPointer("(informal) Alternative form of anyhow")).toEqual({
      kind: "reference",
      target: "anyhow",
    });
    expect(definitionPointer("Synonym of I can tell you")).toEqual({
      kind: "reference",
      target: "i can tell you",
    });
  });
  it("names no term when the pointer glosses it: it means one of its senses", () => {
    expect(
      definitionPointer("Synonym of deal with (“to behave in a certain way”)"),
    ).toEqual({ kind: "reference" });
    expect(
      definitionPointer("Synonym of in the zone, playing perfectly in time"),
    ).toEqual({ kind: "reference" });
  });
  it("leaves definitions and pointers with a definition of their own", () => {
    expect(definitionPointer("To reveal a secret.")).toBeUndefined();
    expect(definitionPointer("A form of torture.")).toBeUndefined();
    expect(
      definitionPointer("Synonym of get someone's back up: to annoy someone."),
    ).toBeUndefined();
  });
});

describe("definitionTexts", () => {
  it("gives the cleaned short meaning and first senses, each once", () => {
    expect(MAX_TRANSLATED_SENSES).toBe(4);
    expect(
      definitionTexts({
        short: "To reveal a secret",
        senses: [
          { pos: "verb", text: "(idiomatic) To reveal a secret." },
          { pos: "verb", text: "Synonym of let the cat out of the bag." },
          { pos: "verb", text: "To reveal a secret." },
          { pos: "verb", text: "To confess." },
          { pos: "verb", text: "To spill something edible." },
        ],
      }),
    ).toEqual(["To reveal a secret", "To reveal a secret.", "To confess."]);
  });
});

describe("isUsageNote", () => {
  it("finds definitions that say how an expression is used", () => {
    expect(isUsageNote("Used to express surprise.")).toBe(true);
    expect(isUsageNote("(idiomatic) Said when leaving.")).toBe(true);
    expect(
      isUsageNote(
        "(idiomatic) An apophasis used by a speaker to introduce, despite claiming not to address, a given point of discussion.",
      ),
    ).toBe(true);
    expect(isUsageNote("A rhetorical question asked to show doubt.")).toBe(
      true,
    );
  });
  it("leaves definitions that mean something, an interjection's too", () => {
    expect(isUsageNote("To reveal a secret.")).toBe(false);
    expect(isUsageNote("An expression of surprise.")).toBe(false);
    expect(isUsageNote("A user of a computer.")).toBe(false);
  });
});
