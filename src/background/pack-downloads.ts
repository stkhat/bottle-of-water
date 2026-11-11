import { browser } from "wxt/browser";
import { packsFor, translationPair } from "../core/packs/pairs";
import { promiseCache } from "../core/util";
import type { Settings } from "../core/settings";
import type { EnsureResult, PackStore } from "./pack-store";
import { watchSettings } from "../messaging/storage";

/** The alarm that tries the chosen pair's downloads again after a failure. */
export const PACKS_RETRY_ALARM = "lingo-packs-retry";
/** `storage.local`: how many tries in a row have failed. */
export const PACKS_RETRY_FAILURES_KEY = "packRetryFailures";

/** The error a pack's state shows while a scheduled retry waits for its download. */
const RETRY_PENDING = "Retry pending";

/** Minutes to wait after the first, second and third failure in a row. */
const RETRY_DELAYS_MINUTES = [1, 5, 30];
/** Minutes to wait after any later failure. */
const LAST_RETRY_DELAY_MINUTES = 6 * 60;

/** Minutes to wait before the next try after `failures` failed tries in a row (≥ 1). */
export function retryDelayMinutes(failures: number): number {
  return RETRY_DELAYS_MINUTES[failures - 1] ?? LAST_RETRY_DELAY_MINUTES;
}

export interface PackDownloads {
  /**
   * Brings the chosen pair's packs (`packsFor`) to their lock version. When one fails,
   * the retry alarm is set for later (timers die with the service worker; alarms do
   * not); when none does, a scheduled retry is cleared. Overlapping calls for the same
   * pair share one run.
   */
  ensurePair(): Promise<EnsureResult>;
  /**
   * Shows the chosen pair's packs that are not at their lock version as failed
   * (`RETRY_PENDING`) while a scheduled retry waits, instead of what a stopped
   * download left in `packState`.
   */
  retryPending(): Promise<void>;
}

export interface PackDownloadsDeps {
  store: Pick<PackStore, "ensure" | "markFailed">;
  getSettings(): Promise<Pick<Settings, "learningLang" | "nativeLang">>;
}

async function storedFailures(): Promise<number | undefined> {
  const stored = await browser.storage.local.get(PACKS_RETRY_FAILURES_KEY);
  const value: unknown = stored[PACKS_RETRY_FAILURES_KEY];
  return typeof value === "number" ? value : undefined;
}

async function scheduleRetry() {
  const failures = ((await storedFailures()) ?? 0) + 1;
  await browser.storage.local.set({ [PACKS_RETRY_FAILURES_KEY]: failures });
  await browser.alarms.create(PACKS_RETRY_ALARM, {
    delayInMinutes: retryDelayMinutes(failures),
  });
}

/** Clears a scheduled retry; writes nothing when none was (the usual case). */
async function clearRetry() {
  if ((await storedFailures()) === undefined) return;
  await browser.alarms.clear(PACKS_RETRY_ALARM);
  await browser.storage.local.remove(PACKS_RETRY_FAILURES_KEY);
}

export function createPackDownloads({
  store,
  getSettings,
}: PackDownloadsDeps): PackDownloads {
  const runs = promiseCache<EnsureResult>({ keep: false });

  async function run(learning: string, native: string) {
    const result = await store.ensure(packsFor(learning, native));
    try {
      if (result.failed.length > 0) await scheduleRetry();
      else await clearRetry();
    } catch (error) {
      console.error("Lingo: could not schedule the language data retry", error);
    }
    return result;
  }

  return {
    async ensurePair() {
      const { learningLang, nativeLang } = await getSettings();
      return runs.get(translationPair(learningLang, nativeLang), () =>
        run(learningLang, nativeLang),
      );
    },

    async retryPending() {
      const { learningLang, nativeLang } = await getSettings();
      await store.markFailed(packsFor(learningLang, nativeLang), RETRY_PENDING);
    },
  };
}

/**
 * Whether a retry is scheduled after failures in a row (the retry alarm is set and
 * the count of failures is above 0): the alarm will try again.
 */
async function retryScheduled(): Promise<boolean> {
  const [alarm, failures] = await Promise.all([
    browser.alarms.get(PACKS_RETRY_ALARM),
    storedFailures(),
  ]);
  return alarm !== undefined && (failures ?? 0) > 0;
}

export interface PackDownloadTriggers {
  /** Starts a run for `retryPacks` now; does not wait for it. */
  retry(): void;
  /** Settles once the start of the worker has run or skipped its own trigger. */
  started: Promise<void>;
}

/**
 * Brings the chosen pair's packs to their lock version when the service worker starts
 * (a download it stopped carries on), unless a retry is scheduled after failures: then
 * the alarm tries again, so that waking the worker does not undo the backoff, and the
 * packs not there yet show as failed meanwhile (`retryPending`). Then on
 * each trigger, at once: the extension was installed or updated (the lock may have
 * changed), the retry alarm fired, the synced settings name another pair (chosen here
 * or on another device), or `retry` (`retryPacks`). Listeners are registered
 * synchronously so an event that wakes the worker is heard.
 */
export function startPackDownloads(
  downloads: PackDownloads,
): PackDownloadTriggers {
  const trigger = () => {
    downloads
      .ensurePair()
      .catch((error: unknown) =>
        console.error("Lingo: could not download the language data", error),
      );
  };
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PACKS_RETRY_ALARM) trigger();
  });
  browser.runtime.onInstalled.addListener(trigger);
  watchSettings((settings, previous) => {
    if (
      settings.learningLang !== previous.learningLang ||
      settings.nativeLang !== previous.nativeLang
    )
      trigger();
  });
  const started = retryScheduled()
    // Not knowing whether a retry is scheduled, try now.
    .catch(() => false)
    .then(async (scheduled) => {
      if (!scheduled) return trigger();
      try {
        await downloads.retryPending();
      } catch (error) {
        console.error("Lingo: could not write the language data state", error);
      }
    });
  return { retry: trigger, started };
}
