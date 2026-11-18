import { join } from "node:path";
import { recipeNatives, type RecipeNative } from "../../src/core/natives.ts";
import type { PackName } from "../../src/core/packs/load.ts";
import { PACK_FORMATS } from "../../src/core/packs/formats.ts";
import { PACKS_DIR, ROOT } from "./common.ts";
import {
  RECIPES,
  TABLES_TAG,
  recipeTags,
  type Recipe,
} from "./recipes/recipes.ts";

/** The npm organization `langle` (user, 2026-11-18). */
const NPM_SCOPE = "@langle";

/** Where the full notices that WordNet-style licenses ask every copy to carry are kept. */
export const NOTICES_DIR = join(ROOT, "scripts", "data", "licenses");

/** A source's license: one the packs allow (architecture.md "Licenses"). */
interface SourceLicense {
  name: string;
  url?: string;
  /** Adaptations must keep the license (CC BY-SA): the pack is CC BY-SA 4.0. */
  shareAlike?: boolean;
  /** A notice every copy must carry, in NOTICES_DIR; the package's LICENSE includes it. */
  notice?: string;
}

/**
 * The licenses the packs' sources may have (user, 2026-11-11 and 2026-11-18): public
 * domain, MIT, CC BY-SA, and the attribution-only CC BY, ODC-BY and WordNet-style
 * licenses (permission with a copyright notice and disclaimer on every copy).
 */
const LICENSES = {
  publicDomain: { name: "public domain" },
  ccBySa4: {
    name: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    shareAlike: true,
  },
  ccBy3: {
    name: "CC BY 3.0",
    url: "https://creativecommons.org/licenses/by/3.0/",
  },
  odcBy1: {
    name: "ODC-BY 1.0",
    url: "https://opendatacommons.org/licenses/by/1-0/",
  },
  wordnet3: {
    name: "WordNet 3.0 license",
    url: "https://wordnet.princeton.edu/license-and-commercial-use",
    notice: "wordnet-3.0.txt",
  },
  chineseOpenWordnet: {
    name: "Chinese Open Wordnet license (WordNet-style)",
    url: "https://bond-lab.github.io/cow/",
    notice: "chinese-open-wordnet.txt",
  },
  plWordNet: {
    name: "plWordNet license (WordNet-style)",
    url: "https://plwordnet.pwr.wroc.pl/wordnet/",
    notice: "plwordnet.txt",
  },
} as const satisfies Readonly<Record<string, SourceLicense>>;

interface Source {
  title: string;
  url: string;
  /** How the data was taken from the source, if not directly. */
  via?: string;
  by: string;
  license: SourceLicense;
}

interface PackSource extends Source {
  /** What the pack takes from the source. */
  used: string;
}

export interface PackInfo {
  dir: string;
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
const OMW =
  "as packaged in the Open Multilingual Wordnet 1.4 (https://omwn.org/)";

/** As THIRD_PARTY_NOTICES.md lists them. */
const SOURCES = {
  ejdict: {
    title: "EJDict-hand",
    url: "https://github.com/kujirahand/EJDict",
    by: "kujirahand",
    license: LICENSES.publicDomain,
  },
  wiktionaryEn: {
    title: "English Wiktionary, English entries",
    via: KAIKKI,
    url: "https://kaikki.org/dictionary/English/",
    by: WIKTIONARY_AUTHORS,
    license: LICENSES.ccBySa4,
  },
  freqEn: {
    title: "Wiktionary:Frequency lists/TV/2006",
    url: "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/TV/2006",
    by: WIKTIONARY_AUTHORS,
    license: LICENSES.ccBySa4,
  },
  wiktionaryEs: {
    title: "English Wiktionary, Spanish entries",
    via: KAIKKI,
    url: "https://kaikki.org/dictionary/Spanish/",
    by: WIKTIONARY_AUTHORS,
    license: LICENSES.ccBySa4,
  },
  wiktionaryEsEdition: {
    title: "Spanish Wiktionary (Wikcionario), English entries",
    via: KAIKKI,
    url: "https://es.wiktionary.org/",
    by: "the contributors to Wikcionario, listed in each page's history",
    license: LICENSES.ccBySa4,
  },
  wiktionaryPtEdition: {
    title: "Portuguese Wiktionary (Wikcionário), English entries",
    via: KAIKKI,
    url: "https://pt.wiktionary.org/",
    by: "the contributors to Wikcionário, listed in each page's history",
    license: LICENSES.ccBySa4,
  },
  wiktionaryRuEdition: {
    title: "Russian Wiktionary (Викисловарь), English entries",
    via: KAIKKI,
    url: "https://ru.wiktionary.org/",
    by: "the contributors to Викисловарь, listed in each page's history",
    license: LICENSES.ccBySa4,
  },
  wiktionaryFrEdition: {
    title: "French Wiktionary (Wiktionnaire), English entries",
    via: KAIKKI,
    url: "https://fr.wiktionary.org/",
    by: "the contributors to Wiktionnaire, listed in each page's history",
    license: LICENSES.ccBySa4,
  },
  wiktionaryDeEdition: {
    title: "German Wiktionary, English entries",
    via: KAIKKI,
    url: "https://de.wiktionary.org/",
    by: "the contributors to the German Wiktionary, listed in each page's history",
    license: LICENSES.ccBySa4,
  },
  udEwt: {
    title: "Universal Dependencies English Web Treebank (UD_English-EWT)",
    url: "https://github.com/UniversalDependencies/UD_English-EWT",
    by: "The Board of Trustees of The Leland Stanford Junior University and the treebank's contributors (Silveira, Dozat, Manning, Schuster, Chi, Bauer, Connor, de Marneffe, Schneider, Bowman, Zhu, Galbraith), over the texts of the LDC English Web Treebank (LDC2012T13)",
    license: LICENSES.ccBySa4,
  },
  freqEs: {
    title: "Wiktionary:Frequency lists/Spanish/Mixed 730K",
    url: "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Spanish/Mixed_730K",
    by: `${WIKTIONARY_AUTHORS}; built from the Leipzig Corpora Collection (2021 Wikipedia and 2022 news corpora)`,
    license: LICENSES.ccBySa4,
  },
  wordnetEn: {
    title: "Princeton WordNet 3.0",
    via: OMW,
    url: "https://wordnet.princeton.edu/",
    by: "Princeton University (Christiane Fellbaum, ed., WordNet: An Electronic Lexical Database, MIT Press, 1998)",
    license: LICENSES.wordnet3,
  },
  wordnetIt: {
    title: "MultiWordNet (Italian)",
    via: OMW,
    url: "https://multiwordnet.fbk.eu/",
    by: "Emanuele Pianta, Luisa Bentivogli and Christian Girardi, Fondazione Bruno Kessler",
    license: LICENSES.ccBy3,
  },
  wordnetIwn: {
    title: "ItalWordNet",
    via: OMW,
    url: "http://www.ilc.cnr.it/en/content/italwordnet",
    by: "Istituto di Linguistica Computazionale, CNR (Antonio Toral, Stefania Bracale, Monica Monachini, Claudia Soria, Roberto Bartolini)",
    license: LICENSES.odcBy1,
  },
  wordnetCmn: {
    title: "Chinese Open Wordnet",
    via: OMW,
    url: "https://bond-lab.github.io/cow/",
    by: "Francis Bond and Shan Wang",
    license: LICENSES.chineseOpenWordnet,
  },
  wordnetPl: {
    title: "plWordNet",
    via: OMW,
    url: "https://plwordnet.pwr.wroc.pl/wordnet/",
    by: "Wrocław University of Technology (Maciej Piasecki, Stan Szpakowicz, Bartosz Broda, Marek Maziarz, Ewa Rudnicka)",
    license: LICENSES.plWordNet,
  },
} as const satisfies Readonly<Record<string, Source>>;

/** The source behind each recipe tag (scripts/data/recipes/native.ts) a recipe may name. */
const RECIPE_SOURCES: Readonly<Record<string, Source>> = {
  eswiktionary: SOURCES.wiktionaryEsEdition,
  ptwiktionary: SOURCES.wiktionaryPtEdition,
  ruwiktionary: SOURCES.wiktionaryRuEdition,
  frwiktionary: SOURCES.wiktionaryFrEdition,
  dewiktionary: SOURCES.wiktionaryDeEdition,
  [TABLES_TAG]: SOURCES.wiktionaryEn,
  "omw-it": SOURCES.wordnetIt,
  "omw-iwn": SOURCES.wordnetIwn,
  "omw-cmn": SOURCES.wordnetCmn,
  "omw-pl": SOURCES.wordnetPl,
};

const pack = (
  name: PackName,
  fields: Pick<PackInfo, "title" | "description" | "sources">,
): PackInfo => {
  // Every source so far allows CC BY-SA 4.0 for the whole; a pack without share-alike
  // material would need its license chosen.
  if (!fields.sources.some((source) => source.license.shareAlike))
    throw new Error(`${name}: no CC BY-SA source; choose its license`);
  return {
    dir: join(PACKS_DIR, name),
    format: PACK_FORMATS[name],
    package: `${NPM_SCOPE}/${name}`,
    license: CC_BY_SA,
    changes: "entries were selected, filtered and reformatted",
    ...fields,
  };
};

const ENGLISH_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * A recipe pair pack (`en-<native>`): its sources are its recipe's, with what each
 * gives, and the English wordnet when the recipe reads a wordnet.
 */
export function recipePack(
  native: string,
  recipe: Recipe = RECIPES[native as RecipeNative],
): PackInfo {
  const name = ENGLISH_NAMES.of(native) ?? native;
  const sources = recipeTags(recipe).map((tag): PackSource => {
    const source = RECIPE_SOURCES[tag];
    if (!source) throw new Error(`en-${native}: no source for ${tag}`);
    const used =
      tag === recipe.edition?.tag
        ? recipe.edition.afterTables
          ? `${name} definitions of the terms the translation tables lack`
          : `${name} definitions`
        : tag === TABLES_TAG
          ? `${name} translations (translation tables)`
          : `${name} words of WordNet's synsets`;
    return { ...source, used };
  });
  if (recipe.wordnets?.length)
    sources.push({
      ...SOURCES.wordnetEn,
      used: "the English synsets that link the terms to the other wordnets, their definitions as sense hints",
    });
  return pack(`en-${native}` as PackName, {
    title: `English–${name} dictionary`,
    description: `${name} meanings of English words and phrases`,
    sources,
  });
}

/** Each pack holds Wiktionary-derived files, so each is CC BY-SA 4.0 as a whole. */
export const PACKS: Readonly<Record<PackName, PackInfo>> = {
  en: pack("en", {
    title: "English word data",
    description:
      "English base forms, frequency ranks, IPA, parts of speech, vocabulary, phrase patterns, names and a part-of-speech tagger",
    sources: [
      { ...SOURCES.ejdict, used: "vocabulary, phrase list" },
      {
        ...SOURCES.wiktionaryEn,
        used: "vocabulary beyond EJDict's, inflections, US IPA, parts of speech, phrase patterns, names, frequency ranks of words the list lacks",
      },
      { ...SOURCES.freqEn, used: "frequency ranks" },
      {
        ...SOURCES.udEwt,
        used: "the part-of-speech tagger's model (trained on it)",
      },
    ],
  }),
  "en-ja": pack("en-ja", {
    title: "English–Japanese dictionary",
    description: "Japanese meanings of English words and phrases",
    sources: [
      { ...SOURCES.ejdict, used: "the dictionary" },
      {
        ...SOURCES.wiktionaryEn,
        used: "Japanese translations of phrases, the parts of speech its senses are labelled with",
      },
    ],
  }),
  "en-defs": pack("en-defs", {
    title: "English definitions",
    description: "English definitions of English words and phrases",
    sources: [{ ...SOURCES.wiktionaryEn, used: "the definitions" }],
  }),
  es: pack("es", {
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
  "es-en": pack("es-en", {
    title: "Spanish–English dictionary",
    description: "English meanings of Spanish words and phrases",
    sources: [{ ...SOURCES.wiktionaryEs, used: "the English meanings" }],
  }),
  ...(Object.fromEntries(
    recipeNatives().map((native) => [`en-${native}`, recipePack(native)]),
  ) as Record<`en-${RecipeNative}`, PackInfo>),
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
