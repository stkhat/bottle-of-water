import type { IpaPack } from "./types";

/**
 * One transcription of a pack value. Packs hold one (`scripts/data/common.mjs`
 * `singleIpa`), but a value with a phonemic and a phonetic form ("/pleɪ̯/ [pɫ̥eɪ̯ ~ pʰɫeɪ̯]")
 * or alternatives ("/a/ ~ /b/", "[a ~ b]") gives its first; a /… without its closing
 * slash is closed. undefined when there is no single one.
 */
function single(value: string): string | undefined {
  const text = value.trim();
  const phonemic = /^\/[^/]+\//u.exec(text);
  if (phonemic) return phonemic[0];
  if (/^\/[^/[\]~]+$/u.test(text)) return `${text}/`;
  const first = /^\[([^\]]+)\]/u.exec(text)?.[1]?.split(/\s+~\s+/u)[0];
  return first && !first.includes("~") ? `[${first}]` : undefined;
}

/**
 * IPA of a word (US IPA for English), or of a phrase as its words' IPA inside one pair of slashes.
 * undefined when any word has none.
 */
export function ipaFor(term: string, ipa: IpaPack): string | undefined {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (const word of words) {
    const value = Object.hasOwn(ipa, word) ? ipa[word] : undefined;
    const transcription = value === undefined ? undefined : single(value);
    if (transcription === undefined) return undefined;
    parts.push(transcription);
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return `/${parts.map((p) => p.slice(1, -1)).join(" ")}/`;
}
