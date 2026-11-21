import { useEffect, useRef, useState } from "preact/hooks";
import { warn } from "../../content/lookup/warn";
import { createTranslationQueue } from "../../content/translate/queue";
import {
  createListMeanings,
  withTranslation,
} from "../../content/words/list-meanings";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import { createPackWait, type PackWait } from "../../messaging/pack-wait";
import type { TermSummary } from "../../messaging/protocol";
import type { WordListDeps } from "./WordList";

/** The first term of each id. */
function indexById(terms: readonly TermSummary[]) {
  const byId = new Map<string, TermSummary>();
  for (const term of terms) if (!byId.has(term.id)) byId.set(term.id, term);
  return byId;
}

/**
 * The word list's data: the language pair, the rows (with their meanings translated
 * as they come into view), and the wait for language data the rows or a lookup need.
 */
export function useWordListData(deps: WordListDeps) {
  const [langs, setLangs] = useState<{ learning: string; native: string }>();
  const [terms, setTerms] = useState<TermSummary[]>();
  /** The rows as last set (state updates come with the next render). */
  const termsNow = useRef<TermSummary[]>(undefined);
  termsNow.current = terms;
  const langsNow = useRef(langs);
  langsNow.current = langs;
  /** The rows of `termsNow` by id, built again when the rows change. */
  const index = useRef<{
    terms?: TermSummary[];
    byId: Map<string, TermSummary>;
  }>({ byId: new Map() });
  /** The row of `id` as last set. */
  function findTerm(id: string) {
    const list = termsNow.current;
    if (!list) return undefined;
    if (index.current.terms !== list)
      index.current = { terms: list, byId: indexById(list) };
    return index.current.byId.get(id);
  }
  /** English meanings translated with the page's translator, as the rows come into view. */
  const meanings = useRef<ReturnType<typeof createListMeanings>>(undefined);
  meanings.current ??= createListMeanings({
    send: deps.send,
    translator: createTranslationQueue(deps.createTranslator),
    lang: () => langsNow.current?.learning ?? "",
    nativeLang: () => langsNow.current?.native ?? "",
    meanings: () =>
      (termsNow.current ?? []).map((term): [string, TermSummary] => [
        term.id,
        term,
      ]),
    meaning: findTerm,
    translated(changes) {
      const list = termsNow.current?.map((term) => {
        const translated = changes.get(term.id);
        return translated === undefined
          ? term
          : withTranslation(term, translated);
      });
      show(list);
    },
  });

  function show(list: TermSummary[] | undefined) {
    termsNow.current = list;
    setTerms(list);
  }
  /** Runs once the language data waited for can be used (set on every render). */
  const onPacksReady = useRef(() => {});
  /** Waits for language data a request did not find on the device. */
  const packs = useRef<PackWait>(undefined);
  packs.current ??= createPackWait(deps.watchPackState, () =>
    onPacksReady.current(),
  );

  /**
   * Reads the rows again. While the language's dictionary is not on the device they
   * come without meanings, and are read again once it is.
   */
  async function reload(lang = langs?.learning) {
    if (!lang) return;
    const wait = packs.current!;
    if (!wait.waiting) {
      try {
        const list = await deps.send({ type: "listTermsWithStats", lang });
        show(list);
        meanings.current!.refresh();
        return list;
      } catch (error) {
        if (!(error instanceof PacksUnavailableError)) throw error;
        wait.add(error.packs);
      }
    }
    const list = await deps.send({
      type: "listTermsWithStats",
      lang,
      meanings: false,
    });
    show(list);
    return list;
  }

  useEffect(
    () => () => {
      packs.current?.stop();
      meanings.current?.stop();
    },
    [],
  );

  useEffect(() => {
    // The other devices' changes are read now, not at the next 5-minute check.
    deps.send({ type: "cloudCheck" }).catch(warn);
    deps.send({ type: "getSettings" }).then((settings) => {
      setLangs({
        learning: settings.learningLang,
        native: settings.nativeLang,
      });
      return reload(settings.learningLang);
    }, warn);
  }, []);

  useEffect(() => {
    if (!langs) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reload().catch(warn);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [langs]);

  return {
    langs,
    terms,
    findTerm,
    reload,
    onPacksReady,
    packs: packs.current,
    meanings: meanings.current,
  };
}
