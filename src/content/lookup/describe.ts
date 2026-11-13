import type { Category, TermKind, WordStatus } from "../../core/classify";
import {
  cleanDefinition,
  MAX_TRANSLATED_SENSES,
} from "../../core/lexicon/definitions";
import type { Sense, Written } from "../../core/lexicon/dictionary";
import { NO_RULES, type PhraseRules } from "../../core/phrases/pattern";
import { normalizeWord } from "../../core/text/tokenize";
import { rulesFor } from "../../core/phrases/rules";
import type { send as sendFn } from "../../messaging/client";
import {
  MAX_CACHED_TRANSLATIONS,
  type OccurrenceView,
} from "../../messaging/protocol";
import type { DictionaryEntryView } from "../../ui/lookup/DictionaryWindow";
import type { TranslationPair, TranslationQueue } from "../translate/queue";

/** A sense as the dictionary window shows it. */
interface CardSense extends Sense {
  /**
   * The browser translator's translation of `text` (its cleaned English definition)
   * into the native language; the window shows `text` under it.
   */
  translated?: string;
}

/** What the hover card and the dictionary panel show for a term. */
export interface TermCard {
  key: string;
  kind: TermKind;
  head: string;
  ipa?: string;
  short?: string;
  /**
   * The hover card's meanings, one per line (`DictionaryEntry.lines`): up to three
   * senses of a dictionary's own glosses. Missing: `short` alone (a machine
   * translation, an English definition).
   */
  lines?: string[];
  /**
   * Language of `short` when it is not the native language (an English definition not
   * translated: "en"); the UI sets it as its `lang`.
   */
  shortLang?: string;
  /**
   * Language of the senses' `text` when it is not the native language (an English
   * definition: "en"), also under a translated sense; the UI sets it as their `lang`.
   */
  glossLang?: string;
  /** Phrases: the main word and its translation; words: the form seen → its base. */
  sub?: string;
  /**
   * `short` is the browser translator's (marked "Machine translation"): a literal
   * translation of a phrase no dictionary has, or the translation of its English
   * definition.
   */
  machineTranslated?: "literal" | "definition";
  /** The saved status; "new" while the term is not saved. */
  status: WordStatus;
  /** Not saved, but known by its frequency (the known level): shown as Known. */
  knownByLevel?: true;
  termId: string;
  senses: CardSense[];
  elsewhere: OccurrenceView[];
}

/** The status the hover card shows: a word known by its frequency shows as Known. */
const shownStatus = (card: TermCard): WordStatus =>
  card.knownByLevel ? "known" : card.status;

/** What the hover card shows of a term. */
export const hoverView = (card: TermCard) => ({
  kind: card.kind,
  status: shownStatus(card),
  head: card.head,
  ipa: card.ipa,
  meanings: card.lines ?? (card.short === undefined ? [] : [card.short]),
  machineTranslated: card.machineTranslated !== undefined,
  shortLang: card.shortLang,
  sub: card.sub,
});

/**
 * What the dictionary window shows of a term. Its short line is marked "Machine
 * translation" only for a literal translation: translated definitions are marked on
 * the Meanings heading.
 */
export const windowView = (card: TermCard): DictionaryEntryView => ({
  head: card.head,
  kind: card.kind,
  ipa: card.ipa,
  sub: card.sub,
  short: card.short,
  shortLang: card.shortLang,
  machineTranslated: card.machineTranslated === "literal",
  senses: card.senses,
  glossLang: card.glossLang,
});

/**
 * The phrase's longest word (the first on a tie) that is not a slot of the language's
 * rules: "figure" in "figure out", "make" in "make up one's mind".
 */
export function mainWord(
  phrase: string,
  rules: PhraseRules = NO_RULES,
): string {
  const words = phrase.split(" ");
  const literal = words.filter((word) => !rules.slots.has(normalizeWord(word)));
  return (literal.length > 0 ? literal : words).reduce(
    (best, word) => (word.length > best.length ? word : best),
    "",
  );
}

/** "loaves → loaf" when the form on the page is not its base form. */
export function inflectionNote(
  surface: string,
  key: string,
): string | undefined {
  const form = normalizeWord(surface);
  return form === key ? undefined : `${form} → ${key}`;
}

export interface DescribeDeps {
  send: typeof sendFn;
  lang: string;
  /** The native language: English definitions are translated into it. */
  nativeLang: string;
  /** The page the term is on, so its occurrences here are told apart. */
  sourceUrl: string;
  translator: TranslationQueue;
  /**
   * How long the card waits for the translator (default 1.5 s): its model may still be
   * downloading. Later, the translation is not shown (a definition's is still kept).
   */
  translationWaitMs?: number;
  /**
   * Where the card shows (default the hover card), which is the priority of its
   * translations. The dictionary window does not wait for its definitions: it shows,
   * then `translateSenses` translates them.
   */
  shownIn?: "hover" | "window";
}

const TRANSLATION_WAIT_MS = 1500;

/** The answer, or undefined when it does not come within `ms`. */
const within = (translation: Promise<string | undefined>, ms: number) =>
  Promise.race([
    translation,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ]);

/** The pair English definitions are translated in; undefined when they need none. */
function definitionPair(
  glossLang: string | undefined,
  nativeLang: string,
): TranslationPair | undefined {
  return glossLang !== undefined && glossLang !== nativeLang
    ? { from: glossLang, to: nativeLang }
    : undefined;
}

/** Keeps translations of definitions in the background's cache (best effort). */
function keepTranslations(
  send: typeof sendFn,
  lang: string,
  items: { text: string; translated: string }[],
) {
  for (let i = 0; i < items.length; i += MAX_CACHED_TRANSLATIONS)
    send({
      type: "cacheTranslations",
      lang,
      items: items.slice(i, i + MAX_CACHED_TRANSLATIONS),
    }).catch((error: unknown) =>
      console.warn("Lingo: could not keep the translations", error),
    );
}

/**
 * Looks a term up. A meaning that exists only as an English definition (`glossLang`)
 * shows translated when it can: its short meaning from the cache or else the
 * translator (within the wait; `machineTranslated`), its senses from the cache
 * (`translateSenses` translates the others for the window). A phrase missing from
 * every dictionary (a selected phrase) is shown as written on the page, with its
 * literal translation (`machineTranslated`; left out when it does not come in time)
 * and a note with its main word's translation; its IPA comes from the language pack.
 */
export async function describeTerm(
  term: {
    key: string;
    kind: TermKind;
    surface: string;
    category?: Category;
    /** How the word was written on the page, when it says. */
    written?: Written;
  },
  {
    send,
    lang,
    nativeLang,
    sourceUrl,
    translator,
    translationWaitMs = TRANSLATION_WAIT_MS,
    shownIn = "hover",
  }: DescribeDeps,
): Promise<TermCard> {
  const lookup = (key: string, written?: Written) =>
    send({
      type: "lookup",
      lang,
      key,
      sourceUrl,
      ...(written !== undefined && { written }),
    });
  const found = await lookup(term.key, term.written);
  const { entry } = found;
  const ipa = entry?.ipa ?? found.ipa;
  const pair = definitionPair(entry?.glossLang, nativeLang);
  /** The cached translation of a cleaned English definition. */
  const cached = (text: string | undefined) =>
    pair && text !== undefined ? found.translations?.[text] : undefined;

  /** The short meaning translated from its English definition, when it is one. */
  async function translatedShort() {
    const english = pair && entry && cleanDefinition(entry.short);
    if (!pair || !english) return undefined;
    const hit = cached(english);
    if (hit !== undefined || shownIn === "window") return hit;
    const translation = translator.translate(english, shownIn, pair);
    // Kept even when it comes too late for this card.
    void translation.then((translated) => {
      if (translated)
        keepTranslations(send, lang, [{ text: english, translated }]);
    });
    return within(translation, translationWaitMs);
  }

  const main =
    term.kind === "phrase" ? mainWord(term.key, rulesFor(lang)) : undefined;
  const [definition, literal, word] = await Promise.all([
    translatedShort(),
    term.kind === "phrase" && entry?.short === undefined
      ? within(
          translator.translate(term.surface, shownIn, {
            from: lang,
            to: nativeLang,
          }),
          translationWaitMs,
        )
      : undefined,
    main !== undefined ? lookup(main) : undefined,
  ]);

  let short = entry?.short;
  let shortLang = entry?.glossLang;
  let machineTranslated: TermCard["machineTranslated"];
  if (definition !== undefined) {
    short = definition;
    shortLang = undefined;
    machineTranslated = "definition";
  } else if (short === undefined && literal !== undefined) {
    short = literal;
    machineTranslated = "literal";
  }
  // A translation (and an English definition, whose entry has one line) shows alone.
  const lines = machineTranslated === undefined ? entry?.lines : undefined;
  const sub =
    main !== undefined
      ? word?.entry && `${main} — ${word.entry.short}`
      : inflectionNote(term.surface, term.key);
  const senses = (entry?.senses ?? []).map((sense, i): CardSense => {
    const translated =
      i < MAX_TRANSLATED_SENSES
        ? cached(cleanDefinition(sense.text))
        : undefined;
    return translated !== undefined ? { ...sense, translated } : sense;
  });

  return {
    key: term.key,
    kind: term.kind,
    // A phrase is keyed by its words' base forms ("heavy lift"); show it as written.
    head: entry?.head ?? (term.kind === "phrase" ? term.surface : term.key),
    ...(ipa !== undefined && { ipa }),
    ...(short !== undefined && { short }),
    ...(lines !== undefined && { lines }),
    ...(shortLang !== undefined && { shortLang }),
    ...(entry?.glossLang !== undefined && { glossLang: entry.glossLang }),
    ...(sub !== undefined && { sub }),
    ...(machineTranslated !== undefined && { machineTranslated }),
    status: found.status,
    ...(found.status === "new" &&
      term.category === "known" && { knownByLevel: true as const }),
    termId: found.termId,
    senses,
    elsewhere: found.elsewhere,
  };
}

/**
 * The dictionary window's card with its English definitions translated, at the
 * window's priority: its short meaning while the card has it in English, and its
 * first senses (`MAX_TRANSLATED_SENSES`), pointers left as written. What the card has
 * translated is not asked for again; new translations are kept in the background's
 * cache. Gives `card` itself back when nothing new is translated.
 */
export async function translateSenses(
  card: TermCard,
  deps: Pick<DescribeDeps, "send" | "lang" | "nativeLang" | "translator">,
): Promise<TermCard> {
  const pair = definitionPair(card.glossLang, deps.nativeLang);
  if (!pair) return card;
  const shortText =
    card.shortLang !== undefined && card.short !== undefined
      ? cleanDefinition(card.short)
      : undefined;
  const senseTexts = card.senses.map((sense, i) =>
    i < MAX_TRANSLATED_SENSES && sense.translated === undefined
      ? cleanDefinition(sense.text)
      : undefined,
  );
  const texts = [
    ...new Set([shortText, ...senseTexts].filter((text) => text !== undefined)),
  ];
  const answers = await Promise.all(
    texts.map((text) => deps.translator.translate(text, "window", pair)),
  );
  const translations = new Map<string, string>();
  texts.forEach((text, i) => {
    const translated = answers[i];
    if (translated) translations.set(text, translated);
  });
  if (translations.size === 0) return card;
  keepTranslations(
    deps.send,
    deps.lang,
    [...translations].map(([text, translated]) => ({ text, translated })),
  );

  const result: TermCard = {
    ...card,
    senses: card.senses.map((sense, i) => {
      const text = senseTexts[i];
      const translated = text !== undefined && translations.get(text);
      return translated ? { ...sense, translated } : sense;
    }),
  };
  const short = shortText !== undefined && translations.get(shortText);
  if (short) {
    result.short = short;
    result.machineTranslated = "definition";
    delete result.shortLang;
  }
  return result;
}
