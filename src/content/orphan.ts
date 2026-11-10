import type { send } from "../messaging/client";

/**
 * The parts of WXT's `ContentScriptContext` used here. `isInvalid` also notices that
 * the extension is gone (`runtime.id` is unset) and then runs the context's
 * `onInvalidated` callbacks, which take the UI down.
 */
export interface ScriptContext {
  readonly isInvalid: boolean;
  block<T>(): Promise<T>;
}

/**
 * `send()` for a content script that can outlive its extension. When the extension is
 * reloaded or updated (in development, `npm run build:check` reloads it), the content
 * scripts already on pages stay, cut off: every call fails with "Extension context
 * invalidated". Once that is so, the context is invalidated (taking Lingo off the page)
 * and the request never settles, so nothing reports a failure nobody can act on.
 */
export function sendWhileConnected(
  ctx: ScriptContext,
  sendRequest: typeof send,
): typeof send {
  return (request) => {
    if (ctx.isInvalid) return ctx.block();
    return sendRequest(request).catch((error: unknown) => {
      if (ctx.isInvalid) return ctx.block();
      throw error;
    });
  };
}

/**
 * Looks every `intervalMs` whether the extension is still there, so a content script
 * cut off by a reload takes its UI down on its own, before anything is clicked.
 */
export function leaveWhenOrphaned(
  ctx: { setInterval(handler: () => void, timeout?: number): unknown },
  intervalMs = 1000,
): void {
  // WXT checks the context before each call; that check invalidates it.
  ctx.setInterval(() => undefined, intervalMs);
}
