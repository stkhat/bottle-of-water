/**
 * Presses that must not close the dictionary window: on the window itself, on the hover
 * card, and on words (their click opens or switches the word). Lingo's parts sit in
 * separate, closed shadow roots, so a listener on the page cannot tell where a press
 * landed; each part marks its own presses instead.
 */
const kept = new WeakSet<Event>();

/** Marks a press that keeps the dictionary window open. */
export function keepOpen(event: Event): void {
  kept.add(event);
}

export function keptOpen(event: Event): boolean {
  return kept.has(event);
}
