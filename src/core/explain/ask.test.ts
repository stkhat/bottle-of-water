import { describe, expect, it } from "vitest";
import {
  answerJson,
  fakeExplanationProvider,
  HANG,
} from "../../testing/explain";
import { ANSWER_SCHEMA, PHRASE_ANSWER_SCHEMA } from "./answer";
import { answerVersion, ask, BadAnswerError } from "./ask";
import { ContextTooLongError } from "./context";
import { instructions, type ExplainInput } from "./prompt";

const INPUT: ExplainInput = {
  learning: "en",
  native: "ja",
  written: "bank",
  base: "bank",
  kind: "word",
  sentence: "We sat on the bank.",
  marks: [{ start: 14, end: 18 }],
  senses: [
    { pos: "noun", text: "銀行" },
    { pos: "noun", text: "土手" },
  ],
  before: ["The river was slow."],
  after: ["Boats went by."],
};

const signal = () => new AbortController().signal;

describe("ask", () => {
  it("answers with the checked answer and the lines the prompt held", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [answerJson({ meaning: "土手", sense: 2 })],
    });
    expect(await ask(provider, INPUT, signal())).toEqual({
      answer: { meaning: "土手", sense: 2 },
      lines: 2,
    });
    expect(log.sessions).toEqual([
      {
        pair: { learning: "en", native: "ja" },
        instructions: instructions(INPUT),
        destroyed: true,
      },
    ]);
    expect(log.prompts).toHaveLength(1);
  });

  it("asks once more in a new session after a bad answer, with the same prompt", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: ["{not json", answerJson({ meaning: "土手" })],
    });
    expect((await ask(provider, INPUT, signal())).answer.meaning).toBe("土手");
    expect(log.sessions.map((s) => s.destroyed)).toEqual([true, true]);
    expect(log.prompts).toHaveLength(2);
    expect(log.prompts[1]).toBe(log.prompts[0]);
    expect(log.measured).toHaveLength(1);
  });

  it("fails after two bad answers", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [answerJson({ meaning: "" }), "nope"],
    });
    const error = await ask(provider, INPUT, signal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadAnswerError);
    expect((error as BadAnswerError).why).toBe("notJson");
    expect(log.prompts).toHaveLength(2);
  });

  it("does not ask again when the model throws", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [new Error("The input is too large."), answerJson()],
    });
    await expect(ask(provider, INPUT, signal())).rejects.toThrow(
      "The input is too large.",
    );
    expect(log.prompts).toHaveLength(1);
    expect(log.sessions[0]?.destroyed).toBe(true);
  });

  it("fails without prompting when the sentence does not fit", async () => {
    const { provider, log } = fakeExplanationProvider({ budget: 100 });
    await expect(ask(provider, INPUT, signal())).rejects.toThrow(
      ContextTooLongError,
    );
    expect(log.prompts).toEqual([]);
  });

  it("stops when aborted, and frees the session", async () => {
    const { provider, log } = fakeExplanationProvider({ answers: [HANG] });
    const controller = new AbortController();
    const asked = ask(provider, INPUT, controller.signal);
    await expect.poll(() => log.prompts.length).toBe(1);
    controller.abort();
    await expect(asked).rejects.toMatchObject({ name: "AbortError" });
    expect(log.sessions[0]?.destroyed).toBe(true);
    expect(log.aborted).toBe(1);
  });
});

describe("ask for selected words", () => {
  it("asks with the phrase's schema and keeps the phrase", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [
        answerJson({ meaning: "決心する", phrase: " make up one's mind " }),
      ],
    });
    const { answer } = await ask(
      provider,
      { ...INPUT, senses: [], selected: true },
      signal(),
    );
    expect(answer).toEqual({
      meaning: "決心する",
      sense: null,
      phrase: "make up one's mind",
    });
    expect(log.schemas).toEqual([PHRASE_ANSWER_SCHEMA]);
  });

  it("keeps no phrase for words not selected", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [answerJson({ phrase: "bank" })],
    });
    const { answer } = await ask(provider, INPUT, signal());
    expect(answer).not.toHaveProperty("phrase");
    expect(log.schemas).toEqual([ANSWER_SCHEMA]);
  });
});

describe("answerVersion", () => {
  it("differs for selected words, where the answer has a phrase", () => {
    const ja = { learning: "en", native: "ja" };
    expect(answerVersion({ ...ja, selected: true })).not.toBe(
      answerVersion(ja),
    );
    // Spanish has no phrase note: the same answers either way.
    const es = { learning: "es", native: "en" };
    expect(answerVersion({ ...es, selected: true })).toBe(answerVersion(es));
  });

  it("is the same for a pair and differs between pairs", () => {
    const ja = { learning: "en", native: "ja" };
    expect(answerVersion(ja)).toBe(answerVersion({ ...ja }));
    expect(answerVersion(ja)).toMatch(/^[0-9a-f]{16}$/);
    expect(answerVersion({ learning: "en", native: "es" })).not.toBe(
      answerVersion(ja),
    );
  });
});
