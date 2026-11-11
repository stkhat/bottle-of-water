import "@fontsource-variable/inter";
import { render } from "preact";
import { startPageErrorLog } from "../../check/start";
import { speak } from "../../content/lookup/speak";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { download } from "../../ui/backup/download";
import { followTheme } from "../../ui/page-theme";
import { WordList, type WordListDeps } from "./WordList";

// `npm run build:check` only (src/check/error-log.ts).
if (import.meta.env.MODE === "check") startPageErrorLog();

const deps: WordListDeps = {
  send,
  now: Date.now,
  download,
  watchPackState,
  speak,
};

followTheme({ send, watchSettings });
document.body.style.margin = "0";
render(<WordList deps={deps} />, document.getElementById("app")!);
