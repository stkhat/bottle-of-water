import type {
  DefsPack,
  DictPack,
  IpaPack,
  LemmaPack,
  PairPack,
  PosPack,
  SensePosPack,
} from "../packs/types";
import { nativeLanguage } from "../natives";
import { kindOfKey } from "../term-id";
import { own } from "../util";
import type { Compound } from "./compounds";
import { cleanDefinition, definitionPointer } from "./definitions";
import { ipaFor } from "./ipa";
import { lookup, type Entry, type Sense } from "./lookup";
import {
  accepts,
  conflicts,
  AUXILIARY_BASE,
  hasAuxiliarySense,
  inOrder,
  isAuxiliary,
  senseOrder,
} from "./sense-order";
import {
  capitalKey,
  cleanShort,
  degreeOf,
  definitionLine,
  editionLine,
  fitsPairCap,
  japaneseForm,
  japanesePointer,
  keyOf,
  pointerLine,
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
   * (`shortLines`), a pointer followed to the entry it names. For an entry glossed in
   * another language, which is translated at display time: `short` as a line of that
   * language (within its cap), shown until it is translated.
   */
  lines: string[];
  senses: Sense[];
  /**
   * Language of `short` and `senses` when it is not the native language (an English
   * definition of a phrase no translation covers: "en").
   */
  glossLang?: string;
  /**
   * A contraction's expansions, for the card's note ("I'm → I am"), when its lines are
   * meanings of its own that do not write it out (`withContractions`).
   */
  expansion?: string;
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
   * A dictionary with capitalised headwords apart (en-ja, the recipe pairs) gives, for
   * a capitalised word or an acronym, that headword's senses first when they have a
   * meaning (`capitalMeaning`), and leaves the capitalised senses out otherwise; for a
   * word in lower case, the lowercase headword's senses alone; and when the page does
   * not say, the lowercase senses, then the capitalised ones (en-ja), or the lowercase
   * ones alone (a recipe pair). In a recipe pair, a word with only capitalised
   * headwords (Thursday, I'm) takes them however it is written.
   *
   * `pos` is the part of speech the word's tag gives it on the page (`Span.pos`): the
   * hover card's lines then show the senses of that part of speech first when the
   * first sense is labelled with another (rule A2, `senseOrder`); an entry shown by
   * its short meaning alone (an English definition) takes that from the first of them.
   * `senses` stay in the dictionary's order.
   *
   * `clitic`: what a contraction's clitic stands for on the page, when its sentence
   * decides (`Span.clitic`: "has" in "he's been"); a contraction then names that
   * expansion alone (`withContractions`). Other dictionaries ignore it.
   */
  entry(
    term: string,
    written?: Written,
    pos?: string,
    clitic?: string,
  ): DictionaryEntry | undefined;
  /** What rule A1 reads of a headword; undefined when the dictionary does not have it. */
  outline(term: string): EntryOutline | undefined;
  /**
   * What the word's capitalised headword means, when that is not about one person, a
   * people or a symbol (not Mark → 聖マルコ, Frank → フランク人): "word" when its gloss
   * says what it is (Japan → 日本, June → 6月, Texas → テキサス州), "name" when the gloss
   * only writes the name in the native language (Germany → ドイツ, Helen → ヘレン).
   * A recipe pair's comes from its data build (Japan → Japón "name", January → enero
   * "word"; no person's name first has a "word" meaning there). Rule D keeps a name's
   * meaning by it. Undefined without such a headword.
   */
  capitalMeaning(term: string): CapitalMeaning | undefined;
  /**
   * One sense as a short line, as the hover card's lines make it (`lines` before they
   * are ordered and followed): a meaning the user chose shows so in the hover card and
   * the lists. `glossLang`: the language of the sense when it is not the native one
   * (an English definition). Empty when nothing of it is left (only notes).
   */
  senseLine(sense: Pick<Sense, "text" | "hint">, glossLang?: string): string;
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

const NO_POS: PosPack = {};

/**
 * An entry as a source has it, with the hover card's lines (none: `short` alone) and
 * the language of its glosses when that is not the native one.
 */
type Found = Entry & {
  lines?: string[];
  glossLang?: string;
  /** The headword as the card writes it, when not as keyed (German "Vater"). */
  head?: string;
};

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

/** An entry's outline; `read` reads each sense, given its place in the entry. */
function outlineOf(
  senses: readonly Sense[],
  read: (text: string, index: number) => ReturnType<SenseReading>,
): EntryOutline | undefined {
  const [first, ...rest] = senses.map((sense, i) => read(sense.text, i));
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
  senseLine: DictionaryProvider["senseLine"],
  capitalMeaning: (head: string) => CapitalMeaning | undefined = () =>
    undefined,
): DictionaryProvider {
  /** Outlines are read for every analyzed word with a tag: each headword's once. */
  const outlines = new Map<string, EntryOutline | undefined>();
  return {
    senseLine,
    capitalMeaning: (term) => capitalMeaning(keyOf(term)),
    outline: (term) => {
      const head = keyOf(term);
      if (!outlines.has(head)) outlines.set(head, outline(head));
      return outlines.get(head);
    },
    entry: (term, written, pos) => {
      const head = keyOf(term);
      const found = find(head, written, pos);
      if (!found) return undefined;
      const headIpa = ipaFor(head, ipa);
      // An auxiliary read as its base shows no meaning unless the base has auxiliary
      // senses (`AUXILIARY_BASE`).
      const bare = pos === AUXILIARY_BASE && !hasAuxiliarySense(found.senses);
      return {
        head: found.head ?? head,
        kind: kindOfKey(head),
        ...(headIpa !== undefined && { ipa: headIpa }),
        short: found.short,
        lines: bare ? [] : (found.lines ?? [found.short]),
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
  const japanese = (head: string, pos: PosPack) => {
    const found = lookup(head, data.dict, pos, data.sensePos);
    if (!found) return lookup(head, data.phrases, NO_POS);
    return head.includes(".")
      ? coreFirst(found, own(data.dict, head)![1])
      : found;
  };
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
    const title = capitalOf(head);
    const upper = capitalOf(head, true);
    // A capitalised word EJDict has no lower-case entry for: its abbreviation comes
    // before the English definitions ("Nov" is November, not the slang "nov"). A word
    // with no lower-case entry takes its capitalised one however it is written (a
    // capital-only word: AI → 人工知能, Tokyo → 東京).
    if (!lower)
      return (
        (written && abbreviationOf(head)) ??
        (written === "upper" ? (upper ?? title) : (title ?? upper))
      );
    if (written === undefined)
      return [title, upper].reduce<Entry>(
        (entry, other) => (other ? joined(entry, other) : entry),
        lower,
      );
    // A word read as its capitalised headword is that word alone, written as the
    // headword is: "U.S." is no "u.s." (ubi supra), "Turkey" no turkey.
    if (written === "capital" || !upper)
      return meaningOf(title) ? { ...title!, head: capitalKey(head) } : lower;
    return meaningOf(upper, true)
      ? { ...upper, head: capitalKey(head, true) }
      : lower;
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
            // In the order of the form's own part of speech ("seeの過去": a verb),
            // else of the tag.
            const formPos =
              found.senses.find(
                (sense) => japaneseForm(sense.text)?.target === target,
              )?.pos ?? pos;
            return entry && inPosOrder(entry.senses, linesOf(entry), formPos);
          },
        }),
      };
    },
    (head) => {
      const found = japanese(head, data.pos);
      return found
        ? outlineOf(found.senses, japaneseSense)
        : definitionOutline(head, data.defs);
    },
    // EJDict's senses and Wiktionary's translations, or an English definition.
    (sense, glossLang) =>
      glossLang === undefined
        ? cleanShort(sense.text)
        : definitionLine(sense.text, definitionPointerOf),
    (head) => meaningOf(capitalOf(head)),
  );
}

/**
 * `dictionary` with the head of a capital-only word written as the word is (AI, iPhone,
 * Tokyo; its key is "ai"): `headOf(key)`, from the learning language's pack, gives it.
 * The hover card, the dictionary window and the word list show it, and speech says it.
 */
export function withWrittenHeads(
  dictionary: DictionaryProvider,
  headOf: (key: string) => string | undefined,
): DictionaryProvider {
  return {
    ...dictionary,
    entry(term, written, pos, clitic) {
      const found = dictionary.entry(term, written, pos, clitic);
      const head = found && headOf(found.head);
      return head === undefined ? found : { ...found!, head };
    },
  };
}

/**
 * A line's first item, without brackets or an English article: "pistachio (nut)" →
 * "pistachio"; "route, trail" → "route"; "railway/railroad or rail transport" →
 * "railway"; "a key" → "key" (a joined compound line is read as one phrase: "key +
 * noise", not "a key + noise").
 */
const firstItem = (line: string) =>
  line
    .replace(/\s*\([^()]*\)/g, "")
    .split(/[,;] /)[0]!
    .split(/\/|\s+or\s+/)[0]!
    .trim()
    .replace(/^(?:an?|the)\s+(?=\S)/i, "");

/**
 * The hover lines of a compound from its parts' entries: each part's first meaning,
 * joined as the note joins the parts ("Taube + Shirt": "pigeon + shirt"; a part's
 * sense as a part where the pack gives one, `asParts`: "Bahn": railway), then the
 * head's second line ("Preis + Klasse": "price + form", "class"). Judged blind on 150
 * compounds (L2-2), learners were served better by the parts' meanings (good 50–62%)
 * than by the head's alone (none good; acceptable 84–98%, "Bahnsystem": system),
 * preferred 58 : 26. A joined line wider than a line's cap gives way to the head's
 * lines.
 */
function compoundLines(
  parts: readonly DictionaryEntry[],
  asParts: readonly (DictionaryEntry | undefined)[] = [],
): string[] {
  const head = parts.at(-1)!;
  const joined = parts
    .map((part, i) => {
      const line = asParts[i] ?? part;
      return firstItem(line.lines[0] ?? line.short);
    })
    .join(" + ");
  return fitsPairCap(joined, true)
    ? [joined, ...head.lines.slice(1, 2)]
    : head.lines;
}

/**
 * The key suffix of a word's sense as a compound's part in a learning pack's
 * dictionary ("bahn-": railway, where "Bahn" leads with "route, trail"), from the
 * etymologies of its compounds (scripts/data/compound-senses.ts).
 */
const COMPOUND_PART = "-";

/**
 * `dictionary` reading a closed compound it has no entry for (`compoundOf`, the
 * learning pack's `LanguagePack.compound`: "Bahnsystem", "Verdauungsenzyme") by its
 * parts (`compoundLines`), with the head's senses for the dictionary window, the
 * card's headword the compound's key written as the head's is ("Verdauungsenzym"),
 * and its parts' headwords as the card's note ("Verdauung + Enzym"). Rule A1 reads its
 * head's outline.
 */
export function withCompounds(
  dictionary: DictionaryProvider,
  compoundOf: (key: string) => Compound | undefined,
): DictionaryProvider {
  return {
    ...dictionary,
    outline(term) {
      const own = dictionary.outline(term);
      if (own) return own;
      const head = (
        compoundOf(capitalised(term)) ?? compoundOf(term)
      )?.parts.at(-1);
      return head === undefined ? undefined : dictionary.outline(head);
    },
    entry(term, written, pos, clitic) {
      const found = dictionary.entry(term, written, pos, clitic);
      if (found) return found;
      // Read as the page writes it: in lower case an adjective, else a noun.
      const compound = compoundOf(
        written === "lower" ? term : capitalised(term),
      );
      if (!compound) return undefined;
      const parts = compound.parts.map((part, i, all) =>
        i === all.length - 1
          ? dictionary.entry(part, written, pos)
          : dictionary.entry(part),
      );
      if (parts.some((part) => part === undefined)) return undefined;
      const entries = parts as DictionaryEntry[];
      // Each part's sense as a compound's part, where the pack gives one
      // (COMPOUND_PART: "bahn-", railway).
      const asParts = compound.parts.map((part) =>
        dictionary.entry(`${part}${COMPOUND_PART}`),
      );
      const head = entries.at(-1)!;
      const capital = /^\p{Lu}/u.test(head.head);
      return {
        head: capital ? capitalised(compound.key) : compound.key,
        kind: "word",
        short: head.short,
        lines: compoundLines(entries, asParts),
        senses: head.senses,
        ...(head.glossLang !== undefined && { glossLang: head.glossLang }),
        expansion: entries.map((part) => part.head).join(" + "),
      };
    },
  };
}

/**
 * `dictionary` writing a phrase's headword in the case the language writes its words
 * (a language that capitalises its nouns: German "auf jeden Fall", "nach Hause", "zu
 * tun haben"; the pack keys phrases in lower case): each word as the card writes its
 * likeliest base (`lemmas`, the word itself first when it is a headword), capitalised
 * where that base's card is (its first line a capitalised headword's: Fall, Haus;
 * not tun, whose verb comes before the noun Tun).
 */
export function withPhraseCase(
  dictionary: DictionaryProvider,
  lemmas: (word: string) => readonly string[],
): DictionaryProvider {
  const capitalHead = (word: string) => {
    const base = lemmas(word)[0];
    const head = base === undefined ? undefined : dictionary.entry(base)?.head;
    return head !== undefined && /^\p{Lu}/u.test(head);
  };
  return {
    ...dictionary,
    entry(term, written, pos, clitic) {
      const found = dictionary.entry(term, written, pos, clitic);
      if (!found || !/\s/.test(found.head)) return found;
      const head = found.head
        .split(" ")
        .map((word) => (capitalHead(word) ? capitalised(word) : word))
        .join(" ");
      return head === found.head ? found : { ...found, head };
    },
  };
}

/** An entry's lines (one per sense) in rule A2's order for `pos`. */
const inPosOrder = (
  senses: readonly Sense[],
  lines: readonly string[],
  pos: string | undefined,
) =>
  pos === undefined
    ? [...lines]
    : inOrder(
        lines,
        senseOrder(senses, pos, (i) => lines[i] !== ""),
      );

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

/**
 * An EJDict abbreviation (a headword with a period) whose senses spell out other
 * expansions in English before its core Japanese translation (『』) leads with that
 * translation: EJDict files a lower-case abbreviation with its capitals ("PM,P.M.,p.m."),
 * so p.m. is 午後, not paymaster. `raw`: its senses as the pack writes them, 『』 marks
 * kept.
 */
function coreFirst(entry: Entry, raw: readonly string[]): Entry {
  const core = raw.findIndex(
    (text) => text.includes("『") && JAPANESE.test(text),
  );
  if (core <= 0 || raw.slice(0, core).some((text) => JAPANESE.test(text)))
    return entry;
  const first = entry.senses[core]!;
  return {
    short: cleanShort(first.text),
    senses: [first, ...entry.senses.filter((sense) => sense !== first)],
  };
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

/**
 * The order of an entry's definitions for a word tagged `pos` (rule A2). `lines`: its
 * definitions' lines (`definitionLinesOf`), read only with a `pos`.
 */
function definitionOrder(
  senses: readonly Sense[],
  pos: string | undefined,
  lines: () => readonly string[],
) {
  if (pos === undefined) return undefined;
  const found = lines();
  return senseOrder(senses, pos, (i) => found[i] !== "");
}

/**
 * An entry's definitions as the hover card's lines (`lines`, its definitions' lines),
 * in `order` (rule A2), pointers followed within `defs`.
 */
function definitionLines(
  head: string,
  entry: Entry,
  lines: readonly string[],
  defs: DefsPack,
  order?: readonly number[],
) {
  return shortLines(inOrder(lines, order), entry.short, {
    head,
    pointer: definitionPointerOf,
    follow: (target) => {
      const found = definitionOf(target, defs);
      return found && definitionLinesOf(found.senses);
    },
  });
}

/**
 * An English definition from en-defs, translated at display time (`glossLang: "en"`):
 * its short meaning alone, from the sense rule A2 puts first for a word tagged `pos`.
 * Until it is translated (no translator, or not yet), the card shows the short meaning
 * as a definition's line (`definitionLine`: within the English cap) in its `lines`. A
 * short meaning that only points to another term is not translated, so the card shows
 * it as written, with that term's definitions.
 */
function definitionInEnglish(
  head: string,
  defs: DefsPack,
  pos?: string,
): Found | undefined {
  const found = definitionOf(head, defs);
  if (!found) return undefined;
  let lines: readonly string[] | undefined;
  const linesOf = () => (lines ??= definitionLinesOf(found.senses));
  const order = definitionOrder(found.senses, pos, linesOf);
  const short =
    order === undefined
      ? found.short
      : shortOfDefinition(found.senses[order[0]!]!.text);
  return {
    ...found,
    short,
    glossLang: "en",
    lines:
      definitionPointer(short) !== undefined
        ? definitionLines(head, found, linesOf(), defs, order)
        : [definitionLine(short, definitionPointerOf)],
  };
}

/** A key written with a capital: "vater" → "Vater". */
const capitalised = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/**
 * An entry with its capitalised headword's senses first (`Sense.capital`), for a word
 * the page writes capitalised in a way that counts: German "Sie" inside a sentence is
 * the polite "you", not "she". Unchanged when it has none, or only those.
 */
function capitalFirst(entry: Entry): Entry {
  const capital = entry.senses.filter((sense) => sense.capital);
  if (capital.length === 0 || capital.length === entry.senses.length)
    return entry;
  return {
    short: shortOfDefinition(capital[0]!.text),
    senses: [...capital, ...entry.senses.filter((sense) => !sense.capital)],
  };
}

/**
 * Senses with their part of speech, already in the native language (Spanish → English).
 * A word the page writes capitalised in a way that counts (`written` "capital") shows
 * its capitalised headword's senses first, where the pack marks them (German: Sie →
 * "you (polite)"), then in rule A2's order for its tag; the card writes the headword
 * capitalised when its first line is one of those (German nouns: "Vater", "Essen" read
 * as the noun, "essen" as the verb).
 */
export function createDefsDictionary({
  defs,
  ipa,
}: {
  defs: DefsPack;
  ipa: IpaPack;
}): DictionaryProvider {
  return dictionaryOver(
    ipa,
    (head, written, pos) => {
      const own = definitionOf(head, defs);
      if (!own) return undefined;
      const found = written === "capital" ? capitalFirst(own) : own;
      const lines = definitionLinesOf(found.senses);
      const order = definitionOrder(found.senses, pos, () => lines);
      const capital = found.senses[order?.[0] ?? 0]?.capital === true;
      return {
        ...found,
        lines: definitionLines(head, found, lines, defs, order),
        ...(capital && { head: capitalised(head) }),
      };
    },
    (head) => definitionOutline(head, defs),
    (sense) => definitionLine(sense.text, definitionPointerOf),
  );
}

type PairSenses = PairPack[string][1];

/**
 * A dictionary built by a recipe (English → Spanish): the pair pack, whose senses from
 * translation tables carry their English sense as a hint, then the English definitions
 * (`glossLang: "en"`, translated at display time).
 *
 * The pack's pointer senses (an edition's forms: told → "Pasado simple del verbo (to)
 * tell") name their target, so pointers are read in every native language without
 * parsing its glosses: the hover follows one to its target's meanings, in rule A2's
 * order for the pointer sense's own part of speech, else for the word's tag (told →
 * contar before tell's noun "a tell", also where the tagger reads "made" as a noun).
 * A degree the edition leaves unmarked is read as a pointer too (`degreeOf`, with the
 * learning language's `lemmas` and `pos`). With a tag, the word's own meanings of
 * another part of speech come after the followed ones (es better/JJ → "comparativo
 * irregular de good", bueno, then the verb "mejorar"). An auxiliary's senses its
 * source calls auxiliary come first (`senseOrder`: en-it have → avere, essere).
 *
 * Where a first pointer shows, by the pointer sense's grammatical kind (its part of
 * speech: a verb's form is an inflection, an adjective's or adverb's a comparative or
 * superlative), while a meaning shows (2026-11-18):
 * - an auxiliary ("has been"): first and whole, as it is what the word means there;
 * - a verb inflection in a spaced script: second, after its base's first meaning
 *   (sold → vender, "pasado simple del verbo sell"): meaning first, form second; in a
 *   dense script (`native` Chinese), first, as Japanese shows its pointers;
 * - any other form (best → "superlativo de good", bueno; children → "plural de
 *   child"): first.
 * Except for an auxiliary's, a pointer wider than the line cap is left out (is → ser /
 * estar). The dictionary window keeps every pointer (`senses`).
 *
 * Capitalised headwords (Japan → Japón, January → enero, Thursday → jueves) are kept
 * apart under `capitalKey` and read as written, as en-ja reads EJDict's (`asWritten`);
 * what each one means comes with it (`capitalMeaning`).
 */
export function createPairDictionary({
  dict,
  defs,
  ipa,
  native,
  lemmas = {},
  pos: learningPos = {},
}: {
  dict: PairPack;
  defs: DefsPack;
  ipa: IpaPack;
  /** The native language (`NATIVE_LANGUAGES`); without one, a spaced script. */
  native?: string;
  /** The learning language's base forms and parts of speech, to read unmarked degrees. */
  lemmas?: LemmaPack;
  pos?: PosPack;
}): DictionaryProvider {
  const dense = native !== undefined && nativeLanguage(native)?.dense === true;
  /** Whether the pair writes most of its nouns capitalised (`nounsCapitalised`), read once. */
  let nounCased: boolean | undefined;
  const nounCase = () => (nounCased ??= nounsCapitalised(dict));
  /** Unmarked degrees read as pointers: their line stays a gloss's, cut to the cap. */
  const degrees = new WeakSet<PairSenses[number]>();
  /** A term's entry, with its unmarked degrees read as pointers (`degreeOf`). */
  const entryOf = (head: string): PairPack[string] | undefined => {
    const found = own(dict, head);
    const bases = [own(lemmas, head) ?? []].flat();
    if (!found || bases.length === 0) return found;
    const [short, senses, source] = found;
    return [
      short,
      senses.map((sense) => {
        const target = degreeOf(sense, head, bases, learningPos);
        if (target === undefined) return sense;
        const degree = [sense[0], sense[1], null, target] as const;
        degrees.add(degree);
        return degree;
      }),
      source,
    ];
  };
  const sensesOf = (senses: PairSenses): Sense[] =>
    senses.map(([pos, text, hint]) => ({
      pos,
      text,
      ...(hint != null && { hint }),
    }));
  const lineOf = (sense: PairSenses[number]) => {
    const [, text, hint, target] = sense;
    return target !== undefined && !degrees.has(sense)
      ? pointerLine(text)
      : pairLine({ text, ...(hint != null && { hint }) });
  };
  /**
   * A term's meanings (not its pointers) in rule A2's order for `pos`: each one's line
   * and part of speech.
   */
  const meaningsOf = (head: string, pos: string | undefined) => {
    const found = entryOf(head);
    if (!found) return undefined;
    const meanings = found[1].filter(
      (sense) => sense[3] === undefined || degrees.has(sense),
    );
    const lines = meanings.map(lineOf);
    const order =
      pos === undefined
        ? undefined
        : senseOrder(sensesOf(meanings), pos, (i) => lines[i] !== "");
    return inOrder(
      meanings.map(([sensePos], i) => ({ line: lines[i]!, pos: sensePos })),
      order,
    );
  };
  /**
   * The word's capitalised headwords, kept apart (`capitalKey`): written with a capital
   * (Japan, January), or as an acronym (TV, WHO), as en-ja keeps EJDict's.
   */
  const capitalOf = (head: string, acronym = false) =>
    own(dict, capitalKey(head, acronym)) as CapitalEntry | undefined;
  /**
   * The entry as the word was written (`DictionaryProvider.entry`), as en-ja's: for a
   * capitalised word its capitalised headword first when that means something, for
   * one written in capitals its acronym ("US" → EE. UU.; else the capitalised one), so
   * a capitalised "And" or "It's" is not ET or IT. Where the page does not say (a
   * sentence start, a caseless document), the lowercase entry alone: "Who" is not the
   * WHO. A word with no lowercase entry takes its capitalised one however it is
   * written: no lowercase copies are kept (Thursday, I'm). A word read as its
   * capitalised headword is that word alone, and the card writes it so (`head`).
   */
  const asWritten = (
    head: string,
    written: Written | undefined,
  ): { found?: PairPack[string] | CapitalEntry; head?: string } => {
    const lower = entryOf(head);
    const title = capitalOf(head);
    const acronym = written === "upper" && capitalOf(head, true) !== undefined;
    const capital = acronym ? capitalOf(head, true) : title;
    if (!lower) return { found: capital ?? title ?? capitalOf(head, true) };
    if (!capital || written === "lower" || written === undefined)
      return { found: lower };
    return capital[3] !== undefined
      ? { found: capital, head: capitalKey(head, acronym) }
      : { found: lower };
  };
  return dictionaryOver(
    ipa,
    (head, written, pos) => {
      const { found, head: capitalHead } = asWritten(head, written);
      if (!found) return definitionInEnglish(head, defs, pos);
      const [short, raw] = found;
      const senses = sensesOf(raw);
      // A translation table's sense is a list of words: its line is the first one. With
      // a tag, a sense of an open class the tag cannot mean shows no line while one it
      // can mean does (`onTag`: es better/JJR, not the verb "mejorar"). Not for a
      // plural's own senses ("nuts": crazy), as a plural's tag says little of them.
      const plural =
        pos === "noun" &&
        raw.some((sense) => sense[0] === "noun" && sense[3] !== undefined);
      const lines = caseOnce(
        onTag(
          raw.map((sense) => ({
            line: lineOf(sense),
            pos: sense[0],
            meaning: sense[3] === undefined,
          })),
          plural ? undefined : pos,
        ),
        written,
        nounCase,
      ).map(({ line }) => line);
      const usable = (i: number) => lines[i] !== "";
      const order =
        pos === undefined ? undefined : senseOrder(senses, pos, usable);
      const first = inOrder(raw, order).find((_, i) => usable(order?.[i] ?? i));
      // An unmarked degree is read as a pointer only where it leads; elsewhere it
      // stays the meaning it was ("better" untagged: "mejorar", then "comparativo
      // irregular de good").
      const points = (sense: PairSenses[number]) =>
        sense[3] !== undefined && (sense === first || !degrees.has(sense));
      // A line a meaning shows too is that meaning's (a degree's line that is also the
      // line of a meaning of another part of speech).
      const meaningLine = new Set(lines.filter((_, i) => !points(raw[i]!)));
      const pointers = new Map<string, Pointer>();
      const pointerPos = new Map<string, string>();
      const linePos = new Map<string, string>();
      raw.forEach((sense, i) => {
        const [sensePos, , , target] = sense;
        // A pointer the tag leaves without a line (`onTag`) says nothing of how its
        // target is read (it needs/VBZ: not as need's plural, "bisogno").
        if (!points(sense) || lines[i] === "" || meaningLine.has(lines[i]!))
          return;
        pointers.set(lines[i]!, { kind: "form", target: target! });
        if (!linePos.has(lines[i]!)) linePos.set(lines[i]!, sensePos);
        if (!pointerPos.has(target!)) pointerPos.set(target!, sensePos);
      });
      const second = (line: string) => !dense && linePos.get(line) === "verb";
      const quiet = (line: string) =>
        linePos.has(line) && !fitsPairCap(line, second(line));
      // With a tag, after a first form that is a verb's or a degree, the word's own
      // meanings of another part of speech than the form's come after its base's
      // (needs/VBZ: necesitar before the noun "carencia"). Not after a plural: its own
      // senses of another part of speech are the plural's own uses ("nuts": crazy,
      // "times": multiplied by), judged better than more of its base's.
      const linesPos =
        pos === undefined ||
        isAuxiliary(pos) ||
        first === undefined ||
        !points(first) ||
        first[0] === "noun"
          ? undefined
          : first[0];
      const aside = new Set<string>();
      const away = (line: string, sensePos: string) => {
        if (linesPos !== undefined && !accepts(linesPos, sensePos))
          aside.add(line);
      };
      raw.forEach((sense, i) => {
        if (!points(sense)) away(lines[i]!, sense[0]);
      });
      return {
        short,
        lines: shortLines(inOrder(lines, order), short, {
          head,
          pointer: (line) => pointers.get(line),
          follow: (target) => {
            const along = pointerPos.get(target) ?? pos;
            // An auxiliary's base is ordered as one ("has been": haber, not tener),
            // its senses kept as the pointer sense's part of speech keeps them.
            const found = meaningsOf(target, isAuxiliary(pos) ? pos : along);
            // The target's meanings the form can have (told: tell's verbs, not "a tell").
            const meanings =
              found && caseOnce(onTag(found, along), written, nounCase);
            meanings?.forEach((meaning) => away(meaning.line, meaning.pos));
            return meanings?.map((meaning) => meaning.line);
          },
          aside: (line) => aside.has(line),
          ...(!isAuxiliary(pos) && { quiet, second }),
        }),
        senses,
        ...(capitalHead !== undefined && { head: capitalHead }),
      };
    },
    (head) => {
      const found = entryOf(head) ?? capitalOf(head) ?? capitalOf(head, true);
      if (!found) return definitionOutline(head, defs);
      const raw = found[1];
      return outlineOf(sensesOf(raw), (text, i) => {
        const target = raw[i]?.[3];
        // An unmarked degree after the first sense is a meaning, as in the lines.
        return target === undefined || (i > 0 && degrees.has(raw[i]!))
          ? englishSense(text)
          : { formOf: target, meaning: false };
      });
    },
    (sense, glossLang) =>
      glossLang === undefined
        ? pairLine(sense)
        : definitionLine(sense.text, definitionPointerOf),
    (head) => capitalOf(head)?.[3],
  );
}

/**
 * A recipe pair's capitalised headword (pack format 3): a term, and what its meaning
 * is when it means something (the data build's `capitalDictionary`: "name" when its
 * gloss is the name in the native language, "word" when it says what it is; none for
 * a gloss that is the headword itself, a class of names, or a use of a person's name).
 */
type CapitalEntry = readonly [...PairPack[string], meaning?: CapitalMeaning];

/**
 * Rule A2 over a pair's senses, whose parts of speech the source states: for a word
 * tagged `pos`, the lines of senses it cannot mean (`conflicts`: an open class the tag
 * does not accept) are emptied while a line of one it can mean is left (es better/JJR:
 * "mejor", not the verb "mejorar"; told → tell's verbs, not the noun "a tell"). As it
 * was without a tag, or when every line is of another part of speech (a mistag: the
 * lines are all there is).
 */
function onTag<T extends { line: string; pos: string }>(
  items: readonly T[],
  pos: string | undefined,
): T[] {
  if (pos === undefined) return [...items];
  const off = items.map((item) => conflicts(pos, item.pos));
  if (!items.some((item, i) => item.line !== "" && !off[i])) return [...items];
  return items.map((item, i) => (off[i] ? { ...item, line: "" } : item));
}

/**
 * Whether a pair writes most of its nouns' meanings capitalised (German: "Haus"), read
 * from its lowercase terms' noun senses, as the data build reads its edition's
 * (`capitalNouns`): there case tells a noun from another word, and English's case says
 * nothing of it (`caseOnce`).
 */
function nounsCapitalised(dict: PairPack): boolean {
  let upper = 0;
  let lower = 0;
  for (const [key, [, senses]] of Object.entries(dict)) {
    if (key !== key.toLowerCase()) continue;
    for (const [pos, text, , target] of senses) {
      if (pos !== "noun" || target !== undefined) continue;
      const letter = /\p{L}/u.exec(text)?.[0];
      if (letter === undefined) continue;
      if (letter !== letter.toLowerCase()) upper++;
      else if (letter !== letter.toUpperCase()) lower++;
    }
  }
  return upper > lower;
}

/** A part of speech as case variants compare it: a proper noun is a noun. */
const posClass = (pos: string) => (pos === "proper noun" ? "noun" : pos);

/**
 * Lines equal apart from case, of the same part of speech (a proper noun counts as a
 * noun), are one line: es "Congreso" (the capitalised headword's, joined) and
 * "congreso" (the lowercase one's), it "paese" and "Paese" in one table, ru "Бог" and
 * "бог". The line stays where the first one is, written as the page writes the word:
 * capitalised where it is capitalised or in capitals ("Congreso"), else in lower case
 * (it assumption: "supposizione / assunzione", not the feast "Assunzione"). Where case
 * marks another part of speech, both stay ("Englisch", the language, and "englisch",
 * English); and in a pair that writes its nouns capitalised (`nounCase`, German), case
 * is part of every word, and English's says nothing of it (de irish: "irisch", the
 * adjective, and "Irisch", the language, both stay): no list of languages. Pointers
 * (`meaning` false) are left as they are.
 */
function caseOnce<T extends { line: string; pos: string; meaning?: boolean }>(
  items: readonly T[],
  written: Written | undefined,
  nounCase: () => boolean,
): T[] {
  const capital = written === "capital" || written === "upper";
  const groups = new Map<string, number[]>();
  items.forEach((item, i) => {
    if (item.line === "" || item.meaning === false) return;
    const id = `${posClass(item.pos)}\n${item.line.toLowerCase()}`;
    const group = groups.get(id);
    if (group) group.push(i);
    else groups.set(id, [i]);
  });
  const out = [...items];
  for (const group of groups.values()) {
    const variants = group.map((i) => items[i]!.line);
    if (new Set(variants).size < 2 || nounCase()) continue;
    const chosen =
      variants.find((line) => /^\P{L}*\p{Lu}/u.test(line) === capital) ??
      variants[0]!;
    group.forEach((i, k) => {
      out[i] = { ...items[i]!, line: k === 0 ? chosen : "" };
    });
  }
  return out;
}

/**
 * A pair sense's line: an edition's gloss as `editionLine` makes it; a translation
 * table's sense is a list of words, and its line is the first one.
 */
const pairLine = ({ text, hint }: Pick<Sense, "text" | "hint">) =>
  hint === undefined ? editionLine(text) : text.split(", ")[0]!.trim();

/** The outline of a headword's English definitions, when it has some. */
function definitionOutline(
  head: string,
  defs: DefsPack,
): EntryOutline | undefined {
  const definition = definitionOf(head, defs);
  return definition && outlineOf(definition.senses, englishSense);
}

function definitionOf(head: string, defs: DefsPack): Entry | undefined {
  const found = own(defs, head);
  if (!found) return undefined;
  const [short, senses] = found;
  return {
    short,
    senses: senses.map(([pos, text, use]) => ({
      pos,
      text,
      ...(use === "auxiliary" && { auxiliary: true as const }),
      ...(use === "capital" && { capital: true as const }),
      ...((use === "singular" || use === "plural") && { number: use }),
    })),
  };
}
