// Japanese meanings of the words EJDict lacks, from the kaikki.org English Wiktionary
// extract's translation tables (CC BY-SA):
// - the capital-only words (rule E, en/capitals.json: AI, Tokyo, iPhone) →
//   data/packs/en-ja/capital.json, with EJDict's capitalised headwords (ejdict.ts writes
//   those; this writes the file again with both, so it can run again). An acronym's
//   meanings go under its capitals (AI), any other word's under its lower-case key
//   (tokyo, iphone), as EJDict's are kept;
// - the words rule E adds (data/gate/en-wiktionary-words.json: hitman, selfie) →
//   data/packs/en-ja/phrases.json, beside the phrases' meanings (phrases.ts writes
//   those; this adds the words, so it runs after it).
// A word with none is shown by its English definition (en-defs).
// Usage: node scripts/data/capital-words.ts [path]   (default data/raw/kaikki-en.jsonl;
// run ejdict.ts, kaikki.ts and phrases.ts first)
import type { CapitalsPack, DictPack } from "../../src/core/packs/types.ts";
import { basename } from "node:path";
import {
  eachEntry,
  GATE_DIR,
  KAIKKI_PATH,
  readPack,
  WIKTIONARY_WORDS_PATH,
  writePack,
  type KaikkiEntry,
} from "./common.ts";
import { parseEjdict, readEjdictText } from "./ejdict.ts";
import {
  acronymJapanese,
  entityJapanese,
  joinedAcronyms,
  joinedEntities,
} from "./wikidata.ts";
import { japaneseSenses } from "./phrases.ts";
import {
  entrySenses,
  rankCapitalSenses,
  rankSenses,
  type SourceSense,
} from "./senses.ts";

/** A translation with kana or kanji: not the English word written again ("AI", "ＡＴＭ"). */
const JAPANESE = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

/** A translation's romanization, which the tables put after it ("ＡＴＭ (ē-tī-emu)"). */
const ROMANIZATION = /\s*\([\p{Script=Latin}\s'’-]+\)$/u;

/** Where a capital-only word's meanings are kept: an acronym under its capitals. */
export const capitalEntryKey = (written: string) =>
  /\p{Ll}/u.test(written) ? written.toLowerCase() : written;

const isJapanese = ([word]: readonly [string, ...unknown[]]) =>
  JAPANESE.test(word);

/** Translations in kana or kanji, without their romanization. */
const inJapanese = <T extends readonly [string, string, ...string[]]>(
  list: readonly T[],
) =>
  list.flatMap((item): T[] =>
    isJapanese(item)
      ? [[item[0].replace(ROMANIZATION, ""), ...item.slice(1)] as unknown as T]
      : [],
  );

/** A word whose Japanese meanings are wanted (`tableMeanings`). */
export interface TableTerm {
  /** The key its meanings are kept under. */
  key: string;
  /** As written: the entries written so give its senses. */
  written: string;
  /**
   * A capital-only word: proper nouns' senses count, ranked as an initialism's
   * (`rankCapitalSenses`). A lower-case word's are not meanings of it ("Light"), and
   * its first sense is its main one (`rankSenses`).
   */
  capital: boolean;
}

/**
 * The words' Japanese meanings (by `key`), from the translation tables of the entries
 * written as they are: up to four senses, best first (Ebola the virus before the
 * river), each "《English sense》word,word" with its part of speech (rule C1, as a
 * phrase's), the translations in kana or kanji only, without their romanization.
 * Senses that only inflect another word are left out. A capital-only word's
 * abbreviation sense the tables translate into no Japanese takes the Japanese of what
 * it stands for, hinted by that (CPU: 《central processing unit》中央処理装置, from that
 * term's tables), so its card names it and a document that spells it out leads with
 * it. Not a lower-case word's: those are clippings of many words, each a guess in text
 * ("mm" → 月 for month in "Mm-hmm", "pre", "min"; judged blind, most of the wrong new
 * hovers). A word with no Japanese translation is left out.
 */
export async function tableMeanings(
  path: string,
  terms: readonly TableTerm[],
): Promise<Record<string, DictPack[string]>> {
  const byWritten = new Map(terms.map((term) => [term.written, term]));
  const senses = new Map<
    string,
    { senses: SourceSense[]; loose: [string, string, string][] }
  >();
  const expansions = new Set<string>();
  await eachEntry(path, (entry: KaikkiEntry) => {
    if (entry.lang_code !== "en") return;
    const written = entry.word.trim().replaceAll("’", "'");
    const term = byWritten.get(written);
    if (!term || (!term.capital && entry.pos === "name")) return;
    let found = senses.get(written);
    if (!found) senses.set(written, (found = { senses: [], loose: [] }));
    const read = entrySenses(entry, found.senses.length);
    for (const sense of read.senses) {
      if (sense.inflection) continue;
      found.senses.push(sense);
      if (
        term.capital &&
        sense.abbreviates !== undefined &&
        !sense.ja.some(isJapanese)
      )
        expansions.add(sense.abbreviates);
    }
    const pos = typeof entry.pos === "string" ? entry.pos : "";
    found.loose.push(
      ...read.looseJa.map(
        ([word, label]) => [word, label, pos] as [string, string, string],
      ),
    );
  });
  // What the abbreviations stand for: their Japanese, best sense first.
  const expanded = new Map<string, string[]>();
  if (expansions.size > 0) {
    const read = new Map<string, { senses: SourceSense[]; loose: string[] }>();
    await eachEntry(path, (entry: KaikkiEntry) => {
      const word = entry.word.trim();
      if (entry.lang_code !== "en" || !expansions.has(word)) return;
      let found = read.get(word);
      if (!found) read.set(word, (found = { senses: [], loose: [] }));
      const { senses: own, looseJa } = entrySenses(entry, found.senses.length);
      found.senses.push(...own.filter((sense) => !sense.inflection));
      found.loose.push(...looseJa.map(([word]) => word));
    });
    for (const [word, { senses: own, loose }] of read) {
      const ja = [
        ...rankSenses(own, word.includes(" ")).flatMap((sense) =>
          sense.ja.map(([item]) => item),
        ),
        ...loose,
      ].filter((item) => JAPANESE.test(item));
      if (ja.length > 0) expanded.set(word, [...new Set(ja)]);
    }
  }
  const withExpansion = (sense: SourceSense): SourceSense => {
    if (sense.abbreviates === undefined || sense.ja.some(isJapanese))
      return sense;
    const ja = expanded.get(sense.abbreviates);
    return ja
      ? { ...sense, ja: ja.map((item) => [item, sense.abbreviates!] as const) }
      : sense;
  };
  const meanings: Record<string, DictPack[string]> = {};
  for (const term of terms) {
    const found = senses.get(term.written);
    if (!found) continue;
    const own = found.senses.map((sense) => {
      const full = term.capital ? withExpansion(sense) : sense;
      return { ...full, ja: inJapanese(full.ja) };
    });
    const ranked = term.capital
      ? rankCapitalSenses(own)
      : rankSenses(own, false, { shown: true });
    const entry = japaneseSenses(ranked, inJapanese(found.loose));
    if (entry) meanings[term.key] = entry;
  }
  return meanings;
}

/**
 * The capital-only words' Japanese meanings (`capitals`, as written), keyed as
 * `capitalEntryKey` keeps them (`tableMeanings`).
 */
export const capitalMeanings = (path: string, capitals: readonly string[]) =>
  tableMeanings(path, capitals.map(capitalTerm));

const capitalTerm = (written: string): TableTerm => ({
  key: capitalEntryKey(written),
  written,
  capital: true,
});

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const vocab = new Set(readPack<string[]>("en/vocab.json"));
  // Capital-only words: not the vocabulary's abbreviations whose case the list keeps
  // (EJDict's "u.s." for U.S.).
  const capitals = readPack<CapitalsPack>("en/capitals.json").filter(
    (written) => !vocab.has(written.toLowerCase()),
  );
  // Rule E's words (no capital-only word's key is one).
  const added = readPack<string[]>(basename(WIKTIONARY_WORDS_PATH), GATE_DIR);
  const { capital } = parseEjdict(readEjdictText());
  const meanings = await tableMeanings(path, [
    ...capitals.map(capitalTerm),
    ...added.map((word) => ({ key: word, written: word, capital: false })),
  ]);
  const capitalKeys = new Set(capitals.map(capitalEntryKey));
  const capitalWords = Object.fromEntries(
    Object.entries(meanings).filter(([key]) => capitalKeys.has(key)),
  );
  // The words that joined from Wikidata (Nvidia, Shinkansen) mean their items: their
  // Japanese, not the tables' of an entry so written (BTS: 舞台裏, behind the scenes,
  // for the band); with none, their English definition (en-defs) shows instead.
  let fromEntities = 0;
  for (const [written, entity] of Object.entries(joinedEntities())) {
    const key = capitalEntryKey(written);
    if (Object.hasOwn(capital, key)) continue;
    const entry = entityJapanese(written, entity);
    if (entry) {
      capitalWords[key] = entry;
      fromEntities++;
    } else Reflect.deleteProperty(capitalWords, key);
  }
  // Acronyms known only by what they stand for (NYPD): each thing's Japanese, hinted by
  // its English name, which the card chooses by; a thing with none is defined in
  // English (en-defs).
  let fromAcronyms = 0;
  for (const [written, items] of Object.entries(joinedAcronyms())) {
    const entry = acronymJapanese(items);
    if (!entry || Object.hasOwn(capital, written)) continue;
    capitalWords[written] = entry;
    fromAcronyms++;
  }
  for (const key of Object.keys(capitalWords))
    if (Object.hasOwn(capital, key))
      throw new Error(`en-ja/capital.json has ${key} from EJDict`);
  writePack("en-ja/capital.json", { ...capital, ...capitalWords });
  // Beside the phrases: a key with no space is a word, written here.
  const words = Object.fromEntries(
    Object.entries(meanings).filter(([key]) => !capitalKeys.has(key)),
  );
  const phrases = Object.fromEntries(
    Object.entries(readPack<DictPack>("en-ja/phrases.json")).filter(([key]) =>
      key.includes(" "),
    ),
  );
  writePack("en-ja/phrases.json", { ...phrases, ...words });
  console.log(
    `en-ja/capital.json: ${Object.keys(capital).length} EJDict capitalised headwords, ` +
      `${Object.keys(capitalWords).length - fromAcronyms} of ${capitals.length} capital-only words with Japanese meanings (${fromEntities} from Wikidata), ` +
      `${fromAcronyms} acronyms known by what they stand for; ` +
      `en-ja/phrases.json: ${Object.keys(words).length} of ${added.length} rule E words with Japanese meanings`,
  );
}

if (import.meta.main) await main();
