import "@fontsource-variable/inter";
import { render } from "preact";
import { watchSettings } from "../../background/settings-store";
import { speechLang } from "../../core/languages";
import { send } from "../../messaging/client";
import { download } from "../../ui/backup/download";
import { followTheme } from "../../ui/page-theme";
import { WordList, type WordListDeps } from "./WordList";

const deps: WordListDeps = {
  send,
  now: Date.now,
  download,
  speak(text, lang) {
    if (typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang(lang);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  },
};

followTheme({ send, watchSettings });
document.body.style.margin = "0";
render(<WordList deps={deps} />, document.getElementById("app")!);
