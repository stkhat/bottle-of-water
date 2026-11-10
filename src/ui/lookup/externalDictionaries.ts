import type { Settings } from "../../core/settings";
import { t } from "../../i18n/t";

export type DictionaryId = keyof Settings["dictionaries"];

export interface DictionaryLink {
  id: DictionaryId;
  label: string;
  href: string;
}

interface Pair {
  from: string;
  to: string;
}

/** Language names as Reverso writes them in its URLs. */
const REVERSO_NAMES: Readonly<Record<string, string>> = {
  en: "english",
  ja: "japanese",
};

/** WordReference's dictionary codes by `from-to`. */
const WORDREFERENCE_CODES: Readonly<Record<string, string>> = {
  "en-ja": "enja",
};

const enc = encodeURIComponent;

/** A dictionary's URL for the term, or undefined when it does not cover the pair. */
const URLS: readonly [
  DictionaryId,
  (term: string, pair: Pair) => string | undefined,
][] = [
  [
    "cambridge",
    (term, { from }) =>
      from === "en"
        ? `https://dictionary.cambridge.org/dictionary/english/${enc(term.replace(/ /g, "-"))}`
        : undefined,
  ],
  ["wiktionary", (term) => `https://en.wiktionary.org/wiki/${enc(term)}`],
  [
    "reverso",
    (term, { from, to }) => {
      const a = REVERSO_NAMES[from];
      const b = REVERSO_NAMES[to];
      return a && b
        ? `https://context.reverso.net/translation/${a}-${b}/${enc(term)}`
        : undefined;
    },
  ],
  [
    "wordreference",
    (term, { from, to }) => {
      const code = WORDREFERENCE_CODES[`${from}-${to}`];
      return code
        ? `https://www.wordreference.com/${code}/${enc(term)}`
        : undefined;
    },
  ],
];

const LABELS = {
  cambridge: "dictionary.cambridge",
  wiktionary: "dictionary.wiktionary",
  reverso: "dictionary.reverso",
  wordreference: "dictionary.wordreference",
} as const;

/** Links to the enabled external dictionaries that cover the pair, in settings order. */
export function dictionaryLinks(
  term: string,
  enabled: Settings["dictionaries"],
  pair: Pair,
): DictionaryLink[] {
  const links: DictionaryLink[] = [];
  for (const [id, url] of URLS) {
    if (!enabled[id]) continue;
    const href = url(term, pair);
    if (href !== undefined) links.push({ id, label: t(LABELS[id]), href });
  }
  return links;
}
