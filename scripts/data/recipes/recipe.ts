// Build recipes: a pair dictionary merged from human-made sources in order, where the
// first source that has a term supplies all of it (one source tag per term). See
// docs/specs/architecture.md "Native meanings and the quality gate".
import { shortOfDefinition } from "../../../src/core/lexicon/short-lines.ts";
import type { LemmaPack } from "../../../src/core/packs/types.ts";
import {
  eachEntry,
  posLabel,
  type KaikkiSense,
  type KaikkiTranslation,
} from "../common.ts";
import { isNonConstituent, isUsable, patternKey } from "../phrases.ts";

const MAX_SENSES = 4;
/** Translated words kept per translation-table sense. */
const MAX_WORDS = 3;

/**
 * Part of speech, text, and for translation-table and wordnet senses the English sense
 * (`hint`). A pointer sense, an edition's form of another word ("Pasado simple del
 * verbo (to) tell" on told), has no hint (null) and names its `target`, the term it
 * points to.
 */
export type PairSense = [
  pos: string,
  text: string,
  hint?: string | null,
  target?: string,
];

/** A pointer sense: one that names the term it is a form of. */
const isPointerSense = (sense: PairSense) => sense[3] !== undefined;
export interface SourceTerm {
  short: string;
  senses: PairSense[];
}
export type TermKey = (headword: string) => string | undefined;

/**
 * The key a headword is filed under, or undefined when it is not one Langle looks up: a
 * single word must be a vocabulary word written in lowercase (names and inflected forms
 * are left out); several words must form one of the phrase patterns.
 */
export function termKeyOf({
  vocab,
  lemmas,
  phrases,
}: {
  vocab: ReadonlySet<string>;
  lemmas: LemmaPack;
  phrases: ReadonlySet<string>;
}): TermKey {
  const isWord = (word: string) =>
    vocab.has(word) || Object.hasOwn(lemmas, word);
  return (headword) => {
    const word = headword.trim();
    if (!/\s/.test(word)) return vocab.has(word) ? word : undefined;
    const key = patternKey(word, isWord);
    return key && phrases.has(key) ? key : undefined;
  };
}

export function addSense(item: SourceTerm, sense: PairSense) {
  if (item.senses.length >= MAX_SENSES) return;
  if (item.senses.some(([, text]) => text === sense[1])) return;
  item.senses.push(sense);
}

function termOf(terms: Map<string, SourceTerm>, key: string) {
  let item = terms.get(key);
  if (!item) terms.set(key, (item = { short: "", senses: [] }));
  return item;
}

/** Drops terms that ended up without senses and sets each one's short meaning. */
export function finish(
  terms: Map<string, SourceTerm>,
  shortOfFirst: (text: string) => string,
) {
  for (const [key, item] of terms) {
    if (item.senses.length === 0) terms.delete(key);
    else item.short = shortOfFirst(item.senses[0]![1]);
  }
  return terms;
}

const posOf = (pos: unknown) => (typeof pos === "string" ? posLabel(pos) : "");

/** A stress mark: a combining acute or grave accent. */
const STRESS_MARK = /[\u0300\u0301]/u;

/** Cyrillic vowels, whose acute or grave accent marks stress (primary or secondary). */
const CYRILLIC_VOWEL = /[аеиоуыэюяіїєѣ]/iu;

/**
 * Native text as its readers write it: without the stress marks Wiktionary puts over
 * Cyrillic vowels for learners ("деньги" with an acute over its е, "идолопоклоннический"
 * with a grave over its и). A consonant's accent that makes a letter of its own
 * (Macedonian ѓ, ќ) stays.
 */
export function withoutStressMarks(text: string): string {
  const parts = text.normalize("NFD");
  if (!STRESS_MARK.test(parts)) return text;
  return parts
    .replace(
      /(\p{Script=Cyrillic})([\u0300\u0301])/gu,
      (marked, letter: string) =>
        !CYRILLIC_VOWEL.test(letter) && marked.normalize("NFC").length === 1
          ? marked
          : letter,
    )
    .normalize("NFC");
}

/** A heading ("==葡萄牙语==", "====翻译====") or a list item ("* 汉语：…") of a wiki page. */
const PAGE_MARKUP = /={2,}|\n\s*[*#]/;

/**
 * A gloss without the page structure the extraction let into it: cut where a heading
 * or a list item starts ("消色差透镜\n* 正体: …" → "消色差透镜").
 */
export function withoutPageMarkup(gloss: string) {
  const at = gloss.search(PAGE_MARKUP);
  return (at < 0 ? gloss : gloss.slice(0, at)).trim();
}

/** A pointer template needs this many distinct targets to count as the edition's syntax. */
const MIN_TEMPLATE_TARGETS = 3;

/** Where a template has its target. */
const SLOT = "{x}";

/** An English word as a gloss writes it (the learning language is English). */
const ENGLISH_WORD = /[A-Za-z][A-Za-z'-]*/g;

/** Notes in brackets, which say nothing of a pointer's syntax ("(he, she, it)"). */
const NOTES = /\([^()]*\)|（[^（）]*）|\[[^[\]]*\]/g;

/**
 * A gloss as pointer templates: `target` replaced by a slot where the gloss writes it
 * (one template per place: pt "passado simples do verbo do" writes "do" twice), also
 * quoted or after English's infinitive marker ("(to) tell", "to have"); notes in
 * brackets dropped; lower case, without closing punctuation ("Pasado simple del verbo
 * (to) tell." → "pasado simple del verbo {x}"). None when the gloss does not write the
 * target, or writes nothing else.
 */
export function pointerTemplates(gloss: string, target: string): string[] {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const written = new RegExp(
    `(?<![\\w-])["“«]?(?:\\(to\\)\\s*|to\\s+)?["“«]?${escaped}["”»]?(?![\\w-])`,
    "gi",
  );
  return [...gloss.matchAll(written)].flatMap((found) => {
    const template = (
      gloss.slice(0, found.index) +
      SLOT +
      gloss.slice(found.index + found[0].length)
    )
      .replace(NOTES, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s.:;。：；]+$/, "")
      .trim()
      .toLowerCase();
    return /\p{L}/u.test(template.replace(SLOT, "")) && template.includes(SLOT)
      ? [template]
      : [];
  });
}

/** A sense the source marks as a form or a variant of another word (kaikki's tags or fields). */
const isMarkedForm = (sense: KaikkiSense) =>
  Array.isArray(sense.form_of) ||
  Array.isArray(sense.alt_of) ||
  (sense.tags ?? []).some((tag) => tag === "form-of" || tag === "alt-of");

/** Senses no source meaning comes from: obsolete, archaic, misspelt. */
const UNUSED_TAGS = ["obsolete", "archaic", "misspelling"];

/** The English terms a gloss writes, other than the entry's own headword, in order. */
const termsWritten = (
  gloss: string,
  head: string,
  isTerm: (word: string) => boolean,
) =>
  (gloss.match(ENGLISH_WORD) ?? [])
    .map((word) => word.toLowerCase())
    .filter((word) => word !== head && isTerm(word));

/**
 * The term a marked form names: the word kaikki records (form_of, alt_of; "to have" →
 * have) when the gloss writes it. When kaikki records only English words that are no
 * term (a phrase: "absolute zero"), none; when it records none, or only words of
 * another language (pt "passado simples e particípio do verbo tell", whose form_of is
 * "particípio"), the last term the gloss writes.
 */
function markedTarget(
  sense: KaikkiSense,
  gloss: string,
  written: readonly string[],
): string | undefined {
  const named = [sense.form_of, sense.alt_of].flatMap((list: unknown) =>
    Array.isArray(list)
      ? list.flatMap((item: { word?: unknown } | undefined) =>
          typeof item?.word === "string"
            ? [
                item.word
                  .trim()
                  .toLowerCase()
                  .replace(/^to\s+/, ""),
              ]
            : [],
        )
      : [],
  );
  const found = named.find(
    (word) =>
      written.includes(word) && pointerTemplates(gloss, word).length > 0,
  );
  if (found) return found;
  return named.some((word) => /^[a-z][a-z' -]*$/.test(word))
    ? undefined
    : written.at(-1);
}

/** An edition's gloss as the recipes read it: without page markup and stress marks. */
const cleanGloss = (sense: KaikkiSense) => {
  const last: unknown = Array.isArray(sense.glosses)
    ? sense.glosses.at(-1)
    : undefined;
  if (typeof last !== "string") return undefined;
  const written = last.trim();
  return { written, gloss: withoutStressMarks(withoutPageMarkup(written)) };
};

/**
 * A native-language Wiktionary edition (kaikki's extract of it): its entries for English
 * words, whose glosses are in the native language. Each term
 * gets up to MAX_SENSES distinct usable senses, in file order; single-word proper-noun
 * entries and non-constituents are left out. Read over English Wiktionary itself, it
 * gives the English definitions (en-defs). `trimPeriod` drops the period that ends a
 * gloss made of one sentence (Wikcionario's "Luz." → "Luz", "微笑。" → "微笑"). Glosses
 * lose the page markup the extraction let in (`withoutPageMarkup`) and their stress
 * marks (`withoutStressMarks`); one that was only the headword and such markup is left
 * out.
 *
 * Pointer senses: the edition's own syntax for "form of X" is learned from the senses
 * it marks as forms or variants (`isMarkedForm`): each one's gloss with its target
 * replaced (`pointerTemplates`) is a template, kept when it has at least
 * MIN_TEMPLATE_TARGETS distinct targets, not all of them words of the edition's own
 * language (`native`, its kaikki code; some are: es "be" is the letter B and "lie" a
 * form of liar): es "pasado simple del verbo {x}", pt "passado simples do verbo {x}", ru
 * "форма третьего лица единственного числа глагола {x}", zh "{x} 的簡單過去時和過去時分詞";
 * not pl "po than lub as: {x}", where Wikisłownik's form_of links the Polish word of
 * "me", "him", "us" (ja, on, my). A sense whose gloss is a template with one of the
 * English terms it writes in the slot is a pointer to that term, marked or not (es
 * writes "Pasado simple del verbo (to) see" without marking it); a marked sense that
 * is no template is left out, as before (pl "he is → on jest" names "jest").
 */
export async function readEdition(
  path: string,
  termKey: TermKey,
  {
    trimPeriod = false,
    native,
  }: { trimPeriod?: boolean; native?: string } = {},
) {
  const isTerm = (word: string) => termKey(word) === word;
  /** template → its distinct targets */
  const learned = new Map<string, Set<string>>();
  /** The edition's own language's headwords, in lower case. */
  const nativeWords = new Set<string>();
  const read: {
    key: string;
    head: string;
    pos: string;
    senses: KaikkiSense[];
  }[] = [];
  const stats = await eachEntry(path, (entry) => {
    if (native !== undefined && entry.lang_code === native)
      nativeWords.add(entry.word.trim().toLowerCase());
    if (entry.lang_code !== "en") return;
    const head = entry.word.trim().toLowerCase();
    for (const sense of entry.senses ?? []) {
      const found = isMarkedForm(sense) ? cleanGloss(sense) : undefined;
      if (!found) continue;
      const target = markedTarget(
        sense,
        found.gloss,
        termsWritten(found.gloss, head, isTerm),
      );
      if (!target) continue;
      for (const template of pointerTemplates(found.gloss, target)) {
        let targets = learned.get(template);
        if (!targets) learned.set(template, (targets = new Set()));
        targets.add(target);
      }
    }
    // A proper-noun entry (a name) gives no meaning of a word ("Light"), but a phrase
    // pattern may be one ("Midas touch").
    if (entry.pos === "name" && !/\s/.test(entry.word.trim())) return;
    if (isNonConstituent(entry)) return;
    const key = termKey(entry.word);
    if (!key) return;
    read.push({ key, head, pos: posOf(entry.pos), senses: entry.senses ?? [] });
  });
  const templates = new Set(
    [...learned]
      .filter(
        ([, targets]) =>
          targets.size >= MIN_TEMPLATE_TARGETS &&
          [...targets].some((target) => !nativeWords.has(target)),
      )
      .map(([template]) => template),
  );
  /** The term a gloss points to in one of the edition's templates. */
  const pointerOf = (gloss: string, head: string, sense: KaikkiSense) => {
    const written = termsWritten(gloss, head, isTerm);
    const marked = isMarkedForm(sense)
      ? markedTarget(sense, gloss, written)
      : undefined;
    return [...(marked ? [marked] : []), ...written].find((word) =>
      pointerTemplates(gloss, word).some((template) => templates.has(template)),
    );
  };
  const terms = new Map<string, SourceTerm>();
  let pointers = 0;
  for (const { key, head, pos, senses } of read)
    for (const sense of senses) {
      if ((sense.tags ?? []).some((tag) => UNUSED_TAGS.includes(tag))) continue;
      const found = cleanGloss(sense);
      if (!found) continue;
      const { written, gloss } = found;
      // Page markup with only the headword before it ("adoring\n====翻译====…") is no
      // gloss; a gloss that is the headword itself is (a loanword: "pizza").
      if (!gloss || (gloss !== written && gloss.toLowerCase() === head))
        continue;
      const text =
        trimPeriod && /^[^.。]+[.。]$/.test(gloss) ? gloss.slice(0, -1) : gloss;
      const target = pointerOf(gloss, head, sense);
      if (target !== undefined) {
        pointers++;
        addSense(termOf(terms, key), [pos, text, null, target]);
      } else if (isUsable(sense)) addSense(termOf(terms, key), [pos, text]);
    }
  return {
    terms: finish(terms, shortOfDefinition),
    stats: { ...stats, pointers, templates: templates.size },
    templates,
  };
}

const senseLabel = (text: unknown) =>
  typeof text === "string" && text.trim() ? text.trim() : undefined;

/**
 * English Wiktionary's translation tables (kaikki's English extract) into the native
 * language (`langCodes`, such as ["pt"] or ["cmn"]): per English sense, its words in
 * that language, at most MAX_WORDS, with the English sense label as the hint (the
 * table's own label, else the sense's gloss). `langs`: only the rows of these
 * languages (kaikki's names), for a language whose tables nest varieties under it
 * ("Chinese Mandarin", not "Chinese" rows tagged Hokkien or Dungan). A word loses its
 * stress marks (`withoutStressMarks`: the Russian tables mark stress); `word` then
 * rewrites it, or drops it by returning undefined.
 */
export async function readTranslationTables(
  path: string,
  {
    langCodes,
    langs,
    termKey,
    word: rewrite = (w) => w,
  }: {
    langCodes: string[];
    langs?: string[];
    termKey: TermKey;
    word?: (word: string) => string | undefined;
  },
) {
  const codes = new Set(langCodes);
  const names = langs && new Set<unknown>(langs);
  const terms = new Map<string, SourceTerm>();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    const key = termKey(entry.word);
    if (!key) return;
    const pos = posOf(entry.pos);
    // hint → words, in the order the senses first appear
    const groups = new Map<string, string[]>();
    const add = (
      translations: KaikkiTranslation[] | undefined,
      fallbackHint: string | undefined,
    ) => {
      for (const translation of translations ?? []) {
        if (!codes.has(translation?.lang_code as string)) continue;
        if (names && !names.has(translation.lang)) continue;
        if (typeof translation.word !== "string") continue;
        const written = rewrite(withoutStressMarks(translation.word.trim()));
        if (!written) continue;
        const hint = senseLabel(translation.sense) ?? fallbackHint;
        if (!hint) continue;
        let words = groups.get(hint);
        if (!words) groups.set(hint, (words = []));
        if (words.length < MAX_WORDS && !words.includes(written))
          words.push(written);
      }
    };
    add(entry.translations, undefined);
    for (const sense of entry.senses ?? []) {
      const gloss: unknown = Array.isArray(sense.glosses)
        ? sense.glosses.at(-1)
        : undefined;
      add(
        sense.translations,
        typeof gloss === "string" ? shortOfDefinition(gloss.trim()) : undefined,
      );
    }
    for (const [hint, words] of groups)
      addSense(termOf(terms, key), [pos, words.join(", "), hint]);
  });
  // The short meaning is the first sense's first word.
  return { terms: finish(terms, (text) => text.split(", ")[0]!), stats };
}

/**
 * A translation-table word in the last of the scripts it is written in: Chinese rows
 * give the traditional form, then the simplified one ("麵包 /面包" → "面包"; a word
 * the same in both is written once).
 */
export const lastScriptForm = (word: string) => word.split(" /").at(-1)!.trim();

/**
 * A source's terms with their native text rewritten by `convert` (traditional
 * Chinese characters → simplified ones), the English hints as they are: each word of a
 * sense once, each sense once.
 */
export function convertTerms(
  terms: Map<string, SourceTerm>,
  convert: (text: string) => string,
) {
  for (const item of terms.values()) {
    const senses: PairSense[] = [];
    for (const [pos, text, hint, target] of item.senses) {
      const converted = [...new Set(convert(text).split(", "))].join(", ");
      if (senses.some(([, other]) => other === converted)) continue;
      senses.push(
        target !== undefined
          ? [pos, converted, null, target]
          : hint == null
            ? [pos, converted]
            : [pos, converted, hint],
      );
    }
    item.senses = senses;
    item.short = convert(item.short);
  }
  return terms;
}

/**
 * Merges the sources (in order of preference): each term comes whole from the first
 * source that has it, as [short, senses, source index]. A term that only points
 * (every sense of it a pointer: pt "used", "passado … do verbo use") comes whole from
 * the first later source that has a meaning for it (the tables' "usado,
 * acostumado"), and stays with its pointers when none has.
 */
export function mergeSources(
  sources: { tag: string; terms: Map<string, SourceTerm> }[],
) {
  const dict: Record<string, [string, PairSense[], number]> = {};
  const counts: Record<string, number> = {};
  const means = (senses: readonly PairSense[]) =>
    senses.some((sense) => !isPointerSense(sense));
  sources.forEach(({ tag, terms }, index) => {
    counts[tag] = 0;
    for (const [key, { short, senses }] of terms) {
      if (Object.hasOwn(dict, key)) {
        const [, taken, from] = dict[key]!;
        if (means(taken) || !means(senses)) continue;
        counts[sources[from]!.tag]!--;
      }
      dict[key] = [short, senses, index];
      counts[tag]++;
    }
  });
  return { dict, sources: sources.map(({ tag }) => tag), counts };
}
