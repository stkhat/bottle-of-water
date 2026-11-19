import { describe, expect, it } from "vitest";
import { answerJson } from "../../testing/explain";
import {
  ANSWER_SCHEMA,
  answerSchema,
  checkAnswer,
  isAnswer,
  MAX_MEANING,
  MAX_PHRASE,
  PHRASE_ANSWER_SCHEMA,
} from "./answer";

describe("ANSWER_SCHEMA", () => {
  it("asks for the meaning, then the sense, and nothing else", () => {
    expect(Object.keys(ANSWER_SCHEMA.properties)).toEqual(["meaning", "sense"]);
    expect(ANSWER_SCHEMA.required).toEqual(["meaning", "sense"]);
    expect(ANSWER_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("checkAnswer", () => {
  it("takes a good answer as it is, trimmed", () => {
    expect(
      checkAnswer(answerJson({ meaning: " 川岸、土手 ", sense: 2 }), 2),
    ).toEqual({ ok: true, answer: { meaning: "川岸、土手", sense: 2 } });
  });

  it("turns a sense that is not one of the listed meanings into none", () => {
    for (const sense of [0, 3, -1, 1.5, "2", true]) {
      const json = JSON.stringify({ meaning: "船", sense });
      expect(checkAnswer(json, 2)).toMatchObject({
        ok: true,
        answer: { sense: null },
      });
    }
    expect(checkAnswer(answerJson({ sense: 1 }), 0)).toMatchObject({
      answer: { sense: null },
    });
    expect(checkAnswer(answerJson({ sense: 1 }), 1)).toMatchObject({
      answer: { sense: 1 },
    });
  });

  it("drops fields outside the schema", () => {
    expect(
      checkAnswer(
        JSON.stringify({ meaning: "船", explanation: "説明。", sense: 1 }),
        1,
      ),
    ).toEqual({ ok: true, answer: { meaning: "船", sense: 1 } });
  });

  it("finds text that is not a JSON object bad", () => {
    for (const json of ["", "{", "meaning: 船", "[]", "null", '"船"', "3"])
      expect(checkAnswer(json, 1)).toEqual({ ok: false, why: "notJson" });
  });

  it("finds an answer without a meaning bad", () => {
    for (const meaning of ["", "   "])
      expect(checkAnswer(answerJson({ meaning }), 1)).toEqual({
        ok: false,
        why: "noMeaning",
      });
    expect(checkAnswer('{"sense":1}', 1)).toEqual({
      ok: false,
      why: "noMeaning",
    });
  });

  it("cuts a meaning that runs on", () => {
    const checked = checkAnswer(
      answerJson({ meaning: "あ".repeat(MAX_MEANING + 5) }),
      0,
    );
    expect(checked.ok && checked.answer.meaning.length).toBe(MAX_MEANING);
  });
});

describe("checkAnswer for selected words", () => {
  it("reads the phrase, trimmed; none when missing or too long", () => {
    const read = (phrase?: string) => {
      const checked = checkAnswer(answerJson({ phrase }), 0, true);
      return checked.ok ? checked.answer.phrase : undefined;
    };
    expect(read(" make up one's mind ")).toBe("make up one's mind");
    expect(read(undefined)).toBe("");
    expect(read("a ".repeat(MAX_PHRASE))).toBe("");
  });

  it("asks for the phrase after the meaning", () => {
    expect(Object.keys(PHRASE_ANSWER_SCHEMA.properties)).toEqual([
      "meaning",
      "sense",
      "phrase",
    ]);
    expect(answerSchema(true)).toBe(PHRASE_ANSWER_SCHEMA);
    expect(answerSchema(false)).toBe(ANSWER_SCHEMA);
  });
});

describe("isAnswer", () => {
  it("accepts what checkAnswer gives and refuses the rest", () => {
    const good = { meaning: "船", sense: null };
    expect(isAnswer(good)).toBe(true);
    expect(isAnswer({ ...good, sense: 2 })).toBe(true);
    for (const bad of [
      null,
      "船",
      { ...good, meaning: "" },
      { ...good, meaning: "あ".repeat(MAX_MEANING + 1) },
      { ...good, sense: 0 },
      { ...good, sense: 1.5 },
      { ...good, sense: undefined },
    ])
      expect(isAnswer(bad)).toBe(false);
  });

  it("accepts a kept phrase, and refuses one that is not text or too long", () => {
    const good = { meaning: "決心する", sense: null };
    expect(isAnswer({ ...good, phrase: "make up one's mind" })).toBe(true);
    expect(isAnswer({ ...good, phrase: "" })).toBe(true);
    expect(isAnswer({ ...good, phrase: 1 })).toBe(false);
    expect(isAnswer({ ...good, phrase: "a ".repeat(MAX_PHRASE) })).toBe(false);
  });

  it("accepts a row kept with the earlier explanation fields", () => {
    expect(
      isAnswer({
        meaning: "船",
        unusual: true,
        explanation: "説明。",
        sense: 1,
      }),
    ).toBe(true);
  });
});
