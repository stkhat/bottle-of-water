/**
 * How much context one prompt holds (architecture "Meaning in context" → "Context"):
 * the sentence and up to five whole lines around it, fewer when they do not fit the
 * model's input limit. Browser-free.
 */
import { alternate, buildPrompt, type ExplainInput } from "./prompt";
import type { ExplanationSession } from "./provider";

/** Lines around the sentence one prompt holds at most (M0 check 3: more add only time). */
export const MAX_LINES = 5;

/**
 * Tokens left for what `measure` does not count: the schema and the answer (M0 check 1:
 * a prompt's context use grew by about 370 tokens over its measured text).
 */
export const ANSWER_ROOM = 400;

/** Not even the sentence fits the model's input limit. */
export class ContextTooLongError extends Error {
  constructor() {
    super("The sentence does not fit the model's input limit");
    this.name = "ContextTooLongError";
  }
}

export interface Fitted {
  prompt: string;
  /** How many lines around the sentence it holds. */
  lines: number;
}

/**
 * The prompt with as many of the nearest lines as fit (at most `MAX_LINES`): one
 * `measure()` of the whole prompt, and while it is over the budget less
 * `ANSWER_ROOM`, the farthest line is dropped and the rest measured again (a line can
 * be very long). Throws `ContextTooLongError` when the sentence alone is over.
 */
export async function fitContext(
  input: ExplainInput,
  session: Pick<ExplanationSession, "budget" | "measure">,
  signal?: AbortSignal,
): Promise<Fitted> {
  const limit = session.budget - ANSWER_ROOM;
  for (
    let lines = Math.min(MAX_LINES, alternate(input).length);
    lines >= 0;
    lines--
  ) {
    const prompt = buildPrompt(input, lines);
    if ((await session.measure(prompt, signal)) <= limit)
      return { prompt, lines };
    signal?.throwIfAborted();
  }
  throw new ContextTooLongError();
}
