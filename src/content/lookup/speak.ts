import { speechLang } from "../../core/languages";

/** Says `text` aloud in `lang`, cutting off whatever was being said. */
export function speak(text: string, lang: string) {
  if (typeof speechSynthesis === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLang(lang);
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}
