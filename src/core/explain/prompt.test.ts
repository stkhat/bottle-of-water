import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  instructions,
  marked,
  meaningLength,
  proposesPhrase,
  selectedNote,
  type ExplainInput,
} from "./prompt";

const ENGLISH: Omit<ExplainInput, "native"> = {
  learning: "en",
  title: "How to bake bread at home",
  written: "figured it out",
  base: "figure out",
  kind: "phrase",
  sentence: "We figured it out on the way home.",
  marks: [
    { start: 3, end: 10 },
    { start: 14, end: 17 },
  ],
  senses: [
    { pos: "verb", text: "To come to understand." },
    { pos: "verb", text: "To solve or work out." },
  ],
  before: ["The map was wrong.", "Nobody knew the road.", "It got dark."],
  after: ["Then we slept.", "The next day was sunny."],
};

const SPANISH: ExplainInput = {
  learning: "es",
  native: "en",
  title: "Historia del pan",
  written: "masa",
  base: "masa",
  kind: "word",
  sentence: "La masa sube durante la noche.",
  marks: [{ start: 3, end: 7 }],
  senses: [
    { pos: "noun", text: "dough" },
    { pos: "noun", text: "mass" },
    { pos: "noun", text: "the masses" },
  ],
  before: ["Primero se mezcla la harina."],
  after: ["Por la mañana se hornea.", "El pan sale caliente."],
};

/** The instructions and the prompt with every line, as the model gets them. */
const both = (input: ExplainInput) =>
  `${instructions(input)}\n\n----\n\n${buildPrompt(input, 5)}\n`;

describe("the prompt for each native language", () => {
  it("English → Japanese", async () => {
    await expect(both({ ...ENGLISH, native: "ja" })).toMatchFileSnapshot(
      "./__snapshots__/prompt-en-ja.txt",
    );
  });

  it("English → Spanish", async () => {
    await expect(both({ ...ENGLISH, native: "es" })).toMatchFileSnapshot(
      "./__snapshots__/prompt-en-es.txt",
    );
  });

  it("English → Portuguese", async () => {
    await expect(both({ ...ENGLISH, native: "pt" })).toMatchFileSnapshot(
      "./__snapshots__/prompt-en-pt.txt",
    );
  });

  it("Spanish → English", async () => {
    await expect(both(SPANISH)).toMatchFileSnapshot(
      "./__snapshots__/prompt-es-en.txt",
    );
  });

  it("a term without an entry, with only its sentence", async () => {
    const input: ExplainInput = {
      ...ENGLISH,
      native: "ja",
      title: undefined,
      written: "save scum",
      base: "save scum",
      senses: [],
    };
    expect(buildPrompt(input, 0)).toBe(
      [
        'Term: "save scum", a phrase',
        "Dictionary meanings: none (answer sense: null)",
        "Sentence: We [[figured]] it [[out]] on the way home.",
      ].join("\n"),
    );
  });
});

describe("selected words", () => {
  const SELECTED: ExplainInput = {
    ...ENGLISH,
    native: "ja",
    written: "she made up her",
    base: "she make up her",
    sentence: "In the end she made up her mind.",
    marks: [{ start: 11, end: 26 }],
    senses: [],
    before: [],
    after: [],
    selected: true,
  };

  it("asks for the phrase after the rest, as a dictionary writes it", async () => {
    await expect(both(SELECTED)).toMatchFileSnapshot(
      "./__snapshots__/prompt-en-ja-selected.txt",
    );
  });

  it("gives the example's meaning in the native language", () => {
    expect(buildPrompt({ ...SELECTED, native: "es" }, 0)).toContain(
      "the meaning decidirse.",
    );
  });

  it("asks no phrase for words not selected, or a learning language without the note", () => {
    expect(proposesPhrase(SELECTED)).toBe(true);
    expect(proposesPhrase({ ...SELECTED, selected: false })).toBe(false);
    expect(proposesPhrase({ ...SPANISH, selected: true })).toBe(false);
    expect(selectedNote(SPANISH)).toBeUndefined();
    expect(buildPrompt({ ...SPANISH, selected: true }, 5)).toBe(
      buildPrompt(SPANISH, 5),
    );
  });
});

describe("instructions", () => {
  it("asks for the answer in the native language, never in the learning one", () => {
    const ja = instructions({ learning: "en", native: "ja" });
    expect(ja).toContain(
      "You help a Japanese speaker who is learning English.",
    );
    expect(ja).toContain("at most 25 characters");
    expect(ja).toContain("never in Chinese, English or any other language");
    const en = instructions({ learning: "es", native: "en" });
    expect(en).toContain(
      "You help an English speaker who is learning Spanish.",
    );
    expect(en).toContain("at most 40 characters");
    expect(en).toContain("never in Chinese, Spanish or any other language");
  });

  it("asks for the marked words alone, with two examples in the native language", () => {
    const es = instructions({ learning: "en", native: "es" });
    expect(es).toContain("Translate only the marked words");
    expect(es).toContain('{"meaning":"orilla (de un río)","sense":2}');
    expect(es).toContain('{"meaning":"revelar el secreto","sense":null}');
    expect(es).not.toContain("explanation");
  });

  it("falls back to the English examples for a language without its own", () => {
    const ru = instructions({ learning: "en", native: "ru" });
    expect(ru).toContain("You help a Russian speaker");
    expect(ru).toContain('{"meaning":"riverbank","sense":2}');
  });
});

describe("marked", () => {
  it("marks each part of a phrase with a gap, in text order", () => {
    expect(
      marked("We figured it out.", [
        { start: 14, end: 17 },
        { start: 3, end: 10 },
      ]),
    ).toBe("We [[figured]] it [[out]].");
  });

  it("skips marks that overlap or fall outside the sentence", () => {
    expect(
      marked("a bc d", [
        { start: 2, end: 4 },
        { start: 3, end: 5 },
        { start: 5, end: 9 },
      ]),
    ).toBe("a [[bc]] d");
  });
});

describe("meaningLength", () => {
  it("is shorter for languages written without spaces", () => {
    expect(meaningLength("ja")).toBe(25);
    expect(meaningLength("es")).toBe(40);
  });
});
