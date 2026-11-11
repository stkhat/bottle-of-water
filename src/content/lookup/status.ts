import type { send as sendFn } from "../../messaging/client";
import type { SaveTermInput } from "../../messaging/protocol";
import type { WordStatus } from "../../ui/lookup/HoverCard";

/**
 * Sends a term's new status: "new" removes it, a term not saved yet is saved (`save`
 * gives the request, or undefined when it cannot be made), a saved one changes. False
 * when nothing was sent.
 */
export async function sendStatus(
  send: typeof sendFn,
  term: { termId: string; status: WordStatus },
  to: WordStatus,
  save: () => Omit<SaveTermInput, "status"> | undefined,
): Promise<boolean> {
  if (term.status === to) return false;
  if (to === "new") {
    await send({ type: "removeTerm", id: term.termId });
  } else if (term.status === "new") {
    const request = save();
    if (!request) return false;
    await send({ type: "saveTerm", ...request, status: to });
  } else {
    await send({ type: "setStatus", id: term.termId, status: to });
  }
  return true;
}
