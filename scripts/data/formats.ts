import { join } from "node:path";
import type { PackName } from "../../src/core/packs/load.ts";
import { PACK_FORMATS } from "../../src/core/packs/formats.ts";
import { DOWNLOAD_PACKS_DIR, PACKS_DIR } from "./common.ts";

/** A placeholder until the scope exists. */
const NPM_SCOPE = "@lingo-data";

interface PackSource {
  title: string;
  url: string;
  /** How the data was taken from the source, if not directly. */
  via?: string;
  by: string;
  license: string;
  /** What the pack takes from the source. */
  used: string;
}

export interface PackInfo {
  dir: string;
  /** In data/packs/: bundled or downloaded as the lock says. */
  downloadable: boolean;
  format: number;
  package: string;
  license: { spdx: string; name: string; url: string };
  /** How the files differ from the sources (for the license notice). */
  changes: string;
  title: string;
  description: string;
  sources: PackSource[];
}

const CC_BY_SA = {
  spdx: "CC-BY-SA-4.0",
  name: "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
};
const WIKTIONARY_AUTHORS =
  "the contributors to Wiktionary, listed in each page's history";
const KAIKKI = "extracted by wiktextract and published by kaikki.org";

/** As THIRD_PARTY_NOTICES.md lists them. */
const SOURCES = {
  ejdict: {
    title: "EJDict-hand",
    url: "https://github.com/kujirahand/EJDict",
    by: "kujirahand",
    license: "public domain",
  },
  wiktionaryEn: {
    title: "English Wiktionary, English entries",
    via: KAIKKI,
    url: "https://kaikki.org/dictionary/English/",
    by: WIKTIONARY_AUTHORS,
    license: "CC BY-SA 4.0",
  },
  freqEn: {
    title: "Wiktionary:Frequency lists/TV/2006",
    url: "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/TV/2006",
    by: WIKTIONARY_AUTHORS,
    license: "CC BY-SA 4.0",
  },
  wiktionaryEs: {
    title: "English Wiktionary, Spanish entries",
    via: KAIKKI,
    url: "https://kaikki.org/dictionary/Spanish/",
    by: WIKTIONARY_AUTHORS,
    license: "CC BY-SA 4.0",
  },
  wiktionaryEsEdition: {
    title: "Spanish Wiktionary (Wikcionario), English entries",
    via: KAIKKI,
    url: "https://es.wiktionary.org/",
    by: "the contributors to Wikcionario, listed in each page's history",
    license: "CC BY-SA 4.0",
  },
  wiktionaryPtEdition: {
    title: "Portuguese Wiktionary (Wikcionário), English entries",
    via: KAIKKI,
    url: "https://pt.wiktionary.org/",
    by: "the contributors to Wikcionário, listed in each page's history",
    license: "CC BY-SA 4.0",
  },
  freqEs: {
    title: "Wiktionary:Frequency lists/Spanish/Mixed 730K",
    url: "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Spanish/Mixed_730K",
    by: `${WIKTIONARY_AUTHORS}; built from the Leipzig Corpora Collection (2021 Wikipedia and 2022 news corpora)`,
    license: "CC BY-SA 4.0",
  },
};

const pack = (
  name: PackName,
  downloadable: boolean,
  fields: Pick<PackInfo, "title" | "description" | "sources">,
): PackInfo => ({
  dir: join(downloadable ? DOWNLOAD_PACKS_DIR : PACKS_DIR, name),
  downloadable,
  format: PACK_FORMATS[name],
  package: `${NPM_SCOPE}/${name}`,
  license: CC_BY_SA,
  changes: "entries were selected, filtered and reformatted",
  ...fields,
});

/** Each pack holds Wiktionary-derived files, so each is CC BY-SA 4.0 as a whole. */
export const PACKS: Readonly<Record<PackName, PackInfo>> = {
  en: pack("en", false, {
    title: "English word data",
    description:
      "English base forms, frequency ranks, IPA, parts of speech, vocabulary, phrase patterns and names",
    sources: [
      { ...SOURCES.ejdict, used: "vocabulary, phrase list" },
      {
        ...SOURCES.wiktionaryEn,
        used: "inflections, US IPA, parts of speech, phrase patterns, names",
      },
      { ...SOURCES.freqEn, used: "frequency ranks" },
    ],
  }),
  "en-ja": pack("en-ja", false, {
    title: "English–Japanese dictionary",
    description: "Japanese meanings of English words and phrases",
    sources: [
      { ...SOURCES.ejdict, used: "the dictionary" },
      { ...SOURCES.wiktionaryEn, used: "Japanese translations of phrases" },
    ],
  }),
  "en-defs": pack("en-defs", false, {
    title: "English definitions",
    description: "English definitions of English words and phrases",
    sources: [{ ...SOURCES.wiktionaryEn, used: "the definitions" }],
  }),
  es: pack("es", true, {
    title: "Spanish word data",
    description:
      "Spanish base forms, frequency ranks, IPA, vocabulary and phrase patterns",
    sources: [
      {
        ...SOURCES.wiktionaryEs,
        used: "inflections, IPA, vocabulary, phrase patterns",
      },
      { ...SOURCES.freqEs, used: "frequency ranks" },
    ],
  }),
  "en-es": pack("en-es", true, {
    title: "English–Spanish dictionary",
    description: "Spanish meanings of English words and phrases",
    sources: [
      { ...SOURCES.wiktionaryEsEdition, used: "Spanish definitions" },
      {
        ...SOURCES.wiktionaryEn,
        used: "Spanish translations (translation tables)",
      },
    ],
  }),
  "en-pt": pack("en-pt", true, {
    title: "English–Portuguese dictionary",
    description: "Portuguese meanings of English words and phrases",
    sources: [
      { ...SOURCES.wiktionaryPtEdition, used: "Portuguese definitions" },
      {
        ...SOURCES.wiktionaryEn,
        used: "Portuguese translations (translation tables)",
      },
    ],
  }),
  "es-en": pack("es-en", true, {
    title: "Spanish–English dictionary",
    description: "English meanings of Spanish words and phrases",
    sources: [{ ...SOURCES.wiktionaryEs, used: "the English meanings" }],
  }),
};

/**
 * The file a pack path as the extension reads it ("/packs/es/freq.json") comes from.
 * For tests that read the built packs in Node.
 */
export function packSourcePath(path: string) {
  const [root, name = "", ...rest] = path.replace(/^\//, "").split("/");
  const info = Object.hasOwn(PACKS, name) ? PACKS[name as PackName] : undefined;
  if (root !== "packs" || !info || rest.length === 0)
    throw new Error(`Not a pack file: ${path}`);
  return join(info.dir, ...rest);
}
