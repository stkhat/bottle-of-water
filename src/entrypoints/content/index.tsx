import { render } from "preact";
import { matchesLearningLanguage } from "../../content/page-language";
import { PageCard } from "../../content/ui/PageCard";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    if (!matchesLearningLanguage(document.documentElement.lang, "en")) return;

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
  },
});
