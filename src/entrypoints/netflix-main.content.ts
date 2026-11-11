import { installNetflixHooks } from "../content/video/netflix/page";

/** netflix.com's own world: reads subtitle tracks from the player's manifests. */
export default defineContentScript({
  matches: ["*://www.netflix.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    installNetflixHooks();
  },
});
