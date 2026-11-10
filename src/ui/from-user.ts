/**
 * True for an event the user caused. A page script can dispatch synthetic events on the
 * page and on Lingo's UI (`isTrusted` is false for them); those must not open a card or
 * the dictionary (which shows sentences kept from other sites) or change a word's status.
 */
export const fromUser = (event: Event): boolean => event.isTrusted;

/** `handler`, run only for events the user caused (`fromUser`). */
export function onlyFromUser<E extends Event>(
  handler: (event: E) => void,
): (event: E) => void {
  return (event) => {
    if (fromUser(event)) handler(event);
  };
}

/** The events Lingo's controls listen to, or could. */
const UI_EVENTS = [
  "click",
  "dblclick",
  "auxclick",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
  "mousedown",
  "mouseup",
  "mouseover",
  "mouseout",
  "keydown",
  "keyup",
  "input",
  "change",
  "submit",
  "wheel",
  "contextmenu",
] as const;

/** Events whose default action (following a link, submitting, a key's) is canceled too. */
const CANCELED = new Set<string>(["click", "submit", "keydown"]);

/**
 * Stops every event a page script dispatches inside `root` (one of Lingo's shadow roots
 * on a web page) as it enters the root, so none reaches Lingo's handlers: they listen on
 * the elements inside, after the root's capture listeners. The user's events go through.
 * Handlers that open the dictionary or change a word still check `fromUser` themselves.
 */
export function guardShadowRoot(root: ShadowRoot): void {
  for (const type of UI_EVENTS) {
    const cancel = CANCELED.has(type);
    root.addEventListener(
      type,
      (event) => {
        if (fromUser(event)) return;
        event.stopImmediatePropagation();
        if (cancel) event.preventDefault();
      },
      { capture: true, passive: !cancel },
    );
  }
}
