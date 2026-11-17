import type { Category, TermKind, WordStatus } from "../../core/classify";
import type { Answer } from "../../core/explain/answer";
import {
  cleanDefinition,
  isUsageNoteShort,
  MAX_TRANSLATED_SENSES,
  shortDefinitionText,
} from "../../core/lexicon/definitions";
import type { Sense, Written } from "../../core/lexicon/dictionary";
import {
  MAX_SHORT_LINES,
  translatedLine,
  withoutFinalStop,
} from "../../core/lexicon/short-lines";
import { matchSense, type Meaning } from "../../core/meanings";
import { NO_RULES, type PhraseRules } from "../../core/phrases/pattern";
import { normalizeWord } from "../../core/text/tokenize";
import { rulesFor } from "../../core/phrases/rules";
import type { send as sendFn } from "../../messaging/client";
import {
  MAX_CACHED_TRANSLATIONS,
  type OccurrenceView,
  type YourMeaning,
} from "../../messaging/protocol";
import type {
  DictionaryEntryView,
  SenseView,
} from "../../ui/lookup/DictionaryWindow";
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
  /** The meanings chosen for the term's sentences (`LookupResult.yourMeanings`). */
  yourMeanings: YourMeaning[];
  /** The key of the meaning chosen for the sentence it was looked up in. */
  chosenHere?: string;
}

/** A row of the dictionary window's Meanings, and what choosing it for this sentence sends. */
export interface MeaningRow {
  sense: SenseView;
  meaning: Meaning;
}

/** The on-device AI's answer "In this sentence" shows, as far as Meanings follows it. */
type ShownAnswer = Pick<Answer, "meaning" | "sense">;

/**
 * The dictionary window's Meanings: the meanings chosen elsewhere that are not one of
 * the entry's senses first (the on-device AI's, a sense a pack update took away), then
 * the entry's senses. A chosen dictionary meaning is matched to its sense by part of
 * speech and the pack's text (`matchSense`), so a translation shown for it changes
 * nothing. Each row says how many sentences its meaning was chosen for and whether it
 * was chosen for this one. With the on-device AI's `answer` for this sentence, the AI
 * meaning that is its meaning is left to its card, and the sense it names "Fits here".
 */
export function meaningRows(
  card: TermCard,
  answer?: ShownAnswer,
): MeaningRow[] {
  const mine = card.yourMeanings;
  const chosen = (m: YourMeaning | undefined) =>
    m && { chosen: m.count, usedHere: m.key === card.chosenHere };
  const dictionary = mine.filter((m) => m.from === "dictionary");
  const inCard = (m: YourMeaning) =>
    m.from === "ai" && answer !== undefined && m.text === answer.meaning;
  const others = mine
    .filter((m) => m.from === "ai" || matchSense(m, card.senses) < 0)
    .filter((m) => !inCard(m))
    .map((m): MeaningRow => ({
      sense: {
        text: m.text,
        ...(m.from === "ai"
          ? { ai: true as const, native: true as const }
          : {
              ...(m.pos !== undefined && { pos: m.pos }),
              ...(m.glossLang !== undefined
                ? { lang: m.glossLang }
                : { native: true as const }),
            }),
        ...chosen(m),
      },
      meaning: {
        from: m.from,
        text: m.text,
        ...(m.glossLang !== undefined && { glossLang: m.glossLang }),
        ...(m.pos !== undefined && { pos: m.pos }),
        ...(m.explanation !== undefined && { explanation: m.explanation }),
      },
    }));
  const senses = card.senses.map((sense, i): MeaningRow => ({
    sense: {
      ...sense,
      ...chosen(dictionary.find((m) => matchSense(m, [sense]) === 0)),
      ...(answer?.sense === i + 1 && { fits: true as const }),
    },
    meaning: {
      from: "dictionary",
      text: sense.text,
      ...(card.glossLang !== undefined && { glossLang: card.glossLang }),
      ...(sense.pos !== undefined && { pos: sense.pos }),
    },
  }));
  return [...others, ...senses];
}

/** A meaning the window offers for this sentence, and whether it is the one chosen. */
export interface Choice {
  meaning: Meaning;
  usedHere: boolean;
}

/** "Use here" on a Meanings row. */
export const rowChoice = (row: MeaningRow | undefined): Choice | undefined =>
  row && { meaning: row.meaning, usedHere: row.sense.usedHere === true };

/**
 * The entry's senses as the on-device AI reads them: as the pack has them (an English
 * definition in English), with their parts of speech, in order.
 */
export const packSenses = (card: TermCard) =>
  card.senses.map(({ pos, text }) => ({
    text,
    ...(pos !== undefined && { pos }),
  }));

/**
 * "Use this meaning" on the on-device AI's `answer`: the meaning it saves and whether
 * it is the one chosen for this sentence.
 */
export function answerChoice(card: TermCard, answer: Answer): Choice {
  const kept = card.yourMeanings.find(
    (m) => m.from === "ai" && m.text === answer.meaning,
  );
  return {
    meaning: { from: "ai", text: answer.meaning },
    usedHere: kept !== undefined && kept.key === card.chosenHere,
  };
}

/** The status the hover card shows: a word known by its frequency shows as Known. */
const shownStatus = (card: TermCard): WordStatus =>
  card.knownByLevel ? "known" : card.status;

/**
 * What the hover card shows of a term. Its lines: the meanings the user chose (the one
 * chosen for this sentence, then the most used: `yourMeanings`' order), then the
 * dictionary's other lines, at most three in all. The "Machine translation" mark goes
 * with the dictionary's translated line, when it shows.
 */
export const hoverView = (card: TermCard) => {
  const yours = card.yourMeanings.slice(0, MAX_SHORT_LINES).map((m) => ({
    text: m.line,
    ...(m.lineLang !== undefined && { lang: m.lineLang }),
  }));
  const taken = new Set(yours.map((m) => m.text));
  const meanings = (
    card.lines ?? (card.short === undefined ? [] : [card.short])
  )
    .filter((line) => !taken.has(line))
    .slice(0, MAX_SHORT_LINES - yours.length);
  return {
    kind: card.kind,
    status: shownStatus(card),
    head: card.head,
    ipa: card.ipa,
    yours,
    meanings,
    machineTranslated:
      card.machineTranslated !== undefined && meanings.length > 0,
    shortLang: card.shortLang,
    sub: card.sub,
  };
};

/**
 * What the dictionary window shows of a term. Its short line is marked "Machine
 * translation" only for a literal translation: translated definitions are marked on
 * the Meanings heading.
 */
export const windowView = (
  card: TermCard,
  answer?: ShownAnswer,
): DictionaryEntryView => ({
  head: card.head,
  kind: card.kind,
  ipa: card.ipa,
  sub: card.sub,
  short: card.short,
  shortLang: card.shortLang,
  machineTranslated: card.machineTranslated === "literal",
  senses: meaningRows(card, answer).map((row) => row.sense),
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
  translator: Pick<TranslationQueue, "translate">;
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
export function keepTranslations(
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
      console.warn("Langle: could not keep the translations", error),
    );
}

/**
 * Looks a term up. A meaning that exists only as an English definition (`glossLang`)
 * shows translated when it can: its short meaning from the cache or else the
 * translator (within the wait; `machineTranslated`), its senses from the cache
 * (`translateSenses` translates the others for the window); a definition that is only
 * a usage note gives way to the term's literal translation. A phrase missing from
 * every dictionary (a selected phrase) is shown as written on the page, with its
 * literal translation (`machineTranslated`; left out when it does not come in time)
 * and a note with its main word's translation; its IPA comes from the language pack.
 * The hover card shows a translation as one short line (`translatedLine`).
 */
export async function describeTerm(
  term: {
    key: string;
    kind: TermKind;
    surface: string;
    category?: Category;
    /** How the word was written on the page, when it says. */
    written?: Written;
    /** The part of speech its tag gives it on the page (`Span.pos`). */
    pos?: string;
    /** The sentence it is in there ("this sentence"), as saving it records it. */
    sentence?: string;
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
  const lookup = (
    key: string,
    place: { written?: Written; pos?: string; sentence?: string } = {},
  ) =>
    send({
      type: "lookup",
      lang,
      key,
      sourceUrl,
      ...(place.sentence !== undefined && { sentence: place.sentence }),
      ...(place.written !== undefined && { written: place.written }),
      ...(place.pos !== undefined && { pos: place.pos }),
    });
  const found = await lookup(term.key, term);
  const { entry } = found;
  const ipa = entry?.ipa ?? found.ipa;
  const pair = definitionPair(entry?.glossLang, nativeLang);
  /** The cached translation of a cleaned English definition. */
  const cached = (text: string | undefined) =>
    pair && text !== undefined ? found.translations?.[text] : undefined;

  /**
   * A definition that only says how the term is used ("An apophasis used by a speaker
   * to introduce…") or names its function ("A mild intensifier") reads as an
   * explanation once translated: the term itself is translated instead, as a phrase no
   * dictionary has is ("not to mention" → 言うまでもなく).
   */
  const usageNote =
    pair !== undefined && entry !== undefined && isUsageNoteShort(entry);

  /** The short meaning translated from its English definition, when it is one. */
  async function translatedShort() {
    const english =
      pair && entry && shortDefinitionText(entry.short, entry.senses);
    if (!pair || !english || usageNote) return undefined;
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
    (term.kind === "phrase" && entry?.short === undefined) || usageNote
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
    short = withoutFinalStop(definition);
    shortLang = undefined;
    machineTranslated = "definition";
  } else if (literal !== undefined) {
    short = literal;
    shortLang = undefined;
    machineTranslated = "literal";
  }
  // A translation (and an English definition, whose entry has one line) shows alone,
  // as one short line (the window shows it whole).
  const lines =
    machineTranslated === undefined || short === undefined
      ? entry?.lines
      : [translatedLine(short, nativeLang)];
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
    yourMeanings: found.yourMeanings,
    ...(found.chosenHere !== undefined && { chosenHere: found.chosenHere }),
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
  // A usage note stays as it is: the hover shows the term's literal translation.
  const shortText =
    card.shortLang !== undefined &&
    card.short !== undefined &&
    !isUsageNoteShort({
      kind: card.kind,
      short: card.short,
      senses: card.senses,
    })
      ? shortDefinitionText(card.short, card.senses)
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
    result.short = withoutFinalStop(short);
    result.machineTranslated = "definition";
    delete result.shortLang;
  }
  return result;
}
