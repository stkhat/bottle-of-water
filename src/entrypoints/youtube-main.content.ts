import { installYouTubeHooks } from "../content/video/youtube-page";

/** youtube.com's own world: watches the player's caption requests (see youtube-page.ts). */
export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    installYouTubeHooks();
  },
});
