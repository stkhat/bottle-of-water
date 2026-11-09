import { createYouTubeAdapter } from "../content/video/youtube";
import { send } from "../messaging/client";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  main(ctx) {
    const adapter = createYouTubeAdapter();
    let controller: AbortController | undefined;

    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const settings = await send({ type: "getSettings" });
      if (!settings.sites.youtube || !adapter.videoId()) return;
      const captions = await adapter.loadCaptions({
        learningLang: settings.learningLang,
        nativeLang: settings.nativeLang,
        translatorAvailable: false,
        signal: current.signal,
      });
      if (!captions) return;
      const { track, cues, translation } = captions;
      console.debug(
        `Lingo: ${adapter.videoId()} ${track.id} ${cues.length} cues; translation ${translation.source} ${translation.cues.length} cues`,
      );
    }
    const run = () =>
      load().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          console.warn("Lingo:", error);
      });

    const offNavigate = adapter.onNavigate(run);
    void run();
    ctx.onInvalidated(() => {
      offNavigate();
      controller?.abort();
      adapter.dispose();
    });
  },
});
