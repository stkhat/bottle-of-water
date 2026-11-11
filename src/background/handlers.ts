import type { BrowserEnv } from "../core/browser-env";
import { unsavedKeys, type Span, type TermStatus } from "../core/classify";
import { cleanDefinition, definitionTexts } from "../core/definitions";
import type { DictionaryEntry } from "../core/dictionary";
import { learningLanguages, nativeLanguages } from "../core/languages";
import type { PackLock } from "../core/packs/lock";
import { packsFor } from "../core/packs/pairs";
import { allOf, PacksUnavailableError } from "../core/packs/unavailable";
import type { MatchWord } from "../core/phrases/matcher";
import {
  hostBlocked,
  type Settings,
  type SettingsPatch,
} from "../core/settings";
import type { SyncBackend } from "../core/sync/backend";
import { normalizeUrl, occurrenceLink } from "../core/url";
import {
  MAX_CACHED_TRANSLATIONS,
  MAX_TRANSLATION_TEXT,
  type OccurrenceView,
  type Reply,
  type RequestOf,
  type RequestType,
  type ResponseOf,
  type TermBrief,
} from "../messaging/protocol";
import { historyKeys } from "./history-keys";
import type { HistorySentence, HistoryStore } from "./history-store";
import type { LanguageResources } from "./language-resources";
import type { PackStore } from "./pack-store";
import {
  MAX_OCCURRENCES,
  termId,
  type ImportedOccurrence,
  type OccurrenceWithSource,
  type TermStore,
} from "./term-store";
import {
  translationPair,
  type TranslationCache,
  type TranslationItem,
} from "./translation-cache";

/** What the handlers work with; tests pass fakes. */
export interface HandlerDeps {
  store: TermStore;
  /** The sentence history: sentences kept from pages and videos, on this device only. */
  history: HistoryStore;
  /** Machine translations of English definitions, on this device only. */
  translations: TranslationCache;
  settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): Promise<Settings>;
  };
  resources: LanguageResources;
  /** Downloaded language packs. */
  packs: {
    /** The lock this build uses: which packs are bundled, and their sizes. */
    lock: PackLock;
    store: Pick<PackStore, "states" | "downloaded" | "remove">;
    /**
     * Starts bringing the chosen pair's packs to their lock version (and schedules
     * retries when that fails); does not wait for it.
     */
    retry(): void;
  };
  sync: Pick<SyncBackend, "status">;
  env(): BrowserEnv;
  /** `runtime.openOptionsPage`. */
  openOptionsPage(): Promise<void>;
}

/** Who sent a message: the part of `runtime.MessageSender` the handlers use. */
export interface MessageSender {
  tab?: { incognito?: boolean };
}

/**
 * Answers one message. Never rejects: failures come back as `{ ok: false }`.
 * `sender` is the message's sender; messages from the extension's own pages have no tab.
 */
export type Handle = (
  request: unknown,
  sender?: MessageSender,
) => Promise<Reply>;

type Handlers = {
  [T in RequestType]: (
    request: RequestOf<T>,
    sender: MessageSender,
  ) => Promise<ResponseOf<T>>;
};

/** Private (incognito) windows leave nothing behind: no history, no encounters. */
const fromIncognito = (sender: MessageSender) => sender.tab?.incognito === true;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function view(o: OccurrenceWithSource): OccurrenceView {
  const { title, platform, url } = o.source;
  return {
    sentence: o.sentence,
    ...(o.translation !== undefined && { translation: o.translation }),
    pos: o.pos,
    seenAt: o.seenAt,
    origin: o.origin,
    source: { title, platform, url },
    link: occurrenceLink(o.source, o.pos),
  };
}

/** A kept sentence as an occurrence seen elsewhere (an unsaved term's history). */
function historyView(h: HistorySentence): OccurrenceView {
  const { title, platform, url } = h.page;
  return {
    sentence: h.text,
    ...(h.translation !== undefined && { translation: h.translation }),
    pos: h.pos,
    seenAt: h.seenAt,
    origin: "encountered",
    source: { title, platform, url },
    link: occurrenceLink(h.page, h.pos),
  };
}

/** A kept sentence as an occurrence to bring into a newly saved term. */
function imported(h: HistorySentence): ImportedOccurrence {
  return {
    source: h.page,
    sentence: h.text,
    ...(h.translation !== undefined && { translation: h.translation }),
    pos: h.pos,
    seenAt: h.seenAt,
  };
}

/**
 * The words whose text overlaps `start` to `end` (exclusive), as word indices `from`
 * (inclusive) to `to` (exclusive); `from` is not below `to` when there is none.
 */
function wordsTouched(
  words: readonly MatchWord[],
  start: number,
  end: number,
): { from: number; to: number } {
  let from = words.length;
  let to = 0;
  words.forEach(({ token }, i) => {
    if (token.end <= start || token.start >= end) return;
    from = Math.min(from, i);
    to = i + 1;
  });
  return { from, to };
}

/** A short meaning as lists show it (`TermBrief`, `TermSummary`). */
type ShortMeaning = Pick<
  TermBrief,
  "short" | "glossLang" | "machineTranslated"
>;

/**
 * Whether an entry's glosses are in a language other than the native one (an English
 * definition): the UI translates those, and the background gives back cached ones.
 */
const glossedInOtherLanguage = (
  entry: DictionaryEntry | undefined,
  nativeLang: string,
): entry is DictionaryEntry & { glossLang: string } =>
  entry?.glossLang !== undefined && entry.glossLang !== nativeLang;

/** A translation `cacheTranslations` keeps: both texts present and not oversized. */
function isTranslationItem(item: unknown): item is TranslationItem {
  const { text, translated } = (item ?? {}) as Record<string, unknown>;
  return (
    typeof text === "string" &&
    typeof translated === "string" &&
    text.trim() !== "" &&
    translated.trim() !== "" &&
    text.length <= MAX_TRANSLATION_TEXT &&
    translated.length <= 4 * MAX_TRANSLATION_TEXT
  );
}

/** Bytes of a pack's files in the lock. */
const lockSize = (lock: PackLock, pack: keyof PackLock["packs"]) =>
  lock.packs[pack].files.reduce((sum, file) => sum + file.size, 0);

/**
 * The offered language pairs whose packs include `pack`, as translation pairs
 * ("es>en"): removing the pack clears their machine translations.
 */
function pairsUsing(pack: string): string[] {
  return learningLanguages().flatMap((learning) =>
    nativeLanguages(learning)
      .filter((native) =>
        (packsFor(learning, native) as string[]).includes(pack),
      )
      .map((native) => translationPair(learning, native)),
  );
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function normalizedOrUndefined(url: string | undefined) {
  if (url === undefined) return undefined;
  try {
    return normalizeUrl(url);
  } catch {
    return undefined;
  }
}

/** The background's dispatcher: routes each request to the store, settings or packs. */
export function createHandlers({
  store,
  history,
  translations,
  settings,
  resources,
  packs,
  sync,
  env,
  openOptionsPage,
}: HandlerDeps): Handle {
  /** Cached translations of `texts`; best effort: none when the cache cannot be read. */
  async function cachedTranslations(
    pair: string,
    texts: readonly string[],
  ): Promise<Record<string, string>> {
    if (texts.length === 0) return {};
    try {
      return await translations.get(pair, texts);
    } catch (error) {
      console.error("Lingo: could not read the translation cache", error);
      return {};
    }
  }

  /**
   * The short meanings of entries, in order: a cached translation of an English
   * definition replaces it (never translated here), the others are as the dictionary
   * has them.
   */
  async function shortMeanings(
    lang: string,
    nativeLang: string,
    entries: readonly (DictionaryEntry | undefined)[],
  ): Promise<ShortMeaning[]> {
    const cleaned = entries.map((entry) =>
      glossedInOtherLanguage(entry, nativeLang)
        ? cleanDefinition(entry.short)
        : undefined,
    );
    const found = await cachedTranslations(translationPair(lang, nativeLang), [
      ...new Set(cleaned.filter((text) => text !== undefined)),
    ]);
    return entries.map((entry, i): ShortMeaning => {
      if (entry === undefined) return {};
      const text = cleaned[i];
      if (text !== undefined && Object.hasOwn(found, text))
        return { short: found[text]!, machineTranslated: true };
      return {
        short: entry.short,
        ...(entry.glossLang !== undefined && { glossLang: entry.glossLang }),
      };
    });
  }

  const handlers: Handlers = {
    getSettings: () => settings.get(),
    setSettings: ({ patch }) => settings.set(patch),
    getBrowserEnv: async () => env(),
    async openOptions() {
      await openOptionsPage();
      return null;
    },

    async analyze({ lang, blocks }) {
      const [pack, classifier, terms, { knownLevel }] = await allOf([
        resources.pack(lang),
        resources.classifier(lang),
        store.termIndex(lang),
        settings.get(),
      ]);
      const spans: Span[][] = blocks.map((block) =>
        classifier.classify(pack.tokenize(block), { terms, knownLevel }),
      );
      const all = spans.flat();
      const saved = new Set(
        all.filter((s) => terms.has(s.key)).map((s) => s.key),
      );
      return { spans, unsaved: unsavedKeys(all), saved: [...saved] };
    },

    async matchSelection({ lang, text, start, end }) {
      const pack = await resources.pack(lang);
      const input = pack.matcher.prepare(pack.tokenize(text));
      const { from, to } = wordsTouched(input.words, start, end);
      const match = pack.matcher.matchSelection(input, from, to);
      if (!match) return {};
      return {
        key: match.key,
        start: input.words[match.words[0]!]!.token.start,
        end: input.words[match.words.at(-1)!]!.token.end,
      };
    },

    async warmDictionary({ lang }) {
      const { nativeLang } = await settings.get();
      await resources.dictionary(lang, nativeLang);
      return null;
    },

    async lookup({ lang, key, sourceUrl }) {
      const { nativeLang } = await settings.get();
      const id = termId(lang, key);
      const [dictionary, pack, terms, occurrences] = await allOf([
        resources.dictionary(lang, nativeLang),
        resources.pack(lang),
        store.termIndex(lang),
        store.occurrencesOf(id),
      ]);
      const hereUrl = normalizedOrUndefined(sourceUrl);
      const here: OccurrenceView[] = [];
      const elsewhere: OccurrenceView[] = [];
      for (const o of occurrences)
        (o.source.url === hereUrl ? here : elsewhere).push(view(o));
      const status = terms.get(key) ?? "new";
      // Best effort: the dictionary entry is shown whether or not the history is read.
      if (status === "new") {
        try {
          const kept = await history.find(id, {
            ...(sourceUrl !== undefined && { excludeUrl: sourceUrl }),
          });
          elsewhere.push(...kept.map(historyView));
        } catch (error) {
          console.error("Lingo: could not read the sentence history", error);
        }
      }
      const entry = dictionary.entry(key);
      const ipa = pack.ipa(key);
      const translated = glossedInOtherLanguage(entry, nativeLang)
        ? await cachedTranslations(
            translationPair(lang, nativeLang),
            definitionTexts(entry),
          )
        : {};
      return {
        ...(entry !== undefined && { entry }),
        ...(ipa !== undefined && { ipa }),
        status,
        termId: id,
        here,
        elsewhere,
        ...(Object.keys(translated).length > 0 && { translations: translated }),
      };
    },

    async saveTerm(request) {
      const input: Omit<typeof request, "type"> & { type?: string } = {
        ...request,
      };
      delete input.type;
      const wasSaved = (await store.termIndex(input.lang)).has(input.key);
      const term = await store.saveTerm(input);
      // A term saved now (new, or saved again after removal) takes in the sentences
      // kept for it. Read outside the store's transaction to keep that one small.
      // Best effort: the term is saved whether or not its history comes along.
      if (!wasSaved) {
        try {
          const kept = await history.find(term.id, { limit: MAX_OCCURRENCES });
          if (kept.length > 0)
            await store.importOccurrences(term.id, kept.map(imported));
        } catch (error) {
          console.error("Lingo: could not import the sentence history", error);
        }
      }
      return term;
    },
    setStatus: ({ id, status }) => store.setStatus(id, status),
    removeTerm: async ({ id }) => {
      await store.removeTerm(id);
      return null;
    },
    recordEncounters: async ({ source, items }, sender) =>
      fromIncognito(sender) ? 0 : store.recordEncounters(source, items),
    saveAll: ({ lang, keys, status, source }) =>
      store.saveAll(lang, keys, status, source),
    undoSaveAll: ({ batchId }) => store.undoSaveAll(batchId),
    counts: ({ lang }) => store.counts(lang),
    syncStatus: () => sync.status(),
    exportJson: () => store.exportJson(),
    importJson: ({ json }) => store.importJson(json),
    lastExport: async () => (await store.getMeta("lastExportAt")) ?? null,
    listTerms: ({ lang }) => store.listTerms(lang),
    async listTermsWithStats({ lang }) {
      const { nativeLang } = await settings.get();
      const [terms, stats, dictionary] = await allOf([
        store.listTerms(lang),
        store.occurrenceStats(lang),
        resources.dictionary(lang, nativeLang),
      ]);
      const meanings = await shortMeanings(
        lang,
        nativeLang,
        terms.map((term) => dictionary.entry(term.key)),
      );
      return terms.map((term, i) => {
        const seen = stats.get(term.id);
        return {
          id: term.id,
          key: term.key,
          display: term.display,
          kind: term.kind,
          status: term.status as TermStatus,
          ...meanings[i],
          seen: seen?.count ?? 0,
          lastSeen: seen?.lastSeen ?? term.createdAt,
          createdAt: term.createdAt,
        };
      });
    },

    async termSummaries({ lang, terms }) {
      const { nativeLang } = await settings.get();
      const [index, dictionary] = await allOf([
        store.termIndex(lang),
        resources.dictionary(lang, nativeLang),
      ]);
      const meanings = await shortMeanings(
        lang,
        nativeLang,
        terms.map(({ key }) => dictionary.entry(key)),
      );
      // fromEntries: any key is an own property, "__proto__" included.
      return Object.fromEntries(
        terms.map(({ key }, i): [string, TermBrief] => [
          key,
          { ...meanings[i], status: index.get(key) ?? "new" },
        ]),
      );
    },

    async cacheTranslations({ lang, items }) {
      if (!learningLanguages().includes(lang) || !Array.isArray(items))
        return null;
      const kept = items
        .filter(isTranslationItem)
        .slice(0, MAX_CACHED_TRANSLATIONS)
        .map(({ text, translated }) => ({ text, translated }));
      if (kept.length === 0) return null;
      const { nativeLang } = await settings.get();
      await translations.put(translationPair(lang, nativeLang), kept);
      return null;
    },

    async recordHistory({ source, sentences }, sender) {
      if (fromIncognito(sender)) return { kept: 0 };
      const current = await settings.get();
      const host = hostnameOf(source.url);
      if (
        !current.sentenceHistory ||
        host === undefined ||
        hostBlocked(host, current) ||
        !learningLanguages().includes(source.lang)
      )
        return { kept: 0 };
      const [pack, classifier, terms] = await allOf([
        resources.pack(source.lang),
        resources.classifier(source.lang),
        store.termIndex(source.lang),
      ]);
      const options = { terms, knownLevel: current.knownLevel };
      const items = sentences.map((sentence) => ({
        ...sentence,
        keys: historyKeys(sentence.text, pack, classifier, options),
      }));
      return { kept: await history.record(source, items) };
    },
    historyStatus: () => history.status(),
    clearHistory: async () => {
      await history.clear();
      return null;
    },

    async packStatus() {
      const { learningLang, nativeLang } = await settings.get();
      const needed = packsFor(learningLang, nativeLang);
      const downloaded = needed.filter(
        (pack) => !packs.lock.packs[pack].bundled,
      );
      const [states, stored] = await Promise.all([
        packs.store.states(downloaded),
        packs.store.downloaded(),
      ]);
      return {
        pair: {
          bundled: downloaded.length === 0,
          packs: downloaded.map((pack) => ({
            pack,
            size: lockSize(packs.lock, pack),
            ...states[pack]!,
          })),
        },
        others: stored
          .filter(({ pack }) => !(needed as string[]).includes(pack))
          .map(({ pack, size }) => ({ pack, size })),
      };
    },

    async retryPacks() {
      packs.retry();
      return null;
    },

    async removePack({ pack }) {
      if (typeof pack !== "string") throw new Error("No pack to remove");
      const { learningLang, nativeLang } = await settings.get();
      if ((packsFor(learningLang, nativeLang) as string[]).includes(pack))
        throw new Error(`${pack} is used by the chosen languages`);
      const stored = await packs.store.downloaded();
      if (!stored.some((d) => d.pack === pack)) return null;
      await packs.store.remove(pack);
      await Promise.all(
        pairsUsing(pack).map((pair) => translations.clearPair(pair)),
      );
      return null;
    },
  };

  return async (request, sender = {}) => {
    const type = (request as { type?: unknown } | null | undefined)?.type;
    if (typeof type !== "string")
      return { ok: false, error: "Unknown request" };
    if (!Object.hasOwn(handlers, type))
      return { ok: false, error: `Unknown request: ${type}` };
    try {
      const handler = handlers[type as RequestType] as (
        request: unknown,
        sender: MessageSender,
      ) => Promise<unknown>;
      return { ok: true, value: await handler(request, sender) };
    } catch (error) {
      if (error instanceof PacksUnavailableError)
        return {
          ok: false,
          error: error.message,
          code: "packsUnavailable",
          packs: error.packs,
        };
      return { ok: false, error: errorText(error) };
    }
  };
}
