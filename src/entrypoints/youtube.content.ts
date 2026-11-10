import { runVideoSite } from "../content/video/run";
import { createYouTubeAdapter } from "../content/video/youtube";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  main(ctx) {
    return runVideoSite(ctx, createYouTubeAdapter());
  },
});
