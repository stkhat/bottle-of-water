import { speak } from "../../content/lookup/speak";
import { createBuiltInTranslator } from "../../content/translate/translator";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { download } from "../../ui/backup/download";
import { mountPage } from "../../ui/mount-page";
import { WordList, type WordListDeps } from "./WordList";

mountPage(() => {
  const deps: WordListDeps = {
    send,
    now: Date.now,
    download,
    watchPackState,
    speak,
    createTranslator: createBuiltInTranslator,
  };
  return { theme: { send, watchSettings }, app: <WordList deps={deps} /> };
});
