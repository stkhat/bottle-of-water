import "@fontsource-variable/inter";
import { render } from "preact";
import { speechLang } from "../../core/languages";
import { send } from "../../messaging/client";
import { download } from "../../ui/backup/download";
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

document.body.style.margin = "0";
render(<WordList deps={deps} />, document.getElementById("app")!);
