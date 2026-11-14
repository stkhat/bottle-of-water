import type { send as sendFn } from "../../messaging/client";
import type { ShortMeaning } from "../../messaging/protocol";
import { keepTranslations } from "../lookup/describe";
import type { TranslationPair, TranslationQueue } from "../translate/queue";

/** A row a list shows: its key in the list and the term as the row shows it. */
export interface ListRow {
  key: string;
  head: string;
}

/** What a list translates for a short meaning. */
interface Wanted {
  text: string;
  pair: TranslationPair;
  /** A definition, which the background's cache keeps (not a term's literal translation). */
  definition: boolean;
}

/**
 * What a row's short meaning needs translated, as the hover card has it: its cleaned
 * definition in another language, or, for a usage note, the term as the row shows it
 * (a literal translation); undefined for a meaning in the native language, a
 * translation, or a definition that stays as written (a pointer).
 */
function wanted(
  meaning: ShortMeaning,
  head: string | undefined,
  lang: string,
  nativeLang: string,
): Wanted | undefined {
  const { glossLang } = meaning;
  if (glossLang === undefined || glossLang === nativeLang) return undefined;
  if (meaning.definition !== undefined)
    return {
      text: meaning.definition,
      pair: { from: glossLang, to: nativeLang },
      definition: true,
    };
  if (meaning.usageNote && head !== undefined)
    return {
      text: head,
      pair: { from: lang, to: nativeLang },
      definition: false,
    };
  return undefined;
}

const samePair = (a: TranslationPair, b: TranslationPair) =>
  a.from === b.from && a.to === b.to;

/** `item` with its short meaning replaced by a machine translation. */
export function withTranslation<T extends ShortMeaning>(
  item: T,
  translated: string,
): T {
  const next = { ...item, short: translated, machineTranslated: true as const };
  delete next.glossLang;
  delete next.definition;
  delete next.usageNote;
  return next;
}

/** How many times a row that got no translation is asked again on its own. */
const RETRIES = 3;

/**
 * The short meanings a list shows, in the native language (ui.md "Meanings in
 * lists"): the rows shown (`shown`, as they come into view) get their definitions in
 * another language translated as the hover card would (a usage note: the term's
 * literal translation), at the queue's lowest priority, and the definitions' into the
 * background's cache. Every translation the queue makes for the hover card, the
 * window or another list reaches the rows it matches, shown or not. Without a
 * translator, or while its model is not on the device (lists never start a download),
 * the English stays; a row that got nothing is asked again when it comes into view
 * again, or when its pair has translated something since. Stops with `signal`.
 */
export function createListMeanings(o: {
  send: typeof sendFn;
  translator: TranslationQueue;
  lang(): string;
  nativeLang(): string;
  /** The list's short meanings now, by row key. */
  meanings(): Iterable<[string, ShortMeaning]>;
  meaning(key: string): ShortMeaning | undefined;
  /** Rows translated: their new short meanings, by row key. */
  translated(changes: ReadonlyMap<string, string>): void;
  signal?: AbortSignal;
}) {
  const heads = new Map<string, string>();
  const asking = new Set<string>();
  /** Rows that got no translation, with how many times they were asked again. */
  const failed = new Map<string, number>();
  const stopped = () => o.signal?.aborted === true;

  const want = (key: string, meaning = o.meaning(key)) =>
    meaning && wanted(meaning, heads.get(key), o.lang(), o.nativeLang());

  /** Gives `translated` to every row waiting for `text` in `pair`. */
  function apply(text: string, pair: TranslationPair, translated: string) {
    const changes = new Map<string, string>();
    for (const [key, meaning] of o.meanings()) {
      const w = want(key, meaning);
      if (w && w.text === text && samePair(w.pair, pair))
        changes.set(key, translated);
    }
    for (const key of changes.keys()) failed.delete(key);
    if (changes.size > 0) o.translated(changes);
  }

  function ask(key: string) {
    if (stopped() || asking.has(key)) return;
    const w = want(key);
    if (!w) return;
    asking.add(key);
    void o.translator.translate(w.text, "list", w.pair).then((translated) => {
      asking.delete(key);
      if (stopped()) return;
      if (!translated) {
        failed.set(key, failed.get(key) ?? 0);
        return;
      }
      if (w.definition)
        keepTranslations(o.send, o.lang(), [{ text: w.text, translated }]);
      // New translations reached the rows already (the listener); kept ones now.
      apply(w.text, w.pair, translated);
    });
  }

  const unsubscribe = o.translator.onTranslated((text, pair, translated) => {
    if (stopped()) return;
    apply(text, pair, translated);
    // The pair translates now: rows it gave nothing before are asked again.
    for (const [key, retries] of [...failed]) {
      const w = want(key);
      if (!w || !samePair(w.pair, pair)) continue;
      if (retries >= RETRIES) continue;
      failed.set(key, retries + 1);
      ask(key);
    }
  });
  o.signal?.addEventListener("abort", unsubscribe, { once: true });

  return {
    /** Rows came into view: their meanings are translated when they need it. */
    shown(rows: readonly ListRow[]) {
      for (const { key, head } of rows) {
        heads.set(key, head);
        ask(key);
      }
    },
    /**
     * The list's meanings came or were read again (in English where not cached): the
     * rows among `keys` (default: all) shown so far ask, mostly for translations the
     * queue keeps.
     */
    refresh(keys: Iterable<string> = heads.keys()) {
      for (const key of [...keys]) if (heads.has(key)) ask(key);
    },
    stop: unsubscribe,
  };
}
