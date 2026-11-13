import type { Category, Span, TermKind, TermStatus } from "../../core/classify";
import type { Written } from "../../core/lexicon/dictionary";
import type { PackStates } from "../../core/packs/state";
import type { DocumentCasing } from "../../core/text/casing";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import type { Settings } from "../../core/settings";
import type { send } from "../../messaging/client";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import { createPackWait } from "../../messaging/pack-wait";
import type { AnalyzeResult, SourceInput } from "../../messaging/protocol";
import { dictionaryLinks } from "../../ui/lookup/externalDictionaries";
import type { Store } from "../store";
import { createTranslationQueue } from "../translate/queue";
import {
  createBuiltInTranslator,
  type TranslationProvider,
} from "../translate/translator";
import { describeTerm, translateSenses, type TermCard } from "./describe";
import { speak } from "./speak";
import { warn } from "./warn";

/** What the article and video UIs need from the extension, passed in so they run in tests. */
export interface LookupDeps {
  send: typeof send;
  /** Calls `listener` with the new settings (and the ones before) after every change; returns an unsubscribe. */
  watchSettings(
    listener: (settings: Settings, previous: Settings) => void,
  ): () => void;
  /** Calls `listener` with the pack states now and after every change; returns an unsubscribe. */
  watchPackState(listener: (states: PackStates) => void): () => void;
  /** Default: the browser's built-in translator. */
  createTranslator?(from: string, to: string): TranslationProvider;
  /** This part's dictionary opened: another part's on the same page closes. */
  onPanelOpen?(): void;
  /** A term was saved, changed or removed here: other parts of the page follow. */
  onTermsChanged?(): void;
}

/** How the parts of one page (YouTube's video and comments) work together. */
export type LookupHooks = Pick<LookupDeps, "onPanelOpen" | "onTermsChanged">;

export interface Term {
  key: string;
  kind: TermKind;
}

export const sameTerm = (a: Term, b: Term) =>
  a.key === b.key && a.kind === b.kind;

/** A term as the page shows it. */
interface ShownTerm extends Term {
  /** As written: the whole phrase for a part of a phrase with a gap. */
  surface: string;
  category?: Category;
  /** How the word was written, when the page says (`Lookup.written`). */
  written?: Written;
  /** The part of speech its tag gives it there (`Span.pos`). */
  pos?: string;
}

/** The popup's requests about a page (see `page-protocol.ts`), as the page answers them. */
export interface PageAnswers {
  saveAll(status: TermStatus): Promise<unknown>;
  undoSaveAll(): Promise<unknown>;
  summary(): PageSummary;
}

/** Drops answers that come after a newer request, or after the request was dropped. */
export function latest() {
  let ticket = 0;
  const check = (mine: number) => () => mine === ticket;
  return {
    /** Starts a request; true while it is the latest. */
    next: () => check(++ticket),
    /** True while no request starts and nothing is dropped. */
    current: () => check(ticket),
    drop() {
      ticket++;
    },
  };
}

export type Lookup = ReturnType<typeof createLookup>;

/**
 * What the article and video sessions share: one translator queue (subtitles, hover
 * cards and windows in that order), the term lookups, the dictionary panel, the
 * analysis that waits for language data not on the device (`packsReady` runs once it
 * is there), and one change to saved terms at a time.
 */
export function createLookup(
  deps: LookupDeps,
  page: {
    settings(): Settings;
    lang(): string;
    /** The page or video: its occurrences are told apart from the others. */
    url(): string;
    packsReady(): void;
  },
) {
  const translator = createTranslationQueue(
    deps.createTranslator ?? createBuiltInTranslator,
  );
  let queue: Promise<unknown> = Promise.resolve();
  let warmed = false;
  /** The document's casing (rule D), which every analysis sends. */
  let casing: DocumentCasing | undefined;
  /** An analysis found language data missing: none is asked for until it is there. */
  let waits = false;
  const packs = createPackWait(deps.watchPackState, () => {
    waits = false;
    page.packsReady();
  });

  const translation = () => ({
    send: deps.send,
    lang: page.lang(),
    nativeLang: page.settings().nativeLang,
    translator,
  });

  function run(task: () => Promise<unknown>) {
    queue = queue.then(task).catch(warn);
  }

  return {
    translator,
    get waiting() {
      return waits;
    },
    /** Runs `task` after every change to saved terms asked before it. */
    run,
    /** Resolves after everything run so far. */
    idle: () => queue,
    /** Answers the popup after everything asked before has been done. */
    answer(request: PageRequest, answers: PageAnswers): Promise<PageSummary> {
      if (request.type === "pageSaveAll")
        run(() => answers.saveAll(request.status));
      else if (request.type === "pageUndo") run(answers.undoSaveAll);
      return queue.then(answers.summary);
    },
    describe: (term: ShownTerm, shownIn: "hover" | "window" = "hover") =>
      describeTerm(term, { ...translation(), sourceUrl: page.url(), shownIn }),
    /** The casing of the document the page analyzes now (a video's captions, the article). */
    get casing() {
      return casing;
    },
    setCasing(next: DocumentCasing | undefined) {
      casing = next;
    },
    /**
     * How a word span was written, as its lookup says it (`Written`): capitalised in a
     * way that counts (`Span.capital`), as an acronym when that is in capitals only,
     * or in lower case in a mixed-case document; else not said (a caseless document, a
     * capital at a sentence start, a phrase).
     */
    written(span: Span, surface: string): Written | undefined {
      if (span.kind !== "word") return undefined;
      if (span.capital) return /\p{Ll}/u.test(surface) ? "capital" : "upper";
      return casing?.mode === "mixed" && /^\p{Ll}/u.test(surface)
        ? "lower"
        : undefined;
    },
    dictionaries(head: string) {
      const settings = page.settings();
      return dictionaryLinks(head, settings.dictionaries, {
        from: page.lang(),
        to: settings.nativeLang,
      });
    },
    /**
     * Shows the panel, then its card's English definitions translated as they come
     * (the click that opened it lets the translator download its model the first time).
     */
    showPanel<P extends { card: TermCard }>(
      store: Store<{ panel: P | null }>,
      panel: P,
    ) {
      store.set({ panel });
      const { card } = panel;
      void translateSenses(card, translation())
        .then((translated) => {
          const shown = store.get().panel;
          if (translated !== card && shown?.card === card)
            store.set({ panel: { ...shown, card: translated } });
        })
        .catch(warn);
    },
    speak(head: string | undefined) {
      if (head) speak(head, page.lang());
    },
    /**
     * Classifies `texts` (one request); undefined while language data is missing, and
     * once the request finds it missing.
     */
    async analyze(texts: string[]): Promise<AnalyzeResult | undefined> {
      if (waits) return undefined;
      const lang = page.lang();
      let result: AnalyzeResult;
      try {
        result = await deps.send({
          type: "analyze",
          lang,
          blocks: texts,
          ...(casing && { casing }),
        });
      } catch (error) {
        if (!(error instanceof PacksUnavailableError)) throw error;
        waits = true;
        packs.add(error.packs);
        return undefined;
      }
      if (!warmed) {
        // Load the dictionary now so the first lookup does not wait for it.
        warmed = true;
        deps.send({ type: "warmDictionary", lang }).catch(warn);
      }
      return result;
    },
    /** Another request found these packs missing: `packsReady` runs once they are there. */
    waitFor: (missing: readonly string[]) => packs.add(missing),
    stop: () => packs.stop(),
  };
}

/**
 * The popup's "Mark all as Learning / Known" and its Undo, over the page's unsaved new
 * words. `marked` makes the page show the words' new category.
 */
export function createMarkAll(o: {
  send: typeof send;
  lang(): string;
  source(): SourceInput;
  unsaved(): string[];
  marked(
    keys: ReadonlySet<string>,
    from: TermStatus | "new",
    to: TermStatus | "new",
  ): Promise<void>;
}) {
  let last:
    | {
        batchId: string;
        keys: ReadonlySet<string>;
        status: TermStatus;
        count: number;
      }
    | undefined;

  /** Saves every unsaved new word as one batch; `undoable` keeps it for Undo. */
  async function save(status: TermStatus, undoable: boolean) {
    const keys = o.unsaved();
    if (keys.length === 0) return;
    const { batchId, count } = await o.send({
      type: "saveAll",
      lang: o.lang(),
      keys,
      status,
      source: o.source(),
    });
    const saved = new Set(keys);
    await o.marked(saved, "new", status);
    if (undoable) last = { batchId, keys: saved, status, count };
  }

  return {
    /** Settings `unsavedAtEnd`: the end of the article or video was reached. */
    markKnown: () => save("known", false),
    saveAll: (status: TermStatus) => save(status, true),
    async undoSaveAll() {
      const batch = last;
      if (!batch) return;
      await o.send({ type: "undoSaveAll", batchId: batch.batchId });
      last = undefined;
      // Those words were new before; the ones changed since stay as they are.
      await o.marked(batch.keys, batch.status, "new");
    },
    /** The last save-all until it is undone. */
    done: (): PageSummary["done"] =>
      last ? { count: last.count, target: last.status } : null,
  };
}
