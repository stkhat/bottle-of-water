import { startContentErrorLog } from "../check/start";
import { createNetflixAdapter } from "../content/video/netflix/adapter";
import { runVideoSite } from "../content/video/run";

export default defineContentScript({
  matches: ["*://www.netflix.com/*"],
  // Early, to hear about the first manifest the player parses.
  runAt: "document_start",
  main(ctx) {
    // `npm run build:check` only (src/check/error-log.ts).
    if (import.meta.env.MODE === "check") startContentErrorLog("netflix");
    return runVideoSite(ctx, createNetflixAdapter());
  },
});
