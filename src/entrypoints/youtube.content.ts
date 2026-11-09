import { watchSettings } from "../background/settings-store";
import { startVideo } from "../content/video/session";
import { createYouTubeAdapter } from "../content/video/youtube";
import { send } from "../messaging/client";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  async main(ctx) {
    const adapter = createYouTubeAdapter();
    const session = await startVideo({ send, adapter, watchSettings }).catch(
      (error: unknown) => {
        console.warn("Lingo:", error);
        return undefined;
      },
    );
    if (!session) {
      adapter.dispose();
      return;
    }
    const { store } = session.app;
    let reported: string | null = null;
    const unsubscribe = store.subscribe(() => {
      const { status, videoId, cues, translationSource, translations } =
        store.get();
      if (status !== "ready" || videoId === reported) return;
      reported = videoId;
      const translated = translations.filter((t) => t !== "").length;
      console.debug(
        `Lingo: ${videoId}: ${cues.length} lines, translation ${translationSource} on ${translated}`,
      );
    });
    ctx.onInvalidated(() => {
      unsubscribe();
      session.stop();
      adapter.dispose();
    });
  },
});
