import { render } from "preact";
import { browser } from "wxt/browser";
import { watchSettings } from "../../background/settings-store";
import { startArticle } from "../../content/article/article";
import { PageCard } from "../../content/ui/PageCard";
import { send } from "../../messaging/client";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const session = await startArticle({
      send,
      watchSettings,
      detectLanguage: (text) => browser.i18n.detectLanguage(text),
      async mountUi() {
        const ui = await createShadowRootUi(ctx, {
          name: "lingo-page-card",
          position: "inline",
          anchor: "body",
          onMount(container) {
            render(<PageCard />, container);
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
    if (session) ctx.onInvalidated(() => session.stop());
  },
});
