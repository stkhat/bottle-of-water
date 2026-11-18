// Chinese in simplified characters: OpenCC's Traditional → Simplified conversion (its
// t2s configuration) over its own dictionaries, read from the opencc dev dependency
// (Apache-2.0, https://github.com/BYVoid/OpenCC). Used at build time only: the packs
// hold the converted text.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../common.ts";

const OPENCC_DICTIONARIES = join(
  ROOT,
  "node_modules",
  "opencc",
  "data",
  "dictionary",
);

/** An OpenCC dictionary file: "key\tvalue value…" per line; the first value is the conversion. */
export function parseOpenccDictionary(text: string) {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.includes("\t")) continue;
    const [key = "", values = ""] = line.split("\t");
    const value = values.trim().split(/\s+/)[0];
    if (key && value) map.set(key, value);
  }
  return map;
}

/**
 * A converter as OpenCC's t2s configuration converts: CJK compatibility ideographs
 * normalized first; then, at each position, the longest phrase of the phrase dictionary
 * (一目瞭然 → 一目了然), else the character's conversion (麵 → 面), else the
 * character as it is.
 */
export function converter({
  normalization,
  phrases,
  characters,
}: {
  normalization: ReadonlyMap<string, string>;
  phrases: ReadonlyMap<string, string>;
  characters: ReadonlyMap<string, string>;
}) {
  let longest = 0;
  for (const key of phrases.keys())
    longest = Math.max(longest, [...key].length);
  return (text: string) => {
    const chars = [...text].map((ch) => normalization.get(ch) ?? ch);
    let out = "";
    for (let i = 0; i < chars.length;) {
      let matched = 0;
      for (let n = Math.min(longest, chars.length - i); n > 1; n--) {
        const phrase = phrases.get(chars.slice(i, i + n).join(""));
        if (phrase === undefined) continue;
        out += phrase;
        matched = n;
        break;
      }
      if (matched > 0) {
        i += matched;
        continue;
      }
      out += characters.get(chars[i]!) ?? chars[i]!;
      i++;
    }
    return out;
  };
}

/** Text in traditional (or mixed) Chinese characters, in simplified ones. */
export function simplifiedConverter(dir = OPENCC_DICTIONARIES) {
  const read = (file: string) =>
    parseOpenccDictionary(readFileSync(join(dir, file), "utf8"));
  return converter({
    normalization: read("CJK_Compatibility_Ideographs.txt"),
    phrases: read("TSPhrases.txt"),
    characters: read("TSCharacters.txt"),
  });
}
