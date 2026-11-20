import { speak } from "../../content/lookup/speak";
import { createBuiltInTranslator } from "../../content/translate/translator";
import { SPONSOR_PAGE_URL } from "../../core/links";
import { SPONSOR_CARD } from "../../core/sponsors";
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
    sponsorCard: SPONSOR_CARD,
    sponsorPage: SPONSOR_PAGE_URL,
  };
  return { theme: { send, watchSettings }, app: <WordList deps={deps} /> };
});
