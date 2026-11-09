import { browser } from "wxt/browser";
import { watchSettings } from "../background/settings-store";
import { mountVideoUi } from "../content/video/mount";
import { startVideo } from "../content/video/session";
import { createYouTubeAdapter } from "../content/video/youtube";
import { send } from "../messaging/client";
import { isPageRequest, UNSUPPORTED_PAGE } from "../messaging/page-protocol";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  async main(ctx) {
    const adapter = createYouTubeAdapter();
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
          session ? session.handlePageRequest(message) : UNSUPPORTED_PAGE,
        )
        .then(sendResponse);
      return true;
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() =>
      browser.runtime.onMessage.removeListener(onMessage),
    );

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
  },
});
