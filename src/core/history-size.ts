/**
 * How the sentence history counts its size, and which pages go when it is over its cap.
 * Shared by the device's history store and the cloud merge, so both drop the same pages.
 */

/** The sentence history's cap: over it, the oldest pages go until it is under `EVICT_TO` of it. */
export const HISTORY_CAP_BYTES = 50 * 1024 * 1024;

/** The share of the cap the history is brought under once it goes over it (45 MB of 50). */
const EVICT_TO = 0.9;

/** Counted per record on top of its strings. */
const RECORD_OVERHEAD = 64;

/** UTF-16, two bytes per code unit. */
const utf16 = (...texts: readonly string[]) =>
  texts.reduce((sum, text) => sum + 2 * text.length, 0);

/** The counted size of a page record without its sentences. */
export const pageSize = (page: { url: string; title: string }) =>
  utf16(page.url, page.title) + RECORD_OVERHEAD;

/** The counted size of a sentence record. */
export const sentenceSize = (sentence: {
  text: string;
  translation?: string;
  keys: readonly string[];
}) =>
  utf16(sentence.text, sentence.translation ?? "", ...sentence.keys) +
  RECORD_OVERHEAD;

/**
 * The pages that go when `total` is over `capBytes`: from the oldest (in the order
 * given) until the rest is under 90 % of it, never `keepId`. None while under the cap.
 */
export function pagesToEvict<T extends { id: string; bytes: number }>(
  oldestFirst: readonly T[],
  total: number,
  capBytes: number,
  keepId?: string,
): T[] {
  if (total <= capBytes) return [];
  const victims: T[] = [];
  let left = total;
  for (const page of oldestFirst) {
    if (left <= capBytes * EVICT_TO) break;
    if (page.id === keepId) continue;
    victims.push(page);
    left -= page.bytes;
  }
  return victims;
}
