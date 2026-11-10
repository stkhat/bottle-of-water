import "@fontsource-variable/inter";
import { render } from "preact";
import { send } from "../../messaging/client";
import { download } from "../../ui/backup/download";
import { WordList, type WordListDeps } from "./WordList";

/** Speech voices by language code. */
const SPEECH_LANG: Readonly<Record<string, string>> = { en: "en-US" };

const deps: WordListDeps = {
  send,
  now: Date.now,
  download,
  speak(text, lang) {
    if (typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG[lang] ?? lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  },
};

document.body.style.margin = "0";
render(<WordList deps={deps} />, document.getElementById("app")!);
