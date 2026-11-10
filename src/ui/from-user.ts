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
