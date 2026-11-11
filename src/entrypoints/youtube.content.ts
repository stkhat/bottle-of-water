import { runVideoSite } from "../content/video/run";
import type { VideoSession } from "../content/video/session";
import { createYouTubeAdapter } from "../content/video/youtube";
import { runYouTubeComments } from "../content/video/youtube-comments";

const warn = (error: unknown) => console.warn("Lingo:", error);

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  async main(ctx) {
    const adapter = createYouTubeAdapter();
    const parts: { video?: VideoSession } = {};
    // One dictionary at a time, and a term saved in one part shows in the other.
    const comments = runYouTubeComments(ctx, adapter, {
      onPanelOpen: () => parts.video?.app.closePanel(),
      onTermsChanged: () => void parts.video?.reanalyze().catch(warn),
    });
    parts.video = await runVideoSite(ctx, adapter, {
      onPanelOpen: () => comments.closePanel(),
      onTermsChanged: () => void comments.reanalyze().catch(warn),
    });
  },
});
