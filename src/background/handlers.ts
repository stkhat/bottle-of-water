import type { BrowserEnv } from "../core/browser-env";
import { unsavedKeys, type Span } from "../core/classify";
import type { Settings, SettingsPatch } from "../core/settings";
import type { SyncBackend } from "../core/sync/backend";
import { normalizeUrl, occurrenceLink } from "../core/url";
import type {
  OccurrenceView,
  Reply,
  RequestOf,
  RequestType,
  ResponseOf,
} from "../messaging/protocol";
import type { LanguageResources } from "./language-resources";
import {
  termId,
  type OccurrenceWithSource,
  type TermStore,
} from "./term-store";

/** What the handlers work with; tests pass fakes. */
export interface HandlerDeps {
  store: TermStore;
  settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): Promise<Settings>;
  };
  resources: LanguageResources;
  sync: Pick<SyncBackend, "status">;
  env(): BrowserEnv;
}

/** Answers one message. Never rejects: failures come back as `{ ok: false }`. */
export type Handle = (request: unknown) => Promise<Reply>;

type Handlers = {
  [T in RequestType]: (request: RequestOf<T>) => Promise<ResponseOf<T>>;
};

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
  settings,
  resources,
  sync,
  env,
}: HandlerDeps): Handle {
  const handlers: Handlers = {
    getSettings: () => settings.get(),
    setSettings: ({ patch }) => settings.set(patch),
    getBrowserEnv: async () => env(),

    async analyze({ lang, blocks }) {
      const [pack, classifier, terms, { knownLevel }] = await Promise.all([
        resources.pack(lang),
        resources.classifier(lang),
        store.termIndex(lang),
        settings.get(),
      ]);
      const spans: Span[][] = blocks.map((block) =>
        classifier.classify(pack.tokenize(block), { terms, knownLevel }),
      );
      return { spans, unsaved: unsavedKeys(spans.flat()) };
    },

    async lookup({ lang, key, sourceUrl }) {
      const { nativeLang } = await settings.get();
      const id = termId(lang, key);
      const [dictionary, terms, occurrences] = await Promise.all([
        resources.dictionary(lang, nativeLang),
        store.termIndex(lang),
        store.occurrencesOf(id),
      ]);
      const hereUrl = normalizedOrUndefined(sourceUrl);
      const here: OccurrenceView[] = [];
      const elsewhere: OccurrenceView[] = [];
      for (const o of occurrences)
        (o.source.url === hereUrl ? here : elsewhere).push(view(o));
      const entry = dictionary.entry(key);
      return {
        ...(entry !== undefined && { entry }),
        status: terms.get(key) ?? "new",
        termId: id,
        here,
        elsewhere,
      };
    },

    saveTerm(request) {
      const input: Omit<typeof request, "type"> & { type?: string } = {
        ...request,
      };
      delete input.type;
      return store.saveTerm(input);
    },
    setStatus: ({ id, status }) => store.setStatus(id, status),
    removeTerm: async ({ id }) => {
      await store.removeTerm(id);
      return null;
    },
    recordEncounters: ({ source, items }) =>
      store.recordEncounters(source, items),
    saveAll: ({ lang, keys, status, source }) =>
      store.saveAll(lang, keys, status, source),
    undoSaveAll: ({ batchId }) => store.undoSaveAll(batchId),
    counts: ({ lang }) => store.counts(lang),
    syncStatus: () => sync.status(),
    exportJson: () => store.exportJson(),
    importJson: ({ json }) => store.importJson(json),
    listTerms: ({ lang }) => store.listTerms(lang),
  };

  return async (request) => {
    const type = (request as { type?: unknown } | null | undefined)?.type;
    if (typeof type !== "string")
      return { ok: false, error: "Unknown request" };
    if (!Object.hasOwn(handlers, type))
      return { ok: false, error: `Unknown request: ${type}` };
    try {
      const handler = handlers[type as RequestType] as (
        request: unknown,
      ) => Promise<unknown>;
      return { ok: true, value: await handler(request) };
    } catch (error) {
      return { ok: false, error: errorText(error) };
    }
  };
}
