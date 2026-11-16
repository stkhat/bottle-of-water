/**
 * One explanation from the model: the session, the context that fits, the prompt and
 * the checked answer, asked again once when it is bad. Browser-free; any provider.
 */
import {
  ANSWER_SCHEMA,
  checkAnswer,
  type Answer,
  type BadAnswer,
} from "./answer";
import type { LanguagePair } from "../packs/pairs";
import { fnv1a64 } from "../url";
import { fitContext } from "./context";
import { instructions, type ExplainInput } from "./prompt";
import type { ExplanationProvider } from "./provider";

/** The model answered badly twice. */
export class BadAnswerError extends Error {
  readonly why: BadAnswer;
  constructor(why: BadAnswer) {
    super(`The model's answer was bad twice (${why})`);
    this.name = "BadAnswerError";
    this.why = why;
  }
}

export interface Explained {
  answer: Answer;
  /** How many lines around the sentence the prompt held. */
  lines: number;
}

/**
 * What a pair's answers depend on in Lingo: a hash of the instructions and the schema,
 * in the cache key next to the provider's version, so a changed prompt asks again
 * instead of showing answers kept from the one before.
 */
export const answerVersion = (pair: LanguagePair) =>
  fnv1a64(`${instructions(pair)}\n${JSON.stringify(ANSWER_SCHEMA)}`);

/** Times an answer is asked for: once, and once again when it is bad. */
const ATTEMPTS = 2;

/**
 * Asks `provider` what the term of `input` means in its sentence. Each attempt runs
 * in a session of its own (a retry does not see the bad answer). Rejects with
 * `BadAnswerError` after two bad answers, `ContextTooLongError` when the sentence
 * alone does not fit, and whatever the provider throws (an abort included).
 * `onStarting` hears when the model itself is starting (`ExplanationProvider.session`).
 */
export async function ask(
  provider: Pick<ExplanationProvider, "session">,
  input: ExplainInput,
  signal: AbortSignal,
  onStarting?: (starting: boolean) => void,
): Promise<Explained> {
  const pair = { learning: input.learning, native: input.native };
  const system = instructions(pair);
  let fitted: { prompt: string; lines: number } | undefined;
  let why: BadAnswer = "notJson";
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const session = await provider.session(pair, system, signal, onStarting);
    try {
      fitted ??= await fitContext(input, session, signal);
      const json = await session.prompt(fitted.prompt, ANSWER_SCHEMA, signal);
      const checked = checkAnswer(json, input.senses.length);
      if (checked.ok) return { answer: checked.answer, lines: fitted.lines };
      why = checked.why;
    } finally {
      session.destroy();
    }
  }
  throw new BadAnswerError(why);
}
