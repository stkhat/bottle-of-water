import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { watchSettings } from "../../background/settings-store";
import { send } from "../../messaging/client";
import { isPageRequest, unsupportedPage } from "../../messaging/page-protocol";
import { mountVideoUi } from "./mount";
import type { PlatformAdapter } from "./platform";
import { startVideo } from "./session";

/**
 * The content script of a video site: runs the video session through the site's
 * adapter, mounts its UI, and answers the popup about the video. Everything is taken
 * down when the extension's context goes away.
 */
export async function runVideoSite(
  ctx: ContentScriptContext,
  adapter: PlatformAdapter,
): Promise<void> {
  const started = startVideo({ send, adapter, watchSettings }).catch(
    (error: unknown) => {
      console.warn("Lingo:", error);
      return undefined;
    },
  );

  // The popup asks about this video (page-protocol.ts); other messages are not ours.
  const onMessage = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: unknown) => void,
  ) => {
    if (!isPageRequest(message)) return;
    void started
      .then((session) =>
        session
          ? session.handlePageRequest(message)
          : unsupportedPage(location.hostname, "video"),
      )
      .then(sendResponse);
    return true;
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));

  const session = await started;
  if (!session) {
    adapter.dispose();
    return;
  }
  const unmount = mountVideoUi({ adapter, app: session.app });
  ctx.onInvalidated(() => {
    unmount();
    session.stop();
    adapter.dispose();
  });
}
