import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { send } from "../messaging/client";
import {
  isPageRequest,
  type PageRequest,
  type PageSummary,
} from "../messaging/page-protocol";
import { watchPackState, watchSettings } from "../messaging/storage";
import { sendWhileConnected } from "./orphan";

/** The extension as a content script reaches it. */
export function contentDeps(ctx: ContentScriptContext) {
  return {
    send: sendWhileConnected(ctx, send),
    watchSettings,
    watchPackState,
    detectLanguage: (text: string) => browser.i18n.detectLanguage(text),
  };
}

/** Answers the popup's requests about this page (`page-protocol.ts`); other messages are not ours. */
export function answerPageRequests(
  ctx: ContentScriptContext,
  answer: (request: PageRequest) => Promise<PageSummary>,
) {
  const onMessage = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: unknown) => void,
  ) => {
    if (!isPageRequest(message)) return;
    void answer(message).then(sendResponse);
    return true;
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));
}
