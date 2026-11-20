// hermitdave/FrequencyWords 2018 lists (OpenSubtitles 2018 counts, content CC BY-SA
// 4.0): a language's word forms in rank order, as subtitles say them, in lower case.
// French and Spanish build their packs from them (fr-frequency.ts, es-frequency.ts):
// a list of what people say ranks greetings and other spoken words as speech does,
// where a list of written text (Wikipedia, news) puts them low ("hola" ranked 7,936 in
// Wiktionary's Spanish "Mixed 730K"; 2026-11-21).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchText, RAW_DIR } from "./common.ts";

/** The repository's default branch on 2026-11-19 (last commit 2022-02-07). */
const COMMIT = "525f9b560de45753a5ea01069454e72e9aa541c6";

/** Where a language's list is downloaded from. */
export const frequencyWordsUrl = (lang: string) =>
  `https://raw.githubusercontent.com/hermitdave/FrequencyWords/${COMMIT}/content/2018/${lang}/${lang}_full.txt`;

/** The list's lines ("de 8435682") as forms in rank order. */
export function parseFrequencyWords(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(" ")[0]!.trim())
    .filter(Boolean);
}

/**
 * The first `ranks` entries of a language's list, downloading it once into
 * data/raw/freq-<lang>/.
 */
export async function readFrequencyWords(lang: string, ranks: number) {
  const dir = join(RAW_DIR, `freq-${lang}`);
  const path = join(dir, `hermitdave-2018-${lang}_full.txt`);
  if (!existsSync(path)) {
    const url = frequencyWordsUrl(lang);
    console.log(`Downloading ${url}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, await fetchText(url));
  }
  return parseFrequencyWords(readFileSync(path, "utf8")).slice(0, ranks);
}
