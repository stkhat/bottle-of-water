import { render } from "preact";
import { startContentErrorLog } from "../../check/start";
import { ArticleUi } from "../../content/article/ArticleUi";
import { runArticle } from "../../content/article/article";
import { leaveWhenOrphaned } from "../../content/orphan";
import { shadowRootMode } from "../../content/shadow-host";
import { isVideoSite } from "../../content/video/platform";
import { answerPageRequests, contentDeps } from "../../content/wiring";
import { guardShadowRoot } from "../../ui/from-user";

export default defineContentScript({
  matches: ["<all_urls>"],
  // The UI is styled inline and imports no CSS: nothing to load into its shadow root
  // ("ui" would fetch a content.css that is never built) or into the page.
  cssInjectionMode: "manual",
  async main(ctx) {
    // The video UI runs there and answers the popup.
    if (isVideoSite(location.hostname)) return;
    // `npm run build:check` only (src/check/error-log.ts).
    if (import.meta.env.MODE === "check") startContentErrorLog("article");
    const runner = runArticle({
      ...contentDeps(ctx),
      async mountUi(app) {
        const ui = await createShadowRootUi(ctx, {
          name: "lingo-article",
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
    answerPageRequests(ctx, runner.handlePageRequest);
  },
});
