import { render } from "preact";
import { browser } from "wxt/browser";
import { watchSettings } from "../../background/settings-store";
import { runArticle } from "../../content/article/article";
import { isVideoSite } from "../../content/article/should-run";
import { leaveWhenOrphaned, sendWhileConnected } from "../../content/orphan";
import { ArticleUi } from "../../content/ui/ArticleUi";
import { shadowRootMode } from "../../content/ui/shadow-mode";
import { send } from "../../messaging/client";
import { watchPackState } from "../../messaging/pack-state";
import { guardShadowRoot } from "../../ui/from-user";
import { isPageRequest } from "../../messaging/page-protocol";

export default defineContentScript({
  matches: ["<all_urls>"],
  // The UI is styled inline and imports no CSS: nothing to load into its shadow root
  // ("ui" would fetch a content.css that is never built) or into the page.
  cssInjectionMode: "manual",
  async main(ctx) {
    // The video UI runs there and answers the popup.
    if (isVideoSite(location.hostname)) return;
    const runner = runArticle({
      send: sendWhileConnected(ctx, send),
      watchSettings,
      watchPackState,
      detectLanguage: (text) => browser.i18n.detectLanguage(text),
      async mountUi(app) {
        const ui = await createShadowRootUi(ctx, {
          name: "lingo-article",
          // Closed in production: page scripts cannot reach the UI.
          mode: shadowRootMode(),
          position: "inline",
          anchor: "body",
          onMount(container, shadow) {
            guardShadowRoot(shadow);
            render(<ArticleUi app={app} />, container);
          },
          onRemove(container) {
            if (container) render(null, container);
          },
        });
        ui.mount();
        return () => ui.remove();
      },
    });
    ctx.onInvalidated(() => runner.stop());
    leaveWhenOrphaned(ctx);

    // The popup asks about this page (page-protocol.ts); other messages are not ours.
    const onMessage = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => {
      if (!isPageRequest(message)) return;
      void runner.handlePageRequest(message).then(sendResponse);
      return true;
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() =>
      browser.runtime.onMessage.removeListener(onMessage),
    );
  },
});
