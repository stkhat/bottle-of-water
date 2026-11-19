// Japanese meanings of the capital-only words (rule E, en/capitals.json: AI, Tokyo,
// iPhone) from the kaikki.org English Wiktionary extract's translation tables (CC BY-SA)
// → data/packs/en-ja/capital.json, with EJDict's capitalised headwords (ejdict.ts
// writes those; this writes the file again with both, so it can run again).
// An acronym's meanings go under its capitals (AI), any other word's under its
// lower-case key (tokyo, iphone), as EJDict's are kept; a word with none is shown by
// its English definition (en-defs).
// Usage: node scripts/data/capital-words.ts [path]   (default data/raw/kaikki-en.jsonl;
// run ejdict.ts and kaikki.ts first)
import type { CapitalsPack, DictPack } from "../../src/core/packs/types.ts";
import {
  eachEntry,
  KAIKKI_PATH,
  readPack,
  writePack,
  type KaikkiEntry,
} from "./common.ts";
import { parseEjdict, readEjdictText } from "./ejdict.ts";
import { japaneseSenses } from "./phrases.ts";
import { entrySenses, rankCapitalSenses, type SourceSense } from "./senses.ts";

/** A translation with kana or kanji: not the English word written again ("AI", "ＡＴＭ"). */
const JAPANESE = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

/** A translation's romanization, which the tables put after it ("ＡＴＭ (ē-tī-emu)"). */
const ROMANIZATION = /\s*\([\p{Script=Latin}\s'’-]+\)$/u;

/** Where a capital-only word's meanings are kept: an acronym under its capitals. */
export const capitalEntryKey = (written: string) =>
  /\p{Ll}/u.test(written) ? written.toLowerCase() : written;

/** Translations in kana or kanji, without their romanization. */
const inJapanese = <T extends readonly [string, string, ...string[]]>(
  list: readonly T[],
) =>
  list.flatMap((item): T[] =>
    JAPANESE.test(item[0])
      ? [[item[0].replace(ROMANIZATION, ""), ...item.slice(1)] as unknown as T]
      : [],
  );

/**
 * The capital-only words' Japanese meanings (`capitals`, as written), from the
 * translation tables of the entries written as they are: up to four senses, best
 * first (`rankCapitalSenses`: Ebola the virus before the river), each
 * "《English sense》word,word" with its part of speech (rule C1, as a phrase's), the
 * translations in kana or kanji only, without their romanization. Senses that only
 * inflect another word are left out. A word with no Japanese translation is left out.
 */
export async function capitalMeanings(
  path: string,
  capitals: readonly string[],
): Promise<Record<string, DictPack[string]>> {
  const wanted = new Set(capitals);
  const senses = new Map<
    string,
    { senses: SourceSense[]; loose: [string, string, string][] }
  >();
  await eachEntry(path, (entry: KaikkiEntry) => {
    if (entry.lang_code !== "en") return;
    const written = entry.word.replaceAll("’", "'");
    if (!wanted.has(written)) return;
    let found = senses.get(written);
    if (!found) senses.set(written, (found = { senses: [], loose: [] }));
    const read = entrySenses(entry, found.senses.length);
    found.senses.push(...read.senses.filter((sense) => !sense.inflection));
    const pos = typeof entry.pos === "string" ? entry.pos : "";
    found.loose.push(
      ...read.looseJa.map(
        ([word, label]) => [word, label, pos] as [string, string, string],
      ),
    );
  });
  const meanings: Record<string, DictPack[string]> = {};
  for (const written of capitals) {
    const found = senses.get(written);
    if (!found) continue;
    const ranked = rankCapitalSenses(
      found.senses.map((sense) => ({ ...sense, ja: inJapanese(sense.ja) })),
    );
    const entry = japaneseSenses(ranked, inJapanese(found.loose));
    if (entry) meanings[capitalEntryKey(written)] = entry;
  }
  return meanings;
}

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const vocab = new Set(readPack<string[]>("en/vocab.json"));
  // Capital-only words: not the vocabulary's abbreviations whose case the list keeps.
  const capitals = readPack<CapitalsPack>("en/capitals.json").filter(
    (written) => !vocab.has(written.toLowerCase()),
  );
  const { capital } = parseEjdict(readEjdictText());
  const meanings = await capitalMeanings(path, capitals);
  for (const key of Object.keys(meanings))
    if (Object.hasOwn(capital, key))
      throw new Error(`en-ja/capital.json has ${key} from EJDict`);
  writePack("en-ja/capital.json", { ...capital, ...meanings });
  console.log(
    `en-ja/capital.json: ${Object.keys(capital).length} EJDict capitalised headwords, ` +
      `${Object.keys(meanings).length} of ${capitals.length} capital-only words with Japanese meanings`,
  );
}

if (import.meta.main) await main();
