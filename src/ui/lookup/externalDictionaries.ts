import type { Settings } from "../../core/settings";
import { t } from "../../i18n/t";

type DictionaryId = keyof Settings["dictionaries"];

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
  es: "spanish",
  ja: "japanese",
};

/** WordReference's dictionary codes by `from-to`. */
const WORDREFERENCE_CODES: Readonly<Record<string, string>> = {
  "en-ja": "enja",
  "es-en": "esen",
};

/** Cambridge's dictionary paths by `from-to`, or by `from` for its monolingual ones. */
const CAMBRIDGE_PATHS: Readonly<Record<string, string>> = {
  en: "english",
  "es-en": "spanish-english",
};

/**
 * Wiktionary's section anchors by learning language. English words keep no anchor:
 * their section comes first on the page.
 */
const WIKTIONARY_SECTIONS: Readonly<Record<string, string>> = {
  es: "Spanish",
};

const lookUp = (table: Readonly<Record<string, string>>, key: string) =>
  Object.hasOwn(table, key) ? table[key] : undefined;

const enc = encodeURIComponent;

/** A dictionary's URL for the term, or undefined when it does not cover the pair. */
const URLS: readonly [
  DictionaryId,
  (term: string, pair: Pair) => string | undefined,
][] = [
  [
    "cambridge",
    (term, { from, to }) => {
      const path =
        lookUp(CAMBRIDGE_PATHS, `${from}-${to}`) ??
        lookUp(CAMBRIDGE_PATHS, from);
      return path
        ? `https://dictionary.cambridge.org/dictionary/${path}/${enc(term.replace(/ /g, "-"))}`
        : undefined;
    },
  ],
  [
    "wiktionary",
    (term, { from }) => {
      const section = lookUp(WIKTIONARY_SECTIONS, from);
      return `https://en.wiktionary.org/wiki/${enc(term)}${section ? `#${section}` : ""}`;
    },
  ],
  [
    "reverso",
    (term, { from, to }) => {
      const a = lookUp(REVERSO_NAMES, from);
      const b = lookUp(REVERSO_NAMES, to);
      return a && b
        ? `https://context.reverso.net/translation/${a}-${b}/${enc(term)}`
        : undefined;
    },
  ],
  [
    "wordreference",
    (term, { from, to }) => {
      const code = lookUp(WORDREFERENCE_CODES, `${from}-${to}`);
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
