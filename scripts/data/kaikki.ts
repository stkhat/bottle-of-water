// kaikki.org English Wiktionary extract (CC BY-SA) → public/packs/en/{lemmas,ipa,pos,names}.json
// Usage: node scripts/data/kaikki.ts [path]   (default data/raw/kaikki-en.jsonl; run ejdict.ts first)
import { singleIpa } from "../../src/core/lexicon/ipa.ts";
import type {
  DictPack,
  IpaPack,
  LemmaPack,
  NamesPack,
  PosPack,
} from "../../src/core/packs/types.ts";
import {
  eachEntry,
  KAIKKI_PATH,
  posLabel,
  readDictPacks,
  readPack,
  writePack,
  type KaikkiEntry,
} from "./common.ts";
import { PACKS } from "./formats.ts";

const INFLECTION_TAGS = new Set([
  "plural",
  "past",
  "participle",
  "present",
  "third-person",
  "comparative",
  "superlative",
]);
const IGNORED_TAGS = new Set([
  "alternative",
  "obsolete",
  "archaic",
  "dialectal",
  "misspelling",
  "pronunciation-spelling",
  "nonstandard",
]);
// Entries whose forms are not inflections of a real word: letters and symbols.
const NO_FORMS_POS = new Set(["character", "symbol"]);
const ROMAN_NUMERAL =
  /^(?=[mdclxvi])m*(c[md]|d?c{0,3})(x[cl]|l?x{0,3})(i[xv]|v?i{0,3})$/;
const US_TAGS = new Set(["General-American", "US"]);
interface Bucket {
  pos: string[];
  phonemicIpa?: string;
  anyIpa?: string;
  untaggedIpa?: string;
  /** form → base */
  bases: Map<string, string>;
}

// An entry that is only a misspelling (or obsolete, dialectal…) of another word
// does not give its forms to its headword ("we'll": misspelling of well → better).
function hasOwnForms(entry: KaikkiEntry) {
  if (entry.pos && NO_FORMS_POS.has(entry.pos)) return false;
  if (entry.pos === "num" && ROMAN_NUMERAL.test(entry.word.toLowerCase()))
    return false;
  const senses = entry.senses ?? [];
  return !(
    senses.length > 0 &&
    senses.every((sense) =>
      (sense.tags ?? []).some(
        (tag) => tag !== "alternative" && IGNORED_TAGS.has(tag),
      ),
    )
  );
}

// No accent tag: the pronunciation shared by all accents, US included. A stressed or
// strong form counts too ("my", "would"); a weak form or a dialect note does not.
function isSharedPronunciation(tags: string[], note: string | undefined) {
  if (!tags.every((tag) => tag === "stressed")) return false;
  return !note || /strong form|General American/.test(note);
}

function addEntry(bucket: Bucket, base: string, entry: KaikkiEntry) {
  if (typeof entry.pos === "string") {
    const label = posLabel(entry.pos);
    if (!bucket.pos.includes(label)) bucket.pos.push(label);
  }
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa !== "string") continue;
    const ipa = singleIpa(sound.ipa);
    if (ipa === undefined) continue;
    const tags = sound.tags ?? [];
    const phonemic = ipa.startsWith("/");
    if (tags.some((tag) => US_TAGS.has(tag))) {
      bucket.anyIpa ??= ipa;
      if (phonemic) bucket.phonemicIpa ??= ipa;
    } else if (phonemic && isSharedPronunciation(tags, sound.note)) {
      bucket.untaggedIpa ??= ipa;
    }
  }
  if (!hasOwnForms(entry)) return;
  for (const { form, tags = [] } of entry.forms ?? []) {
    if (typeof form !== "string") continue;
    if (!tags.some((tag) => INFLECTION_TAGS.has(tag))) continue;
    if (tags.some((tag) => IGNORED_TAGS.has(tag))) continue;
    const lower = form.trim().toLowerCase();
    if (lower === base || /\s/.test(lower) || !/\p{L}/u.test(lower)) continue;
    bucket.bases.set(lower, base);
  }
}

// A form that is itself a vocabulary word ("is", "does", "this") keeps a base only when
// one of its own entries has an inflection sense "form of <base>" that is not rare,
// obsolete…, and either that sense is a verb inflection or the form's EJDict gloss names
// the base ("doの三人称…"). This drops does → doe, has → ha, news → new, this → Thi.
const NOT_CONFIRMING_TAGS = new Set([...IGNORED_TAGS, "rare"]);

/** form → base → whether a verb entry confirms it */
type Confirmations = Map<string, Map<string, { verb: boolean }>>;

function addConfirmations(
  confirmations: Confirmations,
  form: string,
  entry: KaikkiEntry,
) {
  for (const sense of entry.senses ?? []) {
    const tags = sense.tags ?? [];
    if (!Array.isArray(sense.form_of)) continue;
    if (!tags.some((tag) => INFLECTION_TAGS.has(tag))) continue;
    if (tags.some((tag) => NOT_CONFIRMING_TAGS.has(tag))) continue;
    for (const { word } of sense.form_of) {
      if (typeof word !== "string") continue;
      // "comparative degree of good and well"
      for (const base of word.toLowerCase().split(/\s*,\s*|\s+and\s+/)) {
        if (!base) continue;
        let byBase = confirmations.get(form);
        if (!byBase) confirmations.set(form, (byBase = new Map()));
        const confirmation = byBase.get(base) ?? { verb: false };
        confirmation.verb ||= entry.pos === "verb";
        byBase.set(base, confirmation);
      }
    }
  }
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function isConfirmed(
  confirmation: { verb: boolean } | undefined,
  form: string,
  base: string,
  dict: DictPack,
) {
  if (!confirmation) return false;
  if (confirmation.verb) return true;
  const gloss = (dict[form]?.[1] ?? []).join(" / ");
  return new RegExp(`(^|[^a-z])${escapeRegExp(base)}』?\\s*の`, "i").test(
    gloss,
  );
}

/** A name as written in text: a capital, then at least one lowercase letter (not an acronym). */
const NAME_WORD = /^\p{Lu}\p{Ll}[\p{L}']*$/u;
/**
 * Parts of speech of a capitalised entry that make the word a capitalised common word
 * (English, Christian, Monday as an adverb, God as an interjection): rule D never takes
 * it for a name. A capitalised noun does not count, since most names have one (Mark,
 * the currency; Rachel, the haircut).
 */
const COMMON_CAPITALIZED_POS = new Set(["adj", "adv", "verb", "intj"]);

/** The kinds of name a sense can name, as `NamesPack` letters. */
const NAME_TYPES: readonly [letter: string, test: RegExp][] = [
  ["g", /\bgiven name\b|\bdiminutive of\b.*\bname\b/],
  ["s", /\bsurname\b/],
  [
    "p",
    /\b(city|town|village|country|state of|province|capital|river|island|county|region|mountain|lake|sea|ocean|continent|district|suburb|borough|peninsula|desert)\b/,
  ],
  [
    "o",
    /\b(company|corporation|organi[sz]ation|university|brand|band|political party|agency|newspaper|team|club|airline|manufacturer)\b/,
  ],
];

const categoryNames = (categories: KaikkiEntry["categories"]) =>
  (categories ?? [])
    .map((c) => (typeof c === "string" ? c : String(c?.name ?? "")))
    .join(" ");

/**
 * The kinds of name a `name` entry names, sense by sense (given, surname, place,
 * organisation, else other: x), each once, in the order its senses give them: the
 * first is its main kind.
 */
export function nameTypes(entry: KaikkiEntry): string {
  const types = new Set<string>();
  for (const sense of entry.senses ?? []) {
    const text =
      `${(sense.glosses ?? []).filter((g) => typeof g === "string").join(" ")} | ${categoryNames(sense.categories)}`.toLowerCase();
    const found = NAME_TYPES.filter(([, test]) => test.test(text));
    if (found.length === 0) types.add("x");
    for (const [letter] of found) types.add(letter);
  }
  return types.size > 0 ? [...types].join("") : "x";
}

/** Collects the names lexicon from every English entry (`importKaikki` feeds it). */
function createNames() {
  const types = new Map<string, Set<string>>();
  const common = new Set<string>();
  return {
    add(entry: KaikkiEntry) {
      const word = entry.word.replaceAll("’", "'");
      if (!NAME_WORD.test(word)) return;
      const key = word.toLowerCase();
      if (entry.pos === "name") {
        let found = types.get(key);
        if (!found) types.set(key, (found = new Set()));
        for (const letter of nameTypes(entry)) found.add(letter);
      } else if (entry.pos && COMMON_CAPITALIZED_POS.has(entry.pos))
        common.add(key);
    },
    /**
     * Each name that is a vocabulary word or a given name → its types, with "!" when
     * the word is also a capitalised common word.
     */
    pack(words: ReadonlySet<string>): NamesPack {
      const names: Record<string, string> = {};
      for (const [key, found] of types) {
        if (!words.has(key) && !found.has("g")) continue;
        names[key] = [...found].join("") + (common.has(key) ? "!" : "");
      }
      return names;
    },
  };
}

/**
 * Collects, for each vocabulary word, its inflected forms, US IPA and parts of speech.
 * Entries spelt exactly like the vocabulary word win; entries in another casing (Monday
 * for "monday") are used only when there are none.
 */
export async function importKaikki(
  path: string,
  vocab: Iterable<string>,
  dict: DictPack = {},
) {
  const words = new Set(vocab);
  const exact = new Map<string, Bucket>();
  const folded = new Map<string, Bucket>();
  const confirmations: Confirmations = new Map();
  const names = createNames();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    names.add(entry);
    const base = entry.word.toLowerCase();
    if (!words.has(base)) return;
    if (entry.word === base) addConfirmations(confirmations, base, entry);
    const buckets = entry.word === base ? exact : folded;
    let bucket = buckets.get(base);
    if (!bucket) buckets.set(base, (bucket = { pos: [], bases: new Map() }));
    addEntry(bucket, base, entry);
  });

  const lemmaSets = new Map<string, Set<string>>();
  const ipa: Record<string, string> = {};
  const pos: Record<string, string[]> = {};
  for (const word of words) {
    const bucket = exact.get(word) ?? folded.get(word);
    if (!bucket) continue;
    if (bucket.pos.length > 0) pos[word] = bucket.pos;
    const usIpa = bucket.phonemicIpa ?? bucket.anyIpa ?? bucket.untaggedIpa;
    if (usIpa) ipa[word] = usIpa;
    for (const form of bucket.bases.keys()) {
      let bases = lemmaSets.get(form);
      if (!bases) lemmaSets.set(form, (bases = new Set()));
      bases.add(word);
    }
  }
  const lemmas: Record<string, string | string[]> = {};
  for (const [form, bases] of lemmaSets) {
    const sorted = [...bases]
      .filter((base) => base.length > 1)
      .filter(
        (base) =>
          !words.has(form) ||
          isConfirmed(confirmations.get(form)?.get(base), form, base, dict),
      )
      .sort();
    if (sorted.length > 0)
      lemmas[form] = sorted.length === 1 ? sorted[0]! : sorted;
  }
  return {
    lemmas: lemmas as LemmaPack,
    ipa: ipa as IpaPack,
    pos: pos as PosPack,
    names: names.pack(words),
    stats,
  };
}

async function main() {
  const dict = readDictPacks<DictPack[string]>(PACKS["en-ja"].dir);
  const vocab = readPack<string[]>("en/vocab.json");
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { lemmas, ipa, pos, names, stats } = await importKaikki(
    path,
    vocab,
    dict,
  );
  writePack("en/lemmas.json", lemmas);
  writePack("en/ipa.json", ipa);
  writePack("en/pos.json", pos);
  writePack("en/names.json", names);
  console.log(
    `kaikki: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${Object.keys(lemmas).length} lemma forms, ${Object.keys(ipa).length} IPA, ` +
      `${Object.keys(pos).length} words with parts of speech, ` +
      `${Object.keys(names).length} names`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
