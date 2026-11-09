import { createNetflixAdapter } from "../content/video/netflix";
import { runVideoSite } from "../content/video/run";

export default defineContentScript({
  matches: ["*://www.netflix.com/*"],
  // Early, to hear about the first manifest the player parses.
  runAt: "document_start",
  main(ctx) {
    return runVideoSite(ctx, createNetflixAdapter());
  },
});
