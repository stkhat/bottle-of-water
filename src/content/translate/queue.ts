import type { TranslationProvider } from "./translator";

/**
 * Who waits for a translation, the most urgent first (architecture.md: "Definitions translated at display time"): the
 * playing subtitle line, the dictionary window, the hover card.
 */
export type TranslationPriority = "subtitle" | "window" | "hover";

const RANK: Readonly<Record<TranslationPriority, number>> = {
  subtitle: 0,
  window: 1,
  hover: 2,
};

export interface TranslationPair {
  from: string;
  to: string;
}

/** The content script's one way to the browser's translator. */
export interface TranslationQueue {
  /** `text` translated; undefined when no translation is available (now). */
  translate(
    text: string,
    priority: TranslationPriority,
    pair: TranslationPair,
  ): Promise<string | undefined>;
}

/** How many translations the queue keeps for texts asked for again. */
const KEPT = 500;

interface Job {
  key: string;
  pair: TranslationPair;
  text: string;
  rank: number;
  /** Arrival order: first come, first served within a priority. */
  order: number;
  result: Promise<string | undefined>;
  resolve(translated: string | undefined): void;
}

/**
 * One queue per content script over the browser's translator (one translator per
 * language pair, created by `translatorFor` on first use): one translation at a time,
 * the highest priority first and in arrival order within a priority. A request waits
 * for its pair's translator to open (its model may be downloading) outside the queue,
 * so other pairs go on translating meanwhile; once it is ready, the request joins the
 * queue, and when it cannot open, the request gets no translation. Requests for a
 * text that is waiting or being translated share its translation; the latest
 * translations are kept, so a text asked for again is not translated again. A text
 * that got no translation (the model not there yet) is asked for again next time.
 */
export function createTranslationQueue(
  translatorFor: (from: string, to: string) => TranslationProvider,
): TranslationQueue {
  const translators = new Map<string, TranslationProvider>();
  const kept = new Map<string, string>();
  /** Jobs waiting or being translated, by key. */
  const jobs = new Map<string, Job>();
  const waiting: Job[] = [];
  let order = 0;
  let running = false;

  const pairKey = ({ from, to }: TranslationPair) => `${from}>${to}`;

  function translator(pair: TranslationPair) {
    const key = pairKey(pair);
    let found = translators.get(key);
    if (!found) {
      found = translatorFor(pair.from, pair.to);
      translators.set(key, found);
    }
    return found;
  }

  function keep(key: string, translated: string) {
    kept.delete(key);
    kept.set(key, translated);
    if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
  }

  /** The waiting job to translate next. */
  function next(): Job | undefined {
    let best = 0;
    for (let i = 1; i < waiting.length; i++) {
      const job = waiting[i]!;
      const current = waiting[best]!;
      if (
        job.rank < current.rank ||
        (job.rank === current.rank && job.order < current.order)
      )
        best = i;
    }
    return waiting.splice(best, 1)[0];
  }

  function finish(job: Job, translated: string | undefined) {
    jobs.delete(job.key);
    if (translated) keep(job.key, translated);
    job.resolve(translated || undefined);
  }

  async function run() {
    if (running) return;
    running = true;
    for (let job = next(); job; job = next()) {
      let translated: string | undefined;
      try {
        translated = await translator(job.pair).translate(job.text);
      } catch {
        translated = undefined;
      }
      finish(job, translated);
    }
    running = false;
  }

  /** Queues `job` once its pair's translator is ready, without holding the queue. */
  async function admit(job: Job) {
    const provider = translator(job.pair);
    let ready: boolean;
    try {
      ready = provider.open ? await provider.open() : true;
    } catch {
      ready = false;
    }
    if (!ready) return finish(job, undefined);
    waiting.push(job);
    // Started after this turn, so requests that became ready together go by priority.
    queueMicrotask(() => void run());
  }

  return {
    translate(text, priority, pair) {
      const key = `${pairKey(pair)}:${text}`;
      const done = kept.get(key);
      if (done !== undefined) {
        keep(key, done);
        return Promise.resolve(done);
      }
      const rank = RANK[priority];
      const shared = jobs.get(key);
      if (shared) {
        shared.rank = Math.min(shared.rank, rank);
        return shared.result;
      }
      let resolve!: Job["resolve"];
      const result = new Promise<string | undefined>((r) => (resolve = r));
      const job: Job = {
        key,
        pair,
        text,
        rank,
        order: order++,
        result,
        resolve,
      };
      jobs.set(key, job);
      void admit(job);
      return result;
    },
  };
}
