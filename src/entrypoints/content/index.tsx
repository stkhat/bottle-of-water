import { render } from "preact";
import { browser } from "wxt/browser";
import { watchSettings } from "../../background/settings-store";
import { startArticle } from "../../content/article/article";
import { ArticleUi } from "../../content/ui/ArticleUi";
import { send } from "../../messaging/client";
import { isPageRequest, UNSUPPORTED_PAGE } from "../../messaging/page-protocol";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const started = startArticle({
      send,
      watchSettings,
      detectLanguage: (text) => browser.i18n.detectLanguage(text),
      async mountUi(app) {
        const ui = await createShadowRootUi(ctx, {
          name: "lingo-article",
          position: "inline",
          anchor: "body",
          onMount(container) {
            render(<ArticleUi app={app} />, container);
          },
          onRemove(container) {
            if (container) render(null, container);
          },
        });
        ui.mount();
        return () => ui.remove();
      },
    }).catch((error: unknown) => {
      console.warn("Lingo:", error);
      return undefined;
    });

    // The popup asks about this page (page-protocol.ts); other messages are not ours.
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
    if (session) ctx.onInvalidated(() => session.stop());
  },
});
