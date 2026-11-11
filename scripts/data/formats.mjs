// What each language pack is: the folder its files live in, the data format they have,
// its npm package and the sources it is built from. npm run data:publish
// (scripts/data/publish.mjs) writes the lock file and the npm package folders from this.
import { join } from "node:path";
import { DOWNLOAD_PACKS_DIR, PACKS_DIR } from "./common.mjs";

/**
 * The data format of each pack's files: the shape the extension's code reads. Bump a
 * pack's number when its reader changes so that files built for the old reader no
 * longer fit; the extension then refuses a stored version in the old format.
 */
export const PACK_FORMATS = {
  en: 1,
  "en-ja": 1,
  "en-defs": 1,
  es: 1,
  "es-en": 1,
};

/** The npm scope the packs are published under. A placeholder until the scope exists. */
export const NPM_SCOPE = "@lingo-data";

const CC_BY_SA = {
  spdx: "CC-BY-SA-4.0",
  name: "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
};
const WIKTIONARY_AUTHORS =
  "the contributors to Wiktionary, listed in each page's history";
const KAIKKI = "extracted by wiktextract and published by kaikki.org";

/** The sources, as THIRD_PARTY_NOTICES.md lists them. */
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
  freqEs: {
    title: "Wiktionary:Frequency lists/Spanish/Mixed 730K",
    url: "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Spanish/Mixed_730K",
    by: `${WIKTIONARY_AUTHORS}; built from the Leipzig Corpora Collection (2021 Wikipedia and 2022 news corpora)`,
    license: "CC BY-SA 4.0",
  },
};

const pack = (name, downloadable, fields) => ({
  dir: join(downloadable ? DOWNLOAD_PACKS_DIR : PACKS_DIR, name),
  downloadable,
  format: PACK_FORMATS[name],
  package: `${NPM_SCOPE}/${name}`,
  license: CC_BY_SA,
  changes: "entries were selected, filtered and reformatted",
  ...fields,
});

/**
 * Every pack. Packs in public/packs/ are always bundled; packs in data/packs/
 * (`downloadable`) are bundled or downloaded as their lock entry says. Each pack
 * holds Wiktionary-derived files, so each is CC BY-SA 4.0 as a whole.
 */
export const PACKS = {
  en: pack("en", false, {
    title: "English word data",
    description:
      "English base forms, frequency ranks, IPA, parts of speech, vocabulary and phrase patterns",
    sources: [
      { ...SOURCES.ejdict, used: "vocabulary, phrase list" },
      {
        ...SOURCES.wiktionaryEn,
        used: "inflections, US IPA, parts of speech, phrase patterns",
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
    title: "English phrase definitions",
    description: "English definitions of English phrases",
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
  "es-en": pack("es-en", true, {
    title: "Spanish–English dictionary",
    description: "English meanings of Spanish words and phrases",
    sources: [{ ...SOURCES.wiktionaryEs, used: "the English meanings" }],
  }),
};

/**
 * The file a pack path as the extension reads it ("/packs/es/freq.json") comes from,
 * in public/packs/ or data/packs/. For tests that read the generated packs in Node.
 */
export function packSourcePath(path) {
  const [root, name, ...rest] = path.replace(/^\//, "").split("/");
  const info = Object.hasOwn(PACKS, name) ? PACKS[name] : undefined;
  if (root !== "packs" || !info || rest.length === 0)
    throw new Error(`Not a pack file: ${path}`);
  return join(info.dir, ...rest);
}
