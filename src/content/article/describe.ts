import type { Category, TermKind } from "../../core/classify";
import type { Sense } from "../../core/dictionary";
import {
  NO_RULES,
  normalizeWord,
  type PhraseRules,
} from "../../core/phrases/pattern";
import { rulesFor } from "../../core/phrases/rules";
import type { send as sendFn } from "../../messaging/client";
import type { OccurrenceView } from "../../messaging/protocol";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import type { TranslationProvider } from "./translate";

/** What the hover card and the dictionary panel show for a term. */
export interface TermCard {
  key: string;
  kind: TermKind;
  head: string;
  ipa?: string;
  short?: string;
  /**
   * Language of `short` and `senses` when it is not the native language (an English
   * definition: "en"); the UI sets it as their `lang`.
   */
  glossLang?: string;
  /** Phrases: the main word and its translation; words: the form seen → its base. */
  sub?: string;
  /** `short` is the browser translator's literal translation (marked "Machine translation"). */
  machineTranslated?: true;
  /** The saved status; "new" while the term is not saved. */
  status: WordStatus;
  /** Not saved, but known by its frequency (the known level): shown as Known. */
  knownByLevel?: true;
  termId: string;
  senses: Sense[];
  elsewhere: OccurrenceView[];
}

/** The status the hover card shows: a word known by its frequency shows as Known. */
export const shownStatus = (card: TermCard): WordStatus =>
  card.knownByLevel ? "known" : card.status;

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

const normalize = (text: string) => text.toLowerCase().replaceAll("’", "'");

/** "loaves → loaf" when the form on the page is not its base form. */
export function inflectionNote(
  surface: string,
  key: string,
): string | undefined {
  const form = normalize(surface);
  return form === key ? undefined : `${form} → ${key}`;
}

export interface DescribeDeps {
  send: typeof sendFn;
  lang: string;
  /** The page the term is on, so its occurrences here are told apart. */
  sourceUrl: string;
  translator: TranslationProvider;
  /**
   * How long the card waits for the translator (default 1.5 s): its model may still be
   * downloading. Later, the translation is not shown.
   */
  translationWaitMs?: number;
}

const TRANSLATION_WAIT_MS = 1500;

/** The translator's answer, or undefined when it does not come within `ms`. */
const translateWithin = (
  translator: TranslationProvider,
  text: string,
  ms: number,
) =>
  Promise.race([
    translator.translate(text),
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ]);

/**
 * Looks a term up. A phrase missing from every dictionary (a selected phrase) is shown
 * as written on the page, with its short translation from the built-in translator
 * (`machineTranslated`; left out when it does not come in time) and a note with its
 * main word's translation; its IPA comes from the language pack.
 */
export async function describeTerm(
  term: { key: string; kind: TermKind; surface: string; category?: Category },
  {
    send,
    lang,
    sourceUrl,
    translator,
    translationWaitMs = TRANSLATION_WAIT_MS,
  }: DescribeDeps,
): Promise<TermCard> {
  const lookup = (key: string, kind: TermKind) =>
    send({ type: "lookup", lang, key, kind, sourceUrl });
  const found = await lookup(term.key, term.kind);
  const { entry } = found;
  const ipa = entry?.ipa ?? found.ipa;

  let short = entry?.short;
  let machineTranslated = false;
  let sub: string | undefined;
  if (term.kind === "phrase") {
    const main = mainWord(term.key, rulesFor(lang));
    const [translated, word] = await Promise.all([
      short === undefined
        ? translateWithin(translator, term.surface, translationWaitMs)
        : undefined,
      lookup(main, "word"),
    ]);
    if (short === undefined && translated !== undefined) {
      short = translated;
      machineTranslated = true;
    }
    if (word.entry) sub = `${main} — ${word.entry.short}`;
  } else {
    sub = inflectionNote(term.surface, term.key);
  }

  return {
    key: term.key,
    kind: term.kind,
    // A phrase is keyed by its words' base forms ("heavy lift"); show it as written.
    head: entry?.head ?? (term.kind === "phrase" ? term.surface : term.key),
    ...(ipa !== undefined && { ipa }),
    ...(short !== undefined && { short }),
    ...(entry?.glossLang !== undefined && { glossLang: entry.glossLang }),
    ...(sub !== undefined && { sub }),
    ...(machineTranslated && { machineTranslated: true as const }),
    status: found.status,
    ...(found.status === "new" &&
      term.category === "known" && { knownByLevel: true as const }),
    termId: found.termId,
    senses: entry?.senses ?? [],
    elsewhere: found.elsewhere,
  };
}
