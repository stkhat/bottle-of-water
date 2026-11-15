import { ask, BadAnswerError } from "../../core/explain/ask";
import { ContextTooLongError } from "../../core/explain/context";
import type { ExplainInput } from "../../core/explain/prompt";
import type { ExplanationProvider } from "../../core/explain/provider";
import type { send } from "../../messaging/client";
import type { ExplanationKey, KeptExplanation } from "../../messaging/protocol";
import { warn } from "../lookup/warn";

/** No answer within this long is an error ("Couldn't explain this."). */
const EXPLAIN_TIMEOUT_MS = 30_000;

export interface ExplainRequest {
  input: ExplainInput;
  /** The term's key (`TermRecord.key`): with the place and the model, the cache key. */
  key: string;
  /** The video or page the sentence is in. */
  sourceUrl: string;
}

export interface Explanation extends KeptExplanation {
  /** It was kept from an earlier time: shown at once. */
  cached: boolean;
}

/**
 * Why there is no answer: none within the time, two bad answers, a sentence too long
 * for the model, or the model failed. All show as "Couldn't explain this."
 */
type ExplainFailure = "timeout" | "badAnswer" | "tooLong" | "failed";

export class ExplainError extends Error {
  readonly reason: ExplainFailure;
  constructor(reason: ExplainFailure, options?: { cause?: unknown }) {
    super(`Could not explain (${reason})`, options);
    this.name = "ExplainError";
    this.reason = reason;
  }
}

const failureOf = (error: unknown): ExplainFailure =>
  error instanceof BadAnswerError
    ? "badAnswer"
    : error instanceof ContextTooLongError
      ? "tooLong"
      : "failed";

/**
 * Runs the page's explanations one at a time (architecture "Meaning in context" →
 * "Parts"): a new one, for another term or the same, aborts the one running, and so
 * does `cancel()` (the window closed). A kept answer comes back at once; a new one is
 * kept by the background. Nothing runs without a provider: the UI asks for one only
 * when its pair is ready.
 */
export function createExplainRunner(o: {
  provider: ExplanationProvider;
  send: typeof send;
  /** Default 30 s. */
  timeoutMs?: number;
}) {
  const { provider } = o;
  const timeoutMs = o.timeoutMs ?? EXPLAIN_TIMEOUT_MS;
  let running: AbortController | undefined;

  function cancel() {
    running?.abort();
    running = undefined;
  }

  const keyOf = ({
    input,
    key,
    sourceUrl,
  }: ExplainRequest): ExplanationKey => ({
    learning: input.learning,
    native: input.native,
    key,
    sourceUrl,
    sentence: input.sentence,
    provider: provider.name,
    version: provider.version,
  });

  /** The kept answer, or null (also when the cache cannot be read: best effort). */
  const kept = (request: ExplainRequest) =>
    o
      .send({ type: "getExplanation", explanation: keyOf(request) })
      .catch((error: unknown) => {
        warn(error);
        return null;
      });

  /**
   * The term's meaning in its sentence. Rejects with an `AbortError` when another
   * explanation or `cancel()` came first, else with an `ExplainError`. `onStarting`
   * hears when the model itself is starting (`ExplanationProvider.session`).
   */
  async function explain(
    request: ExplainRequest,
    onStarting?: (starting: boolean) => void,
  ): Promise<Explanation> {
    cancel();
    const controller = new AbortController();
    running = controller;
    const { signal } = controller;
    const { input } = request;
    const explanation = keyOf(request);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Best effort: an unreadable cache asks the model.
      const found = await kept(request);
      signal.throwIfAborted();
      if (found) return { ...found, cached: true };
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("No answer in time", "TimeoutError"));
      }, timeoutMs);
      const { answer, lines } = await ask(provider, input, signal, onStarting);
      void o
        .send({ type: "putExplanation", explanation, answer, lines })
        .catch(warn);
      return { answer, lines, cached: false };
    } catch (error) {
      if (timedOut) throw new ExplainError("timeout");
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      throw new ExplainError(failureOf(error), { cause: error });
    } finally {
      clearTimeout(timer);
      if (running === controller) running = undefined;
    }
  }

  return { explain, kept, cancel };
}
