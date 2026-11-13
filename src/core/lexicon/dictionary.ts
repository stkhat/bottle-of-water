import type {
  DefsPack,
  DictPack,
  IpaPack,
  PairPack,
  PosPack,
  SensePosPack,
} from "../packs/types";
import { kindOfKey } from "../term-id";
import { own } from "../util";
import { cleanDefinition, definitionPointer } from "./definitions";
import { ipaFor } from "./ipa";
import { lookup, type Entry, type Sense } from "./lookup";
import { inOrder, senseOrder } from "./sense-order";
import {
  cleanShort,
  definitionLine,
  japaneseForm,
  japanesePointer,
  shortLines,
  shortOfDefinition,
  type Pointer,
} from "./short-lines";

export type { Sense };

export interface DictionaryEntry {
  /** The term as looked up: a base form, or a phrase's base forms joined by spaces. */
  head: string;
  kind: "word" | "phrase";
  ipa?: string;
  /** Short translation (the dictionary window, the word list). */
  short: string;
  /**
   * The hover card's meanings, one per line: up to three senses as short lines
   * (`shortLines`), a pointer followed to the entry it names. Only `short` for an
   * entry glossed in another language, which is translated at display time.
   */
  lines: string[];
  senses: Sense[];
  /**
   * Language of `short` and `senses` when it is not the native language (an English
   * definition of a phrase no translation covers: "en").
   */
  glossLang?: string;
}

/**
 * How a word was written where it is looked up, when the page says: in lower case,
 * capitalised in a way that counts (Japan), or as an acronym (US). Left out for a
 * caseless document, a capital at a sentence start, the word list.
 */
export type Written = "lower" | "capital" | "upper";

/**
 * What rule A1 needs to know of a headword to choose between a word's base forms
 * (`chooseKey`), read from its senses in the gloss language's pointer syntax.
 */
export interface EntryOutline {
  /**
   * The word its first sense says this one is a form of: went ("goの過去") → go,
   * better ("(good の比較級)いっそうよい") → good.
   */
  formOf?: string;
  /** Its first sense means something: no pointer, or a form with a meaning after it (better). */
  firstMeaning: boolean;
  /** Some sense means something (not every sense is a pointer). */
  meaning: boolean;
  /** The parts of speech its senses are labelled with (not those taken from neighbours). */
  pos: readonly string[];
}

export interface DictionaryProvider {
  /**
   * A dictionary with capitalised headwords apart (en-ja) gives, for a capitalised
   * word or an acronym, that headword's senses first when they have a meaning
   * (`capitalMeaning`), and leaves the capitalised senses out otherwise; for a word in
   * lower case, the lowercase headword's senses alone; and when the page does not say,
   * the lowercase senses, then the capitalised ones.
   *
   * `pos` is the part of speech the word's tag gives it on the page (`Span.pos`): the
   * hover card's lines then show the senses of that part of speech first when the
   * first sense is labelled with another (rule A2, `senseOrder`); an entry shown by
   * its short meaning alone (an English definition) takes that from the first of them.
   * `senses` stay in the dictionary's order.
   */
  entry(
    term: string,
    written?: Written,
    pos?: string,
  ): DictionaryEntry | undefined;
  /** What rule A1 reads of a headword; undefined when the dictionary does not have it. */
  outline(term: string): EntryOutline | undefined;
  /**
   * What the word's capitalised headword means, when that is not about one person, a
   * people or a symbol (not Mark → 聖マルコ, Frank → フランク人): "word" when its gloss
   * says what it is (Japan → 日本, June → 6月, Texas → テキサス州), "name" when the gloss
   * only writes the name in the native language (Germany → ドイツ, Helen → ヘレン).
   * Rule D keeps a name's meaning by it. Undefined without such a headword.
   */
  capitalMeaning(term: string): CapitalMeaning | undefined;
}

export type CapitalMeaning = "word" | "name";

export interface EnJaDictionaryData {
  /** en-ja/dict-<n>.json: EJDict */
  dict: DictPack;
  /** en-ja/pos.json: the parts of speech of EJDict's senses, from the data build */
  sensePos: SensePosPack;
  /** en-ja/capital.json: the senses of EJDict's capitalised headwords */
  capital: DictPack;
  /** en-ja/phrases.json: Japanese translations of phrases EJDict lacks */
  phrases: DictPack;
  /** en-defs: English definitions of phrases neither has */
  defs: DefsPack;
  pos: PosPack;
  ipa: IpaPack;
}

/** A term key: lowercase words separated by single spaces. */
const normalize = (term: string) =>
  term.toLowerCase().split(/\s+/).filter(Boolean).join(" ");

const NO_POS: PosPack = {};

/**
 * An entry as a source has it, with the hover card's lines (none: `short` alone) and
 * the language of its glosses when that is not the native one.
 */
type Found = Entry & { lines?: string[]; glossLang?: string };

/** What a sense is, as an outline counts it: the word it is a form of, and whether it means something. */
type SenseReading = (text: string) => { formOf?: string; meaning: boolean };

/** A Japanese sense: a form ("goの過去", "haveの過去形・…していた"), a reference ("=anyhow"), or a meaning. */
const japaneseSense: SenseReading = (text) => {
  const form = japaneseForm(text);
  if (form) return { formOf: form.target, meaning: form.rest !== "" };
  const line = cleanShort(text);
  return { meaning: line !== "" && japanesePointer(line) === undefined };
};

/** An English definition: a form ("Simple past of decide"), another pointer, or a meaning. */
const englishSense: SenseReading = (text) => {
  const pointer = definitionPointerOf(text);
  return pointer?.kind === "form" && pointer.target !== undefined
    ? { formOf: pointer.target, meaning: false }
    : { meaning: pointer === undefined };
};

function outlineOf(
  senses: readonly Sense[],
  read: SenseReading,
): EntryOutline | undefined {
  const [first, ...rest] = senses.map((sense) => read(sense.text));
  if (!first) return undefined;
  return {
    ...(first.formOf !== undefined && { formOf: first.formOf }),
    firstMeaning: first.meaning,
    meaning: first.meaning || rest.some((sense) => sense.meaning),
    pos: [
      ...new Set(
        senses.flatMap((sense) =>
          sense.pos !== undefined && sense.posBy !== "gap" ? [sense.pos] : [],
        ),
      ),
    ],
  };
}

function dictionaryOver(
  ipa: IpaPack,
  find: (head: string, written?: Written, pos?: string) => Found | undefined,
  outline: (head: string) => EntryOutline | undefined,
  capitalMeaning: (head: string) => CapitalMeaning | undefined = () =>
    undefined,
): DictionaryProvider {
  /** Outlines are read for every analyzed word with a tag: each headword's once. */
  const outlines = new Map<string, EntryOutline | undefined>();
  return {
    capitalMeaning: (term) => capitalMeaning(normalize(term)),
    outline: (term) => {
      const head = normalize(term);
      if (!outlines.has(head)) outlines.set(head, outline(head));
      return outlines.get(head);
    },
    entry: (term, written, pos) => {
      const head = normalize(term);
      const found = find(head, written, pos);
      if (!found) return undefined;
      const headIpa = ipaFor(head, ipa);
      return {
        head,
        kind: kindOfKey(head),
        ...(headIpa !== undefined && { ipa: headIpa }),
        short: found.short,
        lines: found.lines ?? [found.short],
        senses: found.senses,
        ...(found.glossLang !== undefined && { glossLang: found.glossLang }),
      };
    },
  };
}

/**
 * English → Japanese: EJDict, then Wiktionary's Japanese translations of phrases, then
 * Wiktionary's English definitions of phrases (`glossLang: "en"`). The hover card
 * follows a Japanese pointer ("goの過去", "=anyhow") to the entry it names.
 */
export function createEnJaDictionary(
  data: EnJaDictionaryData,
): DictionaryProvider {
  const japanese = (head: string, pos: PosPack) =>
    lookup(head, data.dict, pos, data.sensePos) ??
    lookup(head, data.phrases, NO_POS);
  const linesOf = (entry: Entry) =>
    entry.senses.map((sense) => cleanShort(sense.text));
  /** A capitalised headword's senses: the word's (Japan), or the acronym's (US). */
  const capitalOf = (head: string, acronym = false) => {
    const found = own(data.capital, acronym ? head.toUpperCase() : head);
    return found && lookup(head, { [head]: found }, data.pos);
  };
  const meaningOf = (entry: Entry | undefined, acronym = false) => {
    const first = acronym
      ? entry?.senses[0]
      : entry?.senses.find((sense) => JAPANESE.test(sense.text));
    if (!first || aboutOnePerson(first.text)) return undefined;
    // An acronym's expansion may be English words ("United Nations").
    if (acronym)
      return JAPANESE.test(first.text) || /\p{L}+\s+\p{L}+/u.test(first.text)
        ? "word"
        : undefined;
    return /^[\p{scx=Katakana}・＝=]+$/u.test(mainItem(first.text))
      ? "name"
      : "word";
  };
  /**
   * EJDict's abbreviation of a word written with a capital ("Nov." for Nov, "St." for
   * St): each sense that only spells out the abbreviation ("November") becomes the
   * first sense of the word it names (11月), with that word as its hint.
   */
  const abbreviationOf = (head: string): Entry | undefined => {
    if (/[\s.]/.test(head)) return undefined;
    const found = own(data.capital, `${head}.`);
    if (!found) return undefined;
    const senses = found[1].map((text): Sense => {
      const expansion = SPELLED_OUT.test(text)
        ? japanese(text.split(/[,;]/)[0]!.trim(), NO_POS)?.senses[0]
        : undefined;
      return expansion
        ? { ...expansion, hint: text.replace(/\.$/, "") }
        : { text };
    });
    return { short: cleanShort(senses[0]!.text), senses };
  };
  /** The entry as the word was written (`DictionaryProvider.entry`). */
  const asWritten = (head: string, written: Written | undefined) => {
    const lower = japanese(head, data.pos);
    if (written === "lower") return lower;
    // A capitalised word EJDict has no lower-case entry for: its abbreviation comes
    // before the English definitions ("Nov" is November, not the slang "nov").
    if (!lower) return written && abbreviationOf(head);
    const title = capitalOf(head);
    const upper = capitalOf(head, true);
    if (written === undefined)
      return [title, upper].reduce<Entry>(
        (entry, other) => (other ? joined(entry, other) : entry),
        lower,
      );
    const capital =
      written === "capital" || !upper
        ? meaningOf(title) && title
        : meaningOf(upper, true) && upper;
    return capital ? joined(capital, lower) : lower;
  };
  return dictionaryOver(
    data.ipa,
    (head, written, pos) => {
      const found = asWritten(head, written);
      if (!found) return definitionInEnglish(head, data.defs, pos);
      const lines = linesOf(found);
      const order =
        pos === undefined
          ? undefined
          : senseOrder(found.senses, pos, (i) => lines[i] !== "");
      return {
        ...found,
        lines: shortLines(inOrder(lines, order), found.short, {
          head,
          pointer: japanesePointer,
          follow: (target) => {
            const entry = japanese(target, NO_POS);
            return entry && linesOf(entry);
          },
        }),
      };
    },
    (head) => {
      const found = japanese(head, data.pos);
      if (found) return outlineOf(found.senses, japaneseSense);
      const definition = definitionOf(head, data.defs);
      return definition && outlineOf(definition.senses, englishSense);
    },
    (head) => meaningOf(capitalOf(head)),
  );
}

/** Kana or kanji: a sense with a Japanese gloss, not only a Latin name ("Ohio"). */
const JAPANESE = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

/** An abbreviation's sense that only spells it out in English ("November", "Democrat, Democratic"). */
const SPELLED_OUT = /^[A-Za-z][A-Za-z' ,;-]*\.?$/;

/** A sense's main item: its text outside brackets, without 『』 marks. */
const mainItem = (sense: string) =>
  sense
    .replace(/[(（[《〈][^)）\]》〉]*[)）\]》〉]/g, "")
    .replace(/[『』]/g, "")
    .trim();

/**
 * An EJDict sense of a capitalised headword that is about one bearer of the name, not
 * the name itself: a person's lifespan (1809‐1865), a saint or a biblical figure (聖),
 * a people (フランク人), a chemical symbol (記号), a character of a work
 * ([DickensのA Christmas Carol]).
 */
function aboutOnePerson(sense: string): boolean {
  return (
    /\d{3,4}\??\s*[‐–-]\s*\d{2,4}|[;(]\s*\d{5,8}\s*[;)]/.test(sense) ||
    /聖|記号|\[[^\]]*[A-Za-z]/.test(sense) ||
    mainItem(sense).endsWith("人")
  );
}

/** One entry's senses, then the other's that it does not have; the first one's short. */
function joined(first: Entry, then: Entry): Entry {
  const texts = new Set(first.senses.map((sense) => sense.text));
  return {
    short: first.short,
    senses: [
      ...first.senses,
      ...then.senses.filter((sense) => !texts.has(sense.text)),
    ],
  };
}

/**
 * A definition that says nothing of its own: a pointer, or nothing but a context
 * ("(of a person)").
 */
const definitionPointerOf = (line: string): Pointer | undefined =>
  definitionPointer(line) ??
  (cleanDefinition(line) === undefined ? { kind: "form" } : undefined);

const definitionLinesOf = (senses: readonly Sense[]) =>
  senses.map((sense) => definitionLine(sense.text, definitionPointerOf));

/** The order of an entry's definitions for a word tagged `pos` (rule A2). */
function definitionOrder(senses: readonly Sense[], pos: string | undefined) {
  if (pos === undefined) return undefined;
  const lines = definitionLinesOf(senses);
  return senseOrder(senses, pos, (i) => lines[i] !== "");
}

/**
 * An entry's definitions as the hover card's lines, in `order` (rule A2), pointers
 * followed within `defs`.
 */
function definitionLines(
  head: string,
  entry: Entry,
  defs: DefsPack,
  order?: readonly number[],
) {
  const linesOf = definitionLinesOf;
  return shortLines(inOrder(linesOf(entry.senses), order), entry.short, {
    head,
    pointer: definitionPointerOf,
    follow: (target) => {
      const found = definitionOf(target, defs);
      return found && linesOf(found.senses);
    },
  });
}

/**
 * An English definition from en-defs, translated at display time (`glossLang: "en"`):
 * its short meaning alone, from the sense rule A2 puts first for a word tagged `pos`.
 * A short meaning that only points to another term is not translated, so the card
 * shows it as written, with that term's definitions.
 */
function definitionInEnglish(
  head: string,
  defs: DefsPack,
  pos?: string,
): Found | undefined {
  const found = definitionOf(head, defs);
  if (!found) return undefined;
  const order = definitionOrder(found.senses, pos);
  const short =
    order === undefined
      ? found.short
      : shortOfDefinition(found.senses[order[0]!]!.text);
  return {
    ...found,
    short,
    glossLang: "en",
    ...(definitionPointer(short) !== undefined && {
      lines: definitionLines(head, found, defs, order),
    }),
  };
}

/** Senses with their part of speech, already in the native language (Spanish → English). */
export function createDefsDictionary({
  defs,
  ipa,
}: {
  defs: DefsPack;
  ipa: IpaPack;
}): DictionaryProvider {
  return dictionaryOver(
    ipa,
    (head, _written, pos) => {
      const found = definitionOf(head, defs);
      return (
        found && {
          ...found,
          lines: definitionLines(
            head,
            found,
            defs,
            definitionOrder(found.senses, pos),
          ),
        }
      );
    },
    (head) => {
      const found = definitionOf(head, defs);
      return found && outlineOf(found.senses, englishSense);
    },
  );
}

/**
 * A dictionary built by a recipe (English → Spanish): the pair pack, whose senses from
 * translation tables carry their English sense as a hint, then the English definitions
 * (`glossLang: "en"`, translated at display time).
 */
export function createPairDictionary({
  dict,
  defs,
  ipa,
}: {
  dict: PairPack;
  defs: DefsPack;
  ipa: IpaPack;
}): DictionaryProvider {
  const sensesOf = (senses: PairPack[string][1]): Sense[] =>
    senses.map(([pos, text, hint]) => ({
      pos,
      text,
      ...(hint !== undefined && { hint }),
    }));
  return dictionaryOver(
    ipa,
    (head, _written, pos) => {
      const found = own(dict, head);
      if (!found) return definitionInEnglish(head, defs, pos);
      const [short, raw] = found;
      const senses = sensesOf(raw);
      // A translation table's sense is a list of words: its line is the first one.
      const lines = raw.map(([, text, hint]) =>
        hint === undefined ? definitionLine(text) : text.split(", ")[0]!.trim(),
      );
      const order =
        pos === undefined
          ? undefined
          : senseOrder(senses, pos, (i) => lines[i] !== "");
      return { short, lines: shortLines(inOrder(lines, order), short), senses };
    },
    (head) => {
      const found = own(dict, head);
      if (found) return outlineOf(sensesOf(found[1]), englishSense);
      const definition = definitionOf(head, defs);
      return definition && outlineOf(definition.senses, englishSense);
    },
  );
}

function definitionOf(head: string, defs: DefsPack): Entry | undefined {
  const found = own(defs, head);
  if (!found) return undefined;
  const [short, senses] = found;
  return { short, senses: senses.map(([pos, text]) => ({ pos, text })) };
}
