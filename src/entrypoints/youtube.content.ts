import { startContentErrorLog } from "../check/start";
import { runVideoSite } from "../content/video/run";
import { createYouTubeAdapter } from "../content/video/youtube/adapter";
import { runYouTubeComments } from "../content/video/youtube/comments";
import { startYouTubeParts } from "../content/video/youtube/parts";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  async main(ctx) {
    // `npm run build:check` only (src/check/error-log.ts).
    if (import.meta.env.MODE === "check") startContentErrorLog("youtube");
    const adapter = createYouTubeAdapter();
    await startYouTubeParts(
      (hooks) => runYouTubeComments(ctx, adapter, hooks),
      (hooks) => runVideoSite(ctx, adapter, hooks),
    );
  },
});
