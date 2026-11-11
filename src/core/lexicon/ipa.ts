import type { IpaPack } from "../packs/types";
import { own } from "../util";

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

/** Letters Wiktionary writes in narrow US IPA, and the dictionary-style spelling shown. */
const LETTERS: Record<string, string> = {
  ɹ: "r",
  ɚ: "ər",
  ɝ: "ɜːr",
  ɫ: "l",
};

/**
 * A transcription as learner's dictionaries write it: syllable dots, linking marks,
 * tie bars, aspiration and diacritics (except the nasal tilde) are dropped, and the
 * narrow US letters become the usual ones (ɹ → r, ɚ → ər, ɝ → ɜːr, ɫ → l), so
 * "/ˌɛd͡ʒ.əˈkeɪ.ʃən/" reads "/ˌɛdʒəˈkeɪʃən/". Stress, length and optional sounds stay.
 */
export function dictionaryIpa(transcription: string): string {
  return transcription
    .normalize("NFD")
    .replace(/[.‿ʰ]|[\u0300-\u0302\u0304-\u036F]/gu, "")
    .replace(/[ɹɚɝɫ]/gu, (letter) => LETTERS[letter] ?? letter)
    .normalize("NFC");
}

function transcriptionOf(word: string, ipa: IpaPack): string | undefined {
  const value = own(ipa, word);
  return value === undefined ? undefined : single(value);
}

/**
 * A transcription with the -s ending English adds for possessives, plurals and the third
 * person: /ɪz/ after a sibilant, /s/ after another voiceless sound, /z/ otherwise.
 */
function withS(transcription: string): string {
  const open = transcription[0]!;
  const inner = transcription.slice(1, -1);
  const ending = /(?:s|z|ʃ|ʒ)$/u.test(inner)
    ? "ɪz"
    : /(?:p|t|k|f|θ)$/u.test(inner)
      ? "s"
      : "z";
  return `${open}${inner}${ending}${transcription.at(-1)!}`;
}

/** A possessive ("one's", "Anna's") without an entry of its own, from its base word ("one's" → /wʌnz/). */
function possessiveOf(word: string, ipa: IpaPack): string | undefined {
  const base = /^(.+)['’]s$/u.exec(word)?.[1];
  const transcription =
    base === undefined ? undefined : transcriptionOf(base, ipa);
  return transcription === undefined ? undefined : withS(transcription);
}

/**
 * An -s form ("beans", "berries", "watches") without an entry of its own, from the base
 * form `bases` gives for it ("beans" → bean → /binz/).
 */
function sFormOf(
  word: string,
  ipa: IpaPack,
  bases: (word: string) => readonly string[],
): string | undefined {
  if (!word.endsWith("s")) return undefined;
  for (const base of bases(word)) {
    const isSForm =
      word === `${base}s` ||
      word === `${base}es` ||
      (base.endsWith("y") && word === `${base.slice(0, -1)}ies`);
    const transcription = isSForm ? transcriptionOf(base, ipa) : undefined;
    if (transcription !== undefined) return withS(transcription);
  }
  return undefined;
}

/**
 * IPA of a word (US IPA for English), or of a phrase as its words' IPA inside one pair of
 * slashes, in dictionary style (`dictionaryIpa`). A possessive without an entry of its own
 * is built from its base word ("make up one's mind"), and so is an -s form when `bases`
 * gives its base forms ("spill the beans").
 * undefined when any word has none.
 */
export function ipaFor(
  term: string,
  ipa: IpaPack,
  bases?: (word: string) => readonly string[],
): string | undefined {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (const word of words) {
    const transcription =
      transcriptionOf(word, ipa) ??
      possessiveOf(word, ipa) ??
      (bases ? sFormOf(word, ipa, bases) : undefined);
    if (transcription === undefined) return undefined;
    parts.push(dictionaryIpa(transcription));
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return `/${parts.map((p) => p.slice(1, -1)).join(" ")}/`;
}
