import { startContentErrorLog } from "../check/start";
import { runVideoSite } from "../content/video/run";
import { createYouTubeAdapter } from "../content/video/youtube";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  main(ctx) {
    // `npm run build:check` only (src/check/error-log.ts).
    if (import.meta.env.MODE === "check") startContentErrorLog("youtube");
    return runVideoSite(ctx, createYouTubeAdapter());
  },
});
