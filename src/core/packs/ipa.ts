import type { IpaPack } from "./types";

/**
 * US IPA of a word, or of a phrase as its words' IPA inside one pair of slashes.
 * undefined when any word has none.
 */
export function ipaFor(term: string, ipa: IpaPack): string | undefined {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (const word of words) {
    const value = Object.hasOwn(ipa, word) ? ipa[word] : undefined;
    if (value === undefined) return undefined;
    parts.push(value);
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return `/${parts.map((p) => p.replace(/^[/[]|[/\]]$/g, "")).join(" ")}/`;
}
