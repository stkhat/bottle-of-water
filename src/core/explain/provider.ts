/**
 * The language model behind "Meaning in context" (architecture "Meaning in context" →
 * "Parts"): one small interface, so another model (the mobile app's, an API key) adds
 * an implementation and changes nothing else. Browser-free.
 */
import type { LanguagePair } from "../packs/pairs";

/**
 * What the provider can do for a pair: answer now, download its model first (only
 * inside a click), wait for a download in progress, or nothing (a language the model
 * does not read or write, a device that cannot run it).
 */
export type ExplainAvailability =
  "ready" | "downloadable" | "downloading" | "unavailable";

/** One prompt's session: the instructions are in it already. */
export interface ExplanationSession {
  /**
   * The input tokens one prompt may use: the model's input limit less what the
   * instructions take (Chrome: `contextWindow`, older `inputQuota`, less
   * `contextUsage`).
   */
  readonly budget: number;
  /**
   * The tokens `text` takes as a prompt (Chrome: `measureContextUsage`, older
   * `measureInputUsage`; neither counts the schema).
   */
  measure(text: string, signal?: AbortSignal): Promise<number>;
  /** The answer as JSON text constrained to `schema`; rejects when `signal` aborts. */
  prompt(text: string, schema: object, signal: AbortSignal): Promise<string>;
  /** Frees the session once its answer is in (or it was aborted). */
  destroy(): void;
}

export interface ExplanationProvider {
  /** Names the provider in the cache key ("chrome-prompt-api"). */
  readonly name: string;
  /**
   * What its answers depend on beyond the provider, in the cache key: the browser's
   * major version for Chrome, whose API names no model version (an update may bring a
   * new model).
   */
  readonly version: string;
  /** Asked again whenever the window or Settings opens: a model can be removed. */
  availability(pair: LanguagePair): Promise<ExplainAvailability>;
  /** Only inside a user activation (a click). `onProgress` gets 0 to 1. */
  download(
    pair: LanguagePair,
    onProgress: (loaded: number) => void,
  ): Promise<void>;
  /**
   * A session for one prompt, `instructions` given first (a system prompt). A
   * provider may keep a base session per page holding them and give a clone of it.
   * `onStarting(true)` when the session waits for the model itself to start (Chrome:
   * the base session's `create()`, the model loading), `onStarting(false)` once it
   * has; not called when the model is up already, nor after `signal` aborts.
   */
  session(
    pair: LanguagePair,
    instructions: string,
    signal: AbortSignal,
    onStarting?: (starting: boolean) => void,
  ): Promise<ExplanationSession>;
}
