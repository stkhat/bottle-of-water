import { describe, expect, it } from "vitest";
import {
  ANSWER_ROOM,
  ContextTooLongError,
  fitContext,
  MAX_LINES,
} from "./context";
import { alternate, buildPrompt, type ExplainInput } from "./prompt";

const SENTENCE = "We figured it out on the way home.";

const INPUT: ExplainInput = {
  learning: "en",
  native: "ja",
  written: "figured it out",
  base: "figure out",
  kind: "phrase",
  sentence: SENTENCE,
  marks: [
    { start: 3, end: 10 },
    { start: 14, end: 17 },
  ],
  senses: [{ pos: "verb", text: "…を理解する" }],
  before: ["The map was wrong.", "Nobody knew the road.", "It got dark."],
  after: ["Then we slept.", "The next day was sunny.", "We left early."],
};

/** A session that counts one token per character and records what it measured. */
function session(budget: number) {
  const measured: string[] = [];
  return {
    measured,
    budget,
    measure: async (text: string) => {
      measured.push(text);
      return text.length;
    },
  };
}

/** The lines around the sentence a prompt holds, in text order. */
function linesIn(prompt: string): string[] {
  const at = prompt.indexOf("Text around it");
  if (at < 0) return [];
  return prompt
    .slice(at)
    .split("\n")
    .slice(1)
    .filter((line) => !line.startsWith(">>> "));
}

/** A budget that fits the prompt with `lines` lines exactly. */
const budgetFor = (input: ExplainInput, lines: number) =>
  buildPrompt(input, lines).length + ANSWER_ROOM;

describe("alternate", () => {
  it("takes lines before and after in turn, the one before first, nearest first", () => {
    expect(alternate(INPUT).map((l) => l.text)).toEqual([
      "It got dark.",
      "Then we slept.",
      "Nobody knew the road.",
      "The next day was sunny.",
      "The map was wrong.",
      "We left early.",
    ]);
  });

  it("goes on with one side when the other has no more", () => {
    expect(
      alternate({ before: ["a", "b", "c"], after: ["x"] }).map((l) => l.text),
    ).toEqual(["c", "x", "b", "a"]);
    expect(
      alternate({ before: [], after: ["x", "y"] }).map((l) => l.text),
    ).toEqual(["x", "y"]);
  });
});

describe("fitContext", () => {
  it("holds at most five lines, the nearest, in text order, with one measure", async () => {
    const s = session(100_000);
    const fitted = await fitContext(INPUT, s);
    expect(MAX_LINES).toBe(5);
    expect(fitted.lines).toBe(5);
    expect(linesIn(fitted.prompt)).toEqual([
      "The map was wrong.",
      "Nobody knew the road.",
      "It got dark.",
      "Then we slept.",
      "The next day was sunny.",
    ]);
    expect(fitted.prompt).toContain(
      ">>> We [[figured]] it [[out]] on the way home.",
    );
    expect(s.measured).toEqual([fitted.prompt]);
  });

  it("holds the lines there are when fewer than five", async () => {
    const input = { ...INPUT, before: ["It got dark."], after: [] };
    const fitted = await fitContext(input, session(100_000));
    expect(fitted.lines).toBe(1);
    expect(linesIn(fitted.prompt)).toEqual(["It got dark."]);
  });

  it("drops a long line at the far end, whole, to fit", async () => {
    const long = `${"The map was wrong and long. ".repeat(200)}`.trim();
    const input = {
      ...INPUT,
      before: [long, "Nobody knew the road.", "It got dark."],
    };
    const s = session(budgetFor(input, 4));
    const fitted = await fitContext(input, s);
    expect(fitted.lines).toBe(4);
    expect(linesIn(fitted.prompt)).toEqual([
      "Nobody knew the road.",
      "It got dark.",
      "Then we slept.",
      "The next day was sunny.",
    ]);
    expect(fitted.prompt).not.toContain("The map was wrong");
    expect(s.measured).toHaveLength(2);
  });

  it("keeps every line whole: lines are dropped, never cut", async () => {
    for (let lines = 0; lines <= 5; lines++) {
      const fitted = await fitContext(
        INPUT,
        session(budgetFor(INPUT, lines) + 3),
      );
      expect(fitted.lines).toBe(lines);
      const all = [...INPUT.before, ...INPUT.after];
      for (const line of linesIn(fitted.prompt)) expect(all).toContain(line);
    }
  });

  it("holds only the sentence when no line fits", async () => {
    const s = session(budgetFor(INPUT, 0));
    const fitted = await fitContext(INPUT, s);
    expect(fitted).toEqual({ prompt: buildPrompt(INPUT, 0), lines: 0 });
    expect(fitted.prompt).not.toContain("Text around it");
    expect(fitted.prompt).toContain(
      "Sentence: We [[figured]] it [[out]] on the way home.",
    );
    expect(s.measured).toHaveLength(6);
  });

  it("fails when not even the sentence fits", async () => {
    await expect(
      fitContext(INPUT, session(budgetFor(INPUT, 0) - 1)),
    ).rejects.toThrow(ContextTooLongError);
  });

  it("stops measuring once aborted", async () => {
    const controller = new AbortController();
    const s = {
      budget: 0,
      measure: async (text: string) => {
        controller.abort();
        return text.length;
      },
    };
    await expect(fitContext(INPUT, s, controller.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
  });
});
