import { cleanDefinition } from "../core/lexicon/definitions";
import type {
  DictionaryEntry,
  DictionaryProvider,
} from "../core/lexicon/dictionary";
import { translatedLine } from "../core/lexicon/short-lines";
import { matchSense, orderMeanings, type Meaning } from "../core/meanings";
import type { MeaningLine, YourMeaning } from "../messaging/protocol";
import type { TermStore } from "./term-store";

type TermMeanings = Awaited<ReturnType<TermStore["meaningsOf"]>>;

/** A dictionary meaning in a language other than the native one (an English definition). */
const foreign = (m: Meaning, nativeLang: string) =>
  m.from === "dictionary" &&
  m.glossLang !== undefined &&
  m.glossLang !== nativeLang;

/**
 * The cleaned definitions (`cleanDefinition`) the meanings' lines are translated from:
 * the translation cache is read for these.
 */
export function definitionsToTranslate(
  meanings: Iterable<Meaning>,
  nativeLang: string,
): string[] {
  const texts = new Set<string>();
  for (const m of meanings) {
    const text = foreign(m, nativeLang) ? cleanDefinition(m.text) : undefined;
    if (text !== undefined) texts.add(text);
  }
  return [...texts];
}

/** How the line of a meaning is made: the dictionary, its entry, cached translations. */
export interface LineContext {
  nativeLang: string;
  /** Missing while the dictionary is not on the device: lines are the meanings' text. */
  dictionary?: Pick<DictionaryProvider, "senseLine">;
  entry?: Pick<DictionaryEntry, "senses">;
  /** Cached translations of cleaned definitions (`definitionsToTranslate`). */
  translations: Readonly<Record<string, string>>;
}

/**
 * A meaning as the hover card and the lists show it (`MeaningLine`): an AI meaning as
 * the model answered; a dictionary meaning as the dictionary makes the line of its
 * sense (`senseLine`, the entry's own sense when it still has it, for its hint), an
 * English definition in its cached translation (as the hover card shows a translated
 * line) or else in English. A line with nothing left is the meaning's text.
 */
export function lineOf(
  m: Meaning,
  o: LineContext,
): { line: string; lineLang?: string } {
  if (m.from === "ai") return { line: m.text };
  if (foreign(m, o.nativeLang)) {
    const text = cleanDefinition(m.text);
    const translated =
      text !== undefined && Object.hasOwn(o.translations, text)
        ? o.translations[text]
        : undefined;
    if (translated) return { line: translatedLine(translated, o.nativeLang) };
  }
  const senses = o.entry?.senses ?? [];
  const sense = senses[matchSense(m, senses)] ?? m;
  const line = o.dictionary?.senseLine(sense, m.glossLang) || m.text;
  return {
    line,
    ...(foreign(m, o.nativeLang) && { lineLang: m.glossLang }),
  };
}

/**
 * The term's meanings named by its choices, with how many sentences each was chosen
 * for and its line, the one chosen at `here` first (`orderMeanings`), and that one's key.
 */
export function yourMeanings(
  { meanings, choices }: TermMeanings,
  here: { url: string; sentence: string } | undefined,
  lines: LineContext,
): { yourMeanings: YourMeaning[]; chosenHere?: string } {
  const chosenHere =
    here &&
    choices.find((c) => c.url === here.url && c.sentence === here.sentence)
      ?.meaningKey;
  const uses = new Map<string, { count: number; lastAt: number }>();
  for (const { meaningKey, at } of choices) {
    const use = uses.get(meaningKey);
    if (use) {
      use.count++;
      use.lastAt = Math.max(use.lastAt, at);
    } else uses.set(meaningKey, { count: 1, lastAt: at });
  }
  const ordered = orderMeanings(
    meanings.flatMap((m) => {
      const use = uses.get(m.key);
      return use ? [{ ...m, ...use }] : [];
    }),
    chosenHere,
  );
  return {
    yourMeanings: ordered.map((m): YourMeaning => ({
      key: m.key,
      from: m.from,
      text: m.text,
      ...(m.glossLang !== undefined && { glossLang: m.glossLang }),
      ...(m.pos !== undefined && { pos: m.pos }),
      ...(m.explanation !== undefined && { explanation: m.explanation }),
      count: m.count,
      ...lineOf(m, lines),
    })),
    ...(chosenHere !== undefined && { chosenHere }),
  };
}

/** The term's meanings as the lists show them: most chosen first, then the newest. */
export function meaningLines(
  meanings: TermMeanings,
  lines: LineContext,
): MeaningLine[] {
  return yourMeanings(meanings, undefined, lines).yourMeanings.map(
    (m): MeaningLine => ({
      key: m.key,
      line: m.line,
      ...(m.lineLang !== undefined && { lineLang: m.lineLang }),
      ...(m.from === "ai" && { ai: true as const }),
    }),
  );
}
