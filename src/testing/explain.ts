// A fake ExplanationProvider: answers from a script, counts a token per four
// characters, and records what it was asked.
import type {
  ExplainAvailability,
  ExplanationProvider,
} from "../core/explain/provider";
import type { LanguagePair } from "../core/packs/pairs";

/** An answer that never comes: the prompt waits until it is aborted. */
export const HANG = Symbol("hang");

/**
 * One answer of the fake model: its JSON text, an error it throws, `HANG`, or a
 * function of the prompt.
 */
type FakeAnswer =
  string | Error | typeof HANG | ((prompt: string) => string | Promise<string>);

export interface FakeProviderOptions {
  availability?: ExplainAvailability;
  /** The session's budget (default 8,000). */
  budget?: number;
  /** Tokens of a text (default one per four characters, rounded up). */
  measure?: (text: string) => number;
  /** The answers in turn; the last one repeats (default `answerJson()`). */
  answers?: FakeAnswer[];
}

/** An answer's JSON as the model writes it. */
export const answerJson = ({
  meaning = "意味",
  unusual = false,
  explanation = null,
  sense = null,
}: {
  meaning?: string;
  unusual?: boolean;
  explanation?: string | null;
  sense?: number | null;
} = {}) => JSON.stringify({ meaning, unusual, explanation, sense });

/** Rejects with the signal's reason once it aborts. */
const aborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason as Error);
    signal.addEventListener("abort", () => reject(signal.reason as Error), {
      once: true,
    });
  });

export function fakeExplanationProvider(options: FakeProviderOptions = {}) {
  const measure =
    options.measure ?? ((text: string) => Math.ceil(text.length / 4));
  const answers = [...(options.answers ?? [answerJson()])];
  const log = {
    /** Each session's pair and instructions, and whether it was destroyed. */
    sessions: [] as {
      pair: LanguagePair;
      instructions: string;
      destroyed: boolean;
    }[],
    /** Every text measured, in order. */
    measured: [] as string[],
    /** Every prompt, in order. */
    prompts: [] as string[],
    /** Prompts that were aborted. */
    aborted: 0,
  };
  let availability = options.availability ?? "ready";

  const provider: ExplanationProvider = {
    name: "fake",
    version: "1",
    availability: async () => availability,
    async download(_pair, onProgress) {
      onProgress(0);
      onProgress(1);
      availability = "ready";
    },
    async session(pair, instructions, signal) {
      signal.throwIfAborted();
      const record = { pair, instructions, destroyed: false };
      log.sessions.push(record);
      return {
        budget: options.budget ?? 8_000,
        async measure(text) {
          log.measured.push(text);
          return measure(text);
        },
        async prompt(text, _schema, signal) {
          signal.throwIfAborted();
          log.prompts.push(text);
          const next = answers.length > 1 ? answers.shift()! : answers[0]!;
          const answer =
            next === HANG
              ? aborted(signal)
              : next instanceof Error
                ? Promise.reject(next)
                : Promise.resolve(
                    typeof next === "function" ? next(text) : next,
                  );
          try {
            return await Promise.race([answer, aborted(signal)]);
          } catch (error) {
            if (signal.aborted) log.aborted++;
            throw error;
          }
        },
        destroy() {
          record.destroyed = true;
        },
      };
    },
  };
  return { provider, log };
}
