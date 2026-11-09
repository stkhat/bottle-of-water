import { render } from "preact";
import { matchesLearningLanguage } from "../../content/page-language";
import { PageCard } from "../../content/ui/PageCard";
import { send } from "../../messaging/client";

/** The most page text sent for analysis (characters). */
const MAX_TEXT = 50_000;

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    if (!matchesLearningLanguage(document.documentElement.lang, "en")) return;

    // Read before the card mounts so its own text is not part of the page's.
    const text = document.body.innerText.slice(0, MAX_TEXT);

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

    // The article UI comes in M5. Until then the host carries the number of unsaved
    // words (invisible to users), which the E2E smoke test reads.
    send({ type: "analyze", lang: "en", blocks: [text] })
      .then(({ unsaved }) => {
        ui.shadowHost.dataset.lingoUnsaved = String(unsaved.length);
      })
      .catch((error: unknown) => console.warn("Lingo:", error));
  },
});
