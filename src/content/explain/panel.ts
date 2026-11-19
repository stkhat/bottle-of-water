/**
 * "In this sentence" of one part's dictionary window (ui.md "Meaning in context and
 * your meanings"): whether it shows, the button, the download, the reading, the answer
 * and the error; for selected words, the phrase they stand for (the AI's proposal, or
 * one the user types). Shared by the video and article parts.
 */
import type { Answer } from "../../core/explain/answer";
import type {
  ExplainAvailability,
  ExplanationProvider,
} from "../../core/explain/provider";
import type { LanguagePair } from "../../core/packs/pairs";
import type { Settings } from "../../core/settings";
import type { send } from "../../messaging/client";
import { createBrowserEnv } from "../../core/browser-env";
import type { DictionaryWindowProps } from "../../ui/lookup/DictionaryWindow";
import type { ExplainView, PhraseView } from "../../ui/lookup/InThisSentence";
import { isAbortError } from "../abort";
import { answerChoice, type TermCard } from "../lookup/describe";
import { latest } from "../lookup/lookup";
import { warn } from "../lookup/warn";
import { createExplainRunner, type ExplainRequest } from "./runner";

/** What the window was opened on. */
export interface ExplainTarget {
  /** `input.selected`: words the user selected, whose phrase can be corrected. */
  request: ExplainRequest;
  /** The dictionary has no entry for the term: explained at once (`explainUnknown`). */
  noEntry: boolean;
}

/** A corrected phrase to save: its key, and its words as the sentence has them. */
export interface CorrectedPhrase {
  key: string;
  /** The words from its first to its last, as written in the sentence. */
  display: string;
}

const pairOf = ({ input }: ExplainRequest): LanguagePair => ({
  learning: input.learning,
  native: input.native,
});

/**
 * How long the model may take to start before the placeholder says "Starting
 * on-device AI…": a page's first base session is ready in well under a second, one
 * after the model was idle takes 7–9 s (notes "meaning-in-context").
 */
export const STARTING_NOTICE_MS = 1_000;

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
  /** The pencil, or "Edit phrase". */
  editCorrectPhrase(): void;
  /** "Cancel" (or Escape) in the phrase's edit. */
  cancelCorrectPhrase(): void;
  /** "Save phrase": the proposal, or the phrase typed (`text`). */
  saveCorrectPhrase(text?: string): void;
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
    onEditPhrase: app.editCorrectPhrase,
    onCancelPhrase: app.cancelCorrectPhrase,
    onSavePhrase: app.saveCorrectPhrase,
  };
}

/** The selected words of a request, in its sentence; none for a term not selected. */
function selectionOf(request: ExplainRequest | undefined) {
  const input = request?.input;
  if (!input?.selected || input.marks.length === 0) return undefined;
  return {
    lang: input.learning,
    sentence: input.sentence,
    start: Math.min(...input.marks.map((m) => m.start)),
    end: Math.max(...input.marks.map((m) => m.end)),
  };
}

/**
 * The section's state for the window open now: `show` gets it as it changes (null: no
 * section). Nothing shows without a provider or where it cannot run for the pair; the
 * availability is read each time the window opens on a term (Chrome removes its model
 * when disk runs low). A kept answer shows at once. `savePhrase` saves a corrected
 * phrase from this sentence (and opens the window on it).
 */
export function createExplainPanel(o: {
  provider: ExplanationProvider | undefined;
  send: typeof send;
  settings(): Settings;
  show(view: ExplainView | null): void;
  savePhrase(phrase: CorrectedPhrase): Promise<void>;
}) {
  const { provider } = o;
  const runner = provider && createExplainRunner({ provider, send: o.send });
  const ticket = latest();
  let target: ExplainTarget | undefined;
  /** What the section shows now. */
  let shown: ExplainView | null = null;
  /** The AI's checked proposal for the selection, while the answer shows. */
  let proposal: { key: string; start: number; end: number } | undefined;

  function show(view: ExplainView | null) {
    shown = view;
    o.show(view);
  }

  /** The answer shown now with `phrase` under it. */
  function showPhrase(phrase: PhraseView) {
    if (shown?.state === "answer") show({ ...shown, phrase });
  }

  const availability = (request: ExplainRequest) =>
    provider!
      .availability(pairOf(request))
      .catch((error: unknown): ExplainAvailability => {
        warn(error);
        return "unavailable";
      });

  /**
   * `text` as the phrase of the selected words: its key and place, or why it is none.
   * A proposal must also correct the selection. Failing to ask is "none" (warned).
   */
  async function check(text: string, isProposal: boolean) {
    const selection = selectionOf(target?.request);
    if (!selection) return undefined;
    return o
      .send({
        type: "checkPhrase",
        ...selection,
        text,
        ...(isProposal && { proposal: true }),
      })
      .catch((error: unknown) => {
        warn(error);
        return undefined;
      });
  }

  /** The answer; for selected words, with the AI's phrase once it checks out. */
  async function showAnswer(answer: Answer, isLatest: () => boolean) {
    proposal = undefined;
    if (!selectionOf(target?.request)) {
      show({ state: "answer", answer });
      return;
    }
    const checked = answer.phrase
      ? await check(answer.phrase, true)
      : undefined;
    if (!isLatest()) return;
    if (checked && "key" in checked) proposal = checked;
    show({
      state: "answer",
      answer,
      phrase: proposal
        ? { state: "proposal", key: proposal.key }
        : { state: "none" },
    });
  }

  /** The phrase from `start` to `end` of the sentence, saved. */
  async function save(fix: { key: string; start: number; end: number }) {
    const selection = selectionOf(target?.request);
    if (!selection) return;
    await o.savePhrase({
      key: fix.key,
      display: selection.sentence.slice(fix.start, fix.end),
    });
  }

  /**
   * Asks the model (or the cache) and shows the reading, then the answer. While the
   * model itself starts for longer than `STARTING_NOTICE_MS`, the reading says so.
   */
  function start() {
    const request = target?.request;
    if (!request || !runner) return;
    const isLatest = ticket.next();
    let notice: ReturnType<typeof setTimeout> | undefined;
    let noticed = false;
    const onStarting = (starting: boolean) => {
      clearTimeout(notice);
      if (starting) {
        notice = setTimeout(() => {
          if (!isLatest()) return;
          noticed = true;
          show({ state: "starting" });
        }, STARTING_NOTICE_MS);
      } else if (noticed && isLatest()) {
        noticed = false;
        show({ state: "reading" });
      }
    };
    show({ state: "reading" });
    runner
      .explain(request, onStarting)
      .then(
        ({ answer }) => {
          if (isLatest()) return showAnswer(answer, isLatest);
        },
        (error: unknown) => {
          if (isAbortError(error) || !isLatest()) return;
          warn(error);
          show({ state: "error" });
        },
      )
      .finally(() => clearTimeout(notice));
  }

  return {
    /** The window opened on a term (`next`), or on one the AI cannot explain (undefined). */
    async open(next: ExplainTarget | undefined) {
      runner?.cancel();
      const isLatest = ticket.next();
      target = next;
      proposal = undefined;
      show(null);
      if (!next || !runner || !provider) return;
      const { request } = next;
      const can = await availability(request);
      if (!isLatest() || can === "unavailable") return;
      const kept = await runner.kept(request);
      if (!isLatest()) return;
      if (kept) {
        await showAnswer(kept.answer, isLatest);
        return;
      }
      if (can !== "ready") show({ state: "download" });
      else if (next.noEntry && o.settings().explainUnknown) start();
      else show({ state: "idle" });
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
      show({ state: "downloading", loaded: 0 });
      provider
        .download(pairOf(request), (loaded) => {
          if (isLatest()) show({ state: "downloading", loaded });
        })
        .then(
          () => {
            if (isLatest()) start();
          },
          (error: unknown) => {
            if (!isLatest()) return;
            warn(error);
            show({ state: "error" });
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
      if (can === "unavailable") show(null);
      else if (can !== "ready") show({ state: "download" });
      else start();
    },
    /** The pencil or "Edit phrase": the field starts with the proposal, else the selection. */
    editPhrase() {
      const selection = selectionOf(target?.request);
      if (!selection) return;
      showPhrase({
        state: "editing",
        text:
          proposal?.key ??
          selection.sentence.slice(selection.start, selection.end),
      });
    },
    /** "Cancel": the proposal again, or "Edit phrase". */
    cancelPhrase() {
      showPhrase(
        proposal ? { state: "proposal", key: proposal.key } : { state: "none" },
      );
    },
    /**
     * "Save phrase": the proposal (no `text`), or the phrase typed once it checks out;
     * otherwise the edit says why it cannot be saved.
     */
    async savePhrase(text?: string) {
      if (text === undefined) {
        if (proposal) await save(proposal);
        return;
      }
      const isLatest = ticket.next();
      showPhrase({ state: "editing", text, busy: true });
      const checked = await check(text, false);
      if (!isLatest()) return;
      if (checked && "key" in checked) {
        await save(checked);
        return;
      }
      showPhrase({
        state: "editing",
        text,
        ...(checked && {
          problem: {
            text,
            why: checked.why === "words" ? "words" : "sentence",
          },
        }),
      });
    },
    /** The window closed: what runs stops. */
    close() {
      runner?.cancel();
      ticket.drop();
      target = undefined;
      proposal = undefined;
      show(null);
    },
  };
}
