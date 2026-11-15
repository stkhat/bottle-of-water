import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExplainInput } from "../../core/explain/prompt";
import { isAbortError } from "../abort";
import { testBackground } from "../../testing/background";
import {
  answerJson,
  fakeExplanationProvider,
  HANG,
  type FakeProviderOptions,
} from "../../testing/explain";
import { createExplainRunner, ExplainError } from "./runner";

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
  after: ["Boats went by.", "It got dark."],
};

const REQUEST = {
  input: INPUT,
  key: "bank",
  sourceUrl: "https://example.com/river",
};

const OTHER = {
  ...REQUEST,
  key: "boat",
  input: {
    ...INPUT,
    written: "Boats",
    base: "boat",
    sentence: "Boats went by.",
  },
};

let background: ReturnType<typeof testBackground>;

afterEach(async () => {
  await background.close();
});

function setup(options: FakeProviderOptions = {}, timeoutMs?: number) {
  background = testBackground();
  const { provider, log } = fakeExplanationProvider(options);
  const runner = createExplainRunner({
    provider,
    send: background.send,
    ...(timeoutMs !== undefined && { timeoutMs }),
  });
  return { runner, log };
}

/** The error a promise rejects with. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("resolved");
    },
    (error: unknown) => error,
  );

describe("explain runner", () => {
  it("answers, keeps the answer, and gives it back at once next time", async () => {
    const { runner, log } = setup({
      answers: [answerJson({ meaning: "土手", sense: 2 })],
    });
    const answer = {
      meaning: "土手",
      unusual: false,
      explanation: null,
      sense: 2,
    };
    expect(await runner.explain(REQUEST)).toEqual({
      answer,
      lines: 3,
      cached: false,
    });
    await expect.poll(() => background.sent("putExplanation").length).toBe(1);
    expect(await runner.explain(REQUEST)).toEqual({
      answer,
      lines: 3,
      cached: true,
    });
    expect(log.prompts).toHaveLength(1);
    expect(background.sent("getExplanation")[0]?.explanation).toEqual({
      learning: "en",
      native: "ja",
      key: "bank",
      sourceUrl: "https://example.com/river",
      sentence: "We sat on the bank.",
      provider: "fake",
      version: "1",
    });
  });

  it("asks again for the same term in another source", async () => {
    const { runner, log } = setup();
    await runner.explain(REQUEST);
    await expect.poll(() => background.sent("putExplanation").length).toBe(1);
    const there = await runner.explain({
      ...REQUEST,
      sourceUrl: "https://example.com/money",
    });
    expect(there.cached).toBe(false);
    expect(log.prompts).toHaveLength(2);
  });

  it("aborts the running explanation when another term comes", async () => {
    const { runner, log } = setup({
      answers: [HANG, answerJson({ meaning: "船" })],
    });
    const first = runner.explain(REQUEST);
    await expect.poll(() => log.prompts.length).toBe(1);
    const second = runner.explain(OTHER);
    expect(isAbortError(await rejection(first))).toBe(true);
    expect((await second).answer.meaning).toBe("船");
    expect(log.aborted).toBe(1);
    expect(log.sessions.every((s) => s.destroyed)).toBe(true);
    // Only the answer that came is kept.
    await expect
      .poll(() =>
        background.sent("putExplanation").map((r) => r.explanation.key),
      )
      .toEqual(["boat"]);
  });

  it("aborts when the window closes", async () => {
    const { runner, log } = setup({ answers: [HANG] });
    const running = runner.explain(REQUEST);
    await expect.poll(() => log.prompts.length).toBe(1);
    runner.cancel();
    expect(isAbortError(await rejection(running))).toBe(true);
    expect(background.sent("putExplanation")).toEqual([]);
  });

  it("aborts before the model is asked when the window closes during the cache read", async () => {
    const { runner, log } = setup();
    const running = runner.explain(REQUEST);
    runner.cancel();
    expect(isAbortError(await rejection(running))).toBe(true);
    expect(log.sessions).toEqual([]);
  });

  it("fails when there is no answer in time", async () => {
    const { runner, log } = setup({ answers: [HANG] }, 50);
    const error = await rejection(runner.explain(REQUEST));
    expect(error).toBeInstanceOf(ExplainError);
    expect((error as ExplainError).reason).toBe("timeout");
    expect(log.aborted).toBe(1);
    expect(log.sessions[0]?.destroyed).toBe(true);
  });

  it("is 30 seconds by default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { runner, log } = setup({ answers: [HANG] });
      const running = rejection(runner.explain(REQUEST));
      // Not vi.waitFor or expect.poll: they move fake timers on.
      const task = () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => resolve();
          channel.port2.postMessage(null);
        });
      for (let i = 0; i < 1_000 && log.prompts.length === 0; i++) await task();
      expect(log.prompts).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(log.aborted).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(((await running) as ExplainError).reason).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks once more after a bad answer", async () => {
    const { runner, log } = setup({
      answers: ["not json", answerJson({ meaning: "土手" })],
    });
    expect((await runner.explain(REQUEST)).answer.meaning).toBe("土手");
    expect(log.prompts).toHaveLength(2);
  });

  it("fails after two bad answers and keeps nothing", async () => {
    const { runner, log } = setup({
      answers: [answerJson({ meaning: " " }), "{"],
    });
    const error = await rejection(runner.explain(REQUEST));
    expect((error as ExplainError).reason).toBe("badAnswer");
    expect(log.prompts).toHaveLength(2);
    expect(background.sent("putExplanation")).toEqual([]);
  });

  it("fails when the model throws or the sentence is too long", async () => {
    const thrown = setup({ answers: [new Error("The input is too large.")] });
    const failed = await rejection(thrown.runner.explain(REQUEST));
    expect((failed as ExplainError).reason).toBe("failed");
    expect((failed as ExplainError).cause).toMatchObject({
      message: "The input is too large.",
    });
    await background.close();
    const long = setup({ budget: 10 });
    expect(
      ((await rejection(long.runner.explain(REQUEST))) as ExplainError).reason,
    ).toBe("tooLong");
  });
});
