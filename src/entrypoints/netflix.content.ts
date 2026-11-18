import { startContentCheck } from "../check/start";
import { createNetflixAdapter } from "../content/video/netflix/adapter";
import { runVideoSite } from "../content/video/run";

export default defineContentScript({
  matches: ["*://www.netflix.com/*"],
  // Early, to hear about the first manifest the player parses.
  runAt: "document_start",
  main(ctx) {
    // `npm run build:check` only: the error log and the settings channel (src/check/).
    if (import.meta.env.MODE === "check") startContentCheck("netflix");
    return runVideoSite(ctx, createNetflixAdapter());
  },
});
