/**
 * `ExplanationProvider` over Chrome's Prompt API (`LanguageModel`, Gemini Nano;
 * architecture "Meaning in context" → "Parts"; what Chrome 157 has: notes
 * "meaning-in-context" C1). Detected by whether `LanguageModel` exists, never by the
 * browser's name. Runs where the global is: the content script (top frames, and
 * iframes allowed `language-model`) and extension pages.
 */
import type {
  ExplainAvailability,
  ExplanationProvider,
  ExplanationSession,
} from "../../core/explain/provider";
import type { LanguagePair } from "../../core/packs/pairs";
import { progressShare } from "../download-progress";

/** A Prompt API session, current members and the older names (`inputQuota`, …). */
interface ModelSession {
  readonly contextWindow?: number;
  readonly inputQuota?: number;
  readonly contextUsage?: number;
  readonly inputUsage?: number;
  measureContextUsage?(
    text: string,
    options?: { signal?: AbortSignal },
  ): Promise<number>;
  measureInputUsage?(
    text: string,
    options?: { signal?: AbortSignal },
  ): Promise<number>;
  prompt(
    text: string,
    options?: { responseConstraint?: object; signal?: AbortSignal },
  ): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<ModelSession>;
  destroy(): void;
}

interface LanguageOptions {
  expectedInputs: { type: "text"; languages: string[] }[];
  expectedOutputs: { type: "text"; languages: string[] }[];
}

/** The global `LanguageModel`. */
export interface LanguageModelApi {
  availability(options?: LanguageOptions): Promise<string>;
  create(
    options?: LanguageOptions & {
      initialPrompts?: { role: "system"; content: string }[];
      monitor?(monitor: EventTarget): void;
      signal?: AbortSignal;
    },
  ): Promise<ModelSession>;
}

/**
 * What `availability()` says, in the current names and the older ones ("readily",
 * "after-download", "no"). Anything else is `unavailable`.
 */
const AVAILABILITY: Readonly<Record<string, ExplainAvailability>> = {
  available: "ready",
  readily: "ready",
  downloadable: "downloadable",
  "after-download": "downloadable",
  downloading: "downloading",
};

/**
 * The pair's languages: the instructions are English, the term's text is in the
 * learning language, the answer in the native one (Chrome 157 has no Portuguese: that
 * pair is `unavailable`).
 */
const languages = ({ learning, native }: LanguagePair): LanguageOptions => ({
  expectedInputs: [{ type: "text", languages: [...new Set(["en", learning])] }],
  expectedOutputs: [{ type: "text", languages: [native] }],
});

/** `navigator.userAgentData.brands` (User-Agent Client Hints). */
type Brands = readonly { brand: string; version: string }[];

/**
 * The browser engine's major version (its "Chromium" brand), in the cache key: the
 * API names no model version, and a browser update may bring a new model.
 */
export const majorVersion = (brands: Brands | undefined) =>
  brands?.find((b) => b.brand === "Chromium")?.version.split(".")[0] ?? "0";

/** `promise`, or the signal's reason as soon as it aborts. */
function unlessAborted<T>(promise: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason as Error);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/** One prompt's session over a clone of the base session. */
function sessionOf(model: ModelSession): ExplanationSession {
  const measure = model.measureContextUsage ?? model.measureInputUsage;
  return {
    budget:
      (model.contextWindow ?? model.inputQuota ?? 0) -
      (model.contextUsage ?? model.inputUsage ?? 0),
    async measure(text, signal) {
      if (!measure) throw new Error("The model cannot count tokens");
      return measure.call(model, text, signal && { signal });
    },
    prompt: (text, schema, signal) =>
      model.prompt(text, { responseConstraint: schema, signal }),
    destroy: () => model.destroy(),
  };
}

/**
 * The provider over `api`. One base session holds the instructions (a system prompt)
 * for the page; each prompt runs in a `clone()` of it (M0 check 2: 0.65 s less per
 * prompt), destroyed after. A base made for other instructions or another pair is
 * destroyed, and one that fails is made again next time.
 */
export function createChromePromptApi(
  api: LanguageModelApi,
  /** `majorVersion` */
  version: string,
): ExplanationProvider {
  let base:
    | { id: string; session: Promise<ModelSession>; created: boolean }
    | undefined;

  function baseFor(pair: LanguagePair, instructions: string) {
    const id = JSON.stringify([pair.learning, pair.native, instructions]);
    if (base?.id === id) return base;
    const old = base?.session;
    old?.then((s) => s.destroy()).catch(() => {});
    // Not aborted with the prompt that asked for it: the next prompt uses it.
    const session = api.create({
      ...languages(pair),
      initialPrompts: [{ role: "system", content: instructions }],
    });
    const made = { id, session, created: false };
    base = made;
    session.then(
      () => {
        made.created = true;
      },
      () => {
        if (base === made) base = undefined;
      },
    );
    return made;
  }

  return {
    name: "chrome-prompt-api",
    version,
    async availability(pair) {
      return (
        AVAILABILITY[await api.availability(languages(pair))] ?? "unavailable"
      );
    },
    async download(pair, onProgress) {
      // Called in the click: `create()` starts the download only with a user activation.
      const session = await api.create({
        ...languages(pair),
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) =>
            onProgress(progressShare(event)),
          );
        },
      });
      session.destroy();
    },
    async session(pair, instructions, signal, onStarting) {
      const made = baseFor(pair, instructions);
      // The base still being created is the model starting (7–9 s after it was idle).
      const starting = !made.created;
      if (starting) onStarting?.(true);
      let session: ModelSession;
      try {
        session = await unlessAborted(made.session, signal);
      } finally {
        if (starting && !signal.aborted) onStarting?.(false);
      }
      try {
        return sessionOf(await session.clone({ signal }));
      } catch (error) {
        // A base that cannot be cloned (the model went) is made again next time.
        if (!signal.aborted && base === made) base = undefined;
        throw error;
      }
    },
  };
}

/** The provider where `LanguageModel` exists, else none (Firefox, other browsers). */
export function chromePromptApi(
  g: object = globalThis,
): ExplanationProvider | undefined {
  const api = (g as { LanguageModel?: LanguageModelApi }).LanguageModel;
  return api === undefined
    ? undefined
    : createChromePromptApi(
        api,
        majorVersion(
          (navigator as { userAgentData?: { brands: Brands } }).userAgentData
            ?.brands,
        ),
      );
}

let pageProvider: ExplanationProvider | undefined | null = null;

/**
 * This page's provider: one for every part of the page (a YouTube video and its
 * comments), so they share one base session.
 */
export function explanationProvider(): ExplanationProvider | undefined {
  if (pageProvider === null) pageProvider = chromePromptApi();
  return pageProvider;
}
