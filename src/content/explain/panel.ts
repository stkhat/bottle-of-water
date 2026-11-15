/**
 * "In this sentence" of one part's dictionary window (ui.md "Meaning in context and
 * your meanings"): whether it shows, the button, the download, the reading, the answer
 * and the error. Shared by the video and article parts.
 */
import { MAX_LINES } from "../../core/explain/context";
import { alternate } from "../../core/explain/prompt";
import type {
  ExplainAvailability,
  ExplanationProvider,
} from "../../core/explain/provider";
import type { LanguagePair } from "../../core/packs/pairs";
import type { Settings } from "../../core/settings";
import type { send } from "../../messaging/client";
import { createBrowserEnv } from "../../core/browser-env";
import type { DictionaryWindowProps } from "../../ui/lookup/DictionaryWindow";
import type { ExplainView } from "../../ui/lookup/InThisSentence";
import { isAbortError } from "../abort";
import { answerChoice, type TermCard } from "../lookup/describe";
import { latest } from "../lookup/lookup";
import { warn } from "../lookup/warn";
import { createExplainRunner, type ExplainRequest } from "./runner";

/** What the window was opened on. */
export interface ExplainTarget {
  request: ExplainRequest;
  /** The dictionary has no entry for the term: explained at once (`explainUnknown`). */
  noEntry: boolean;
}

const pairOf = ({ input }: ExplainRequest): LanguagePair => ({
  learning: input.learning,
  native: input.native,
});

/** The lines the prompt will hold unless they do not fit ("Reading N lines…"). */
const linesOf = ({ input }: ExplainRequest) =>
  Math.min(MAX_LINES, alternate(input).length);

/** What the section's buttons do, in a part's app. */
export interface ExplainActions {
  /** "Explain in context". */
  explainHere(): void;
  /** "Download and explain" (in the click). */
  downloadModel(): void;
  /** "Try again". */
  retryExplain(): void;
  /** "Use this meaning" / "Used here" on the answer. */
  useAnswer(): void;
}

/** The answer the section shows, which Meanings follows ("Fits here"). */
export const shownAnswer = (view: ExplainView | null) =>
  view?.state === "answer" ? view.answer : undefined;

const BROWSER_NAME = createBrowserEnv().name;

/** The window's "In this sentence" for `card`, or none. */
export function explainSection(
  card: TermCard,
  view: ExplainView | null,
  app: ExplainActions,
): DictionaryWindowProps["explain"] {
  if (!view) return undefined;
  const answer = shownAnswer(view);
  return {
    view,
    browserName: BROWSER_NAME,
    hasSenses: card.senses.length > 0,
    usedHere: answer ? answerChoice(card, answer).usedHere : false,
    onExplain: app.explainHere,
    onDownload: app.downloadModel,
    onRetry: app.retryExplain,
    onUse: app.useAnswer,
  };
}

/**
 * The section's state for the window open now: `show` gets it as it changes (null: no
 * section). Nothing shows without a provider or where it cannot run for the pair; the
 * availability is read each time the window opens on a term (Chrome removes its model
 * when disk runs low). A kept answer shows at once.
 */
export function createExplainPanel(o: {
  provider: ExplanationProvider | undefined;
  send: typeof send;
  settings(): Settings;
  show(view: ExplainView | null): void;
}) {
  const { provider } = o;
  const runner = provider && createExplainRunner({ provider, send: o.send });
  const ticket = latest();
  let target: ExplainTarget | undefined;

  const availability = (request: ExplainRequest) =>
    provider!
      .availability(pairOf(request))
      .catch((error: unknown): ExplainAvailability => {
        warn(error);
        return "unavailable";
      });

  /** Asks the model (or the cache) and shows the reading, then the answer. */
  function start() {
    const request = target?.request;
    if (!request || !runner) return;
    const isLatest = ticket.next();
    o.show({ state: "reading", lines: linesOf(request) });
    runner.explain(request).then(
      ({ answer, lines }) => {
        if (isLatest()) o.show({ state: "answer", answer, lines });
      },
      (error: unknown) => {
        if (isAbortError(error) || !isLatest()) return;
        warn(error);
        o.show({ state: "error" });
      },
    );
  }

  return {
    /** The window opened on a term (`next`), or on one the AI cannot explain (undefined). */
    async open(next: ExplainTarget | undefined) {
      runner?.cancel();
      const isLatest = ticket.next();
      target = next;
      o.show(null);
      if (!next || !runner || !provider) return;
      const { request } = next;
      const can = await availability(request);
      if (!isLatest() || can === "unavailable") return;
      const kept = await runner.kept(request);
      if (!isLatest()) return;
      if (kept) {
        o.show({ state: "answer", answer: kept.answer, lines: kept.lines });
        return;
      }
      if (can !== "ready") o.show({ state: "download" });
      else if (next.noEntry && o.settings().explainUnknown) start();
      else o.show({ state: "idle" });
    },
    /** "Explain in context". */
    explain: start,
    /**
     * "Download and explain": in the click, which the download needs as its user
     * activation, then the explanation.
     */
    download() {
      const request = target?.request;
      if (!request || !provider) return;
      const isLatest = ticket.next();
      o.show({ state: "downloading", loaded: 0 });
      provider
        .download(pairOf(request), (loaded) => {
          if (isLatest()) o.show({ state: "downloading", loaded });
        })
        .then(
          () => {
            if (isLatest()) start();
          },
          (error: unknown) => {
            if (!isLatest()) return;
            warn(error);
            o.show({ state: "error" });
          },
        );
    },
    /** "Try again": the model may have gone meanwhile. */
    async retry() {
      const request = target?.request;
      if (!request || !provider) return;
      const isLatest = ticket.next();
      const can = await availability(request);
      if (!isLatest()) return;
      if (can === "unavailable") o.show(null);
      else if (can !== "ready") o.show({ state: "download" });
      else start();
    },
    /** The window closed: what runs stops. */
    close() {
      runner?.cancel();
      ticket.drop();
      target = undefined;
      o.show(null);
    },
  };
}
