import { describe, expect, it } from "vitest";
import { answerJson } from "../../testing/explain";
import {
  ANSWER_SCHEMA,
  checkAnswer,
  isAnswer,
  MAX_EXPLANATION,
  MAX_MEANING,
} from "./answer";

describe("ANSWER_SCHEMA", () => {
  it("asks for the meaning, then unusual, then the explanation, then the sense", () => {
    expect(Object.keys(ANSWER_SCHEMA.properties)).toEqual([
      "meaning",
      "unusual",
      "explanation",
      "sense",
    ]);
    expect(ANSWER_SCHEMA.required).toEqual([
      "meaning",
      "unusual",
      "explanation",
      "sense",
    ]);
  });
});

describe("checkAnswer", () => {
  it("takes a good answer as it is, trimmed", () => {
    expect(
      checkAnswer(
        answerJson({
          meaning: " 川岸、土手 ",
          unusual: true,
          explanation: " ここでは川のそばの土地のこと。 ",
          sense: 2,
        }),
        2,
      ),
    ).toEqual({
      ok: true,
      answer: {
        meaning: "川岸、土手",
        unusual: true,
        explanation: "ここでは川のそばの土地のこと。",
        sense: 2,
      },
    });
  });

  it("turns a sense that is not one of the listed meanings into none", () => {
    for (const sense of [0, 3, -1, 1.5, "2", true]) {
      const json = JSON.stringify({
        meaning: "船",
        unusual: false,
        explanation: null,
        sense,
      });
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

  it("drops the explanation unless the term is unusual", () => {
    expect(
      checkAnswer(
        answerJson({ unusual: false, explanation: "ふつうの使い方です。" }),
        0,
      ),
    ).toMatchObject({ answer: { unusual: false, explanation: null } });
    // Anything but true is not unusual.
    expect(
      checkAnswer(
        JSON.stringify({ meaning: "船", unusual: "true", explanation: "x" }),
        0,
      ),
    ).toMatchObject({ answer: { unusual: false, explanation: null } });
    expect(
      checkAnswer(answerJson({ unusual: true, explanation: "  " }), 0),
    ).toMatchObject({ answer: { unusual: true, explanation: null } });
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
    expect(checkAnswer('{"unusual":false}', 1)).toEqual({
      ok: false,
      why: "noMeaning",
    });
  });

  it("cuts a meaning or an explanation that runs on", () => {
    const checked = checkAnswer(
      answerJson({
        meaning: "あ".repeat(MAX_MEANING + 5),
        unusual: true,
        explanation: "い".repeat(MAX_EXPLANATION + 5),
      }),
      0,
    );
    expect(checked.ok && checked.answer.meaning.length).toBe(MAX_MEANING);
    expect(checked.ok && checked.answer.explanation?.length).toBe(
      MAX_EXPLANATION,
    );
  });
});

describe("isAnswer", () => {
  it("accepts what checkAnswer gives and refuses the rest", () => {
    const good = {
      meaning: "船",
      unusual: false,
      explanation: null,
      sense: null,
    };
    expect(isAnswer(good)).toBe(true);
    expect(
      isAnswer({ ...good, unusual: true, explanation: "説明。", sense: 2 }),
    ).toBe(true);
    for (const bad of [
      null,
      "船",
      { ...good, meaning: "" },
      { ...good, meaning: "あ".repeat(MAX_MEANING + 1) },
      { ...good, unusual: "no" },
      { ...good, explanation: 3 },
      { ...good, explanation: undefined },
      { ...good, sense: 0 },
      { ...good, sense: 1.5 },
      { ...good, sense: undefined },
    ])
      expect(isAnswer(bad)).toBe(false);
  });
});
