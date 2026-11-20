// Entities no dictionary we use gives a meaning (companies, products, places,
// organisations, newer coinages: Nvidia, AirPods, ChatGPT, Shinkansen), from Wikidata
// (CC0): one item per capitalised word, its labels and short descriptions in English,
// Japanese and the recipe pairs' languages → data/raw/wikidata/entities.json, which
// kaikki.ts (the capital-only words), capital-words.ts (en-ja), en-defs.ts and
// recipes/native.ts read. Rule in docs/specs/architecture.md "Vocabulary and frequency
// (rule E)", "Entities"; measured in docs/notes/proper-nouns.md "Entities".
//
// The data comes from SPARQL exports of the whole of Wikidata (items with at least
// `MIN_SITELINKS` sitelinks), queried on QLever (qlever.dev, University of Freiburg),
// whose engine answers them in seconds where Wikidata's own service times out. Each
// export is cached in data/raw/wikidata/ and read again from there; delete a file (or
// pass --refresh) to fetch it anew. The texts of the chosen items are fetched in
// batches and cached too (texts.jsonl).
// Usage: node scripts/data/wikidata.ts [--refresh]   (needs data/raw/kaikki-en.jsonl)
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { cleanShort } from "../../src/core/lexicon/short-lines.ts";
import {
  KAIKKI_PATH,
  RAW_DIR,
  WIKIDATA_WORDS_PATH,
  byCodeUnit,
  eachEntry,
} from "./common.ts";
import { entryExamplePieces, pieceWords } from "./examples.ts";
import { RECIPES } from "./recipes/recipes.ts";
import { ENGLISH_WORDS } from "./vocabulary.ts";

export const WIKIDATA_DIR = join(RAW_DIR, "wikidata");
/** The source tag of Wikidata's meanings in a pair dictionary's index. */
export const WIKIDATA_TAG = "wikidata";
export const ENTITIES_PATH = join(WIKIDATA_DIR, "entities.json");
const ENDPOINT = "https://qlever.dev/api/wikidata";
const USER_AGENT = "LangleDataImport/0.1 (https://github.com/stkhat/langle)";

/** An item needs this many sitelinks (Wikipedia and sister-project pages) to be read. */
export const MIN_SITELINKS = 10;
/**
 * A word joins only where Wiktionary's examples (since 1900, as rule E counts them)
 * write it so, with its plural or possessive, at least this often and more often than
 * in lower case: a word text uses, and not a common word's capital.
 */
export const MIN_EXAMPLES = 2;
/**
 * The item must have this many times the sitelinks of every other item the word names
 * and of its disambiguation page: a place name many towns share (Fredericktown,
 * Montclair) or an acronym of many things says nothing on its own.
 */
export const DOMINANCE = 1.5;

/** The languages whose texts are kept: English, Japanese and the recipe pairs'. */
export const LANGS = ["en", "ja", ...Object.keys(RECIPES)].flatMap((lang) =>
  // Chinese in simplified characters, else as written (converted at build time).
  lang === "zh" ? ["zh-hans", "zh"] : [lang],
);

/** What an item is, as the rule reads it (by its classes: P31, then P279*). */
export type Kind = "person" | "name" | "internal" | "work";

/** Root classes of each kind. */
const ROOTS: Readonly<Record<Kind, readonly string[]>> = {
  // Humans, fictional characters (a person's name in text).
  person: ["Q5", "Q215627", "Q95074", "Q15632617"],
  // Given names and family names: the word is a person's name.
  name: ["Q82799"],
  // Disambiguation pages, categories, lists, templates, project pages.
  internal: [
    "Q4167410",
    "Q17442446",
    "Q4167836",
    "Q13406463",
    "Q11266439",
    "Q14204246",
  ],
  // Titles of works (a film, series, album, song, book, comic, painting): a title is
  // read in text as the thing it names, or as a common phrase, not as a work.
  work: [
    "Q11424",
    "Q5398426",
    "Q482994",
    "Q7366",
    "Q2188189",
    "Q7725634",
    "Q1004",
    "Q3305213",
  ],
};

/** Codes an item has besides its names (IATA, ICAO, ISO 4217, ISO 3166, ISO 639, symbols…). */
const CODE_PROPERTIES = [
  "P238",
  "P239",
  "P229",
  "P230",
  "P498",
  "P297",
  "P298",
  "P300",
  "P218",
  "P219",
  "P220",
  "P246",
  "P3441",
  "P296",
  "P5696",
  "P4755",
];

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX schema: <http://schema.org/>
`;
const notable = `?item wikibase:sitelinks ?n . FILTER(?n >= ${MIN_SITELINKS})`;

/** The exports, by file name (QLever's `@en@` reads a language's labels fast). */
const EXPORTS: Readonly<Record<string, string>> = {
  "labels.tsv": `SELECT ?item ?n ?label WHERE { ${notable} ?item @en@rdfs:label ?label . }`,
  "aliases.tsv": `SELECT ?item ?n ?label WHERE { ${notable} ?item @en@skos:altLabel ?label . }`,
  "classes.tsv": `SELECT ?item ?class WHERE { ${notable} ?item wdt:P31 ?class . }`,
  "kinds.tsv": `SELECT ?root ?class WHERE { VALUES ?root { ${Object.values(
    ROOTS,
  )
    .flat()
    .map((id) => `wd:${id}`)
    .join(" ")} } ?class wdt:P279* ?root . }`,
  // Names of any notability: a word that is a given name or a family name is a name.
  "names.tsv": `SELECT DISTINCT ?item ?label WHERE { VALUES ?root { wd:Q101352 wd:Q202444 } ?class wdt:P279* ?root . ?item wdt:P31 ?class . ?item @en@rdfs:label ?label . }`,
  "codes.tsv": `SELECT ?item ?code WHERE { VALUES ?p { ${CODE_PROPERTIES.map((p) => `wdt:${p}`).join(" ")} } ?item ?p ?code . ${notable} }`,
};

/**
 * Runs a query on QLever, its TSV streamed into `path`, retried when busy or when the
 * answer is not the TSV asked for (`header`: its first line).
 */
async function exportTo(query: string, path: string, header?: string) {
  for (let attempt = 1; ; attempt++) {
    let failure: string;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "text/tab-separated-values",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query: PREFIXES + query }),
      });
      if (response.ok && response.body) {
        const partial = `${path}.part`;
        await pipeline(
          Readable.fromWeb(response.body as never),
          createWriteStream(partial),
        );
        if (header === undefined || (await firstLine(partial)) === header) {
          renameSync(partial, path);
          return;
        }
        failure = "not the TSV asked for";
      } else
        failure = `${response.status}: ${(await response.text()).slice(0, 300)}`;
    } catch (error) {
      // A connection cut off mid-answer.
      failure = String(error);
    }
    if (attempt >= 4) throw new Error(`QLever: ${failure}`);
    await sleep(attempt * 20_000);
  }
}

async function firstLine(path: string) {
  for await (const line of createInterface({
    input: createReadStream(path, "utf8"),
  }))
    return line;
  return undefined;
}

/** A TSV value: an item IRI → its id; a literal → its text (and language). */
export function tsvValue(value: string): {
  id?: string;
  text?: string;
  lang?: string;
} {
  const iri = /^<http:\/\/www\.wikidata\.org\/entity\/([QPL]\d+)>$/.exec(value);
  if (iri) return { id: iri[1] };
  const literal = /^"((?:[^"\\]|\\.)*)"(?:@([\w-]+))?(?:\^\^<[^>]*>)?$/.exec(
    value,
  );
  if (literal)
    return {
      text: literal[1]!.replace(/\\(.)/g, (_, c: string) =>
        c === "n" ? "\n" : c === "t" ? "\t" : c,
      ),
      ...(literal[2] !== undefined && { lang: literal[2] }),
    };
  return /^-?\d+$/.test(value) ? { text: value } : {};
}

async function* rowsOf(path: string) {
  const lines = createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Infinity,
  });
  let header = true;
  for await (const line of lines) {
    if (header) {
      header = false;
      continue;
    }
    if (line) yield line.split("\t");
  }
}

/** One item a word may name, as the exports give it. */
export interface Candidate {
  id: string;
  sitelinks: number;
  /** The word is the item's English label, or one of its aliases. */
  via: "label" | "alias";
  kinds: ReadonlySet<Kind>;
  /** The item's English label. */
  label: string;
  /** The item's codes (IATA, ISO…): an alias that is one is no name of it. */
  codes?: ReadonlySet<string>;
}

/** Letters with no accent, in lower case: Tōkaidō and Tokaido alike. */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

export type Choice =
  | { id: string; sitelinks: number; label: string; via: Candidate["via"] }
  | {
      none:
        | "name"
        | "person"
        | "disambiguation"
        | "no fitting item"
        | "few sitelinks"
        | "ambiguous";
    };

/**
 * CORE: the one item a capitalised word names, or why none.
 * - The word is a name when Wikidata has a given name or a family name so written
 *   (Huang, Kane, Narita, Tesla), when its most notable item is a person or a
 *   character, or when a person more notable than the item has it in their name
 *   (`personSitelinks`: Dirac, a French commune, for Paul Dirac).
 * - Its disambiguation page first: it names many things.
 * - The item: not a person, a name, a page of the project or a work's title; named by
 *   its English label as written, or by an alias that is that label without its accents
 *   (Tokaido for Tōkaidō). Other aliases are left out: judged blind, an acronym's
 *   aliases chose the wrong thing half the time (AED → the UAE dirham's ISO code, KFF a
 *   film festival, QC Quebec), and others named a part or a neighbour (Matra, a
 *   mountain; Moorabbin, its airport). An item's codes and a label with no letter (a
 *   number, a year: "VIII") never count.
 * - The most notable such item, with at least `minSitelinks` sitelinks and `dominance`
 *   times those of every other item the word names and of its disambiguation page.
 */
export function chooseEntity(
  word: string,
  candidates: readonly Candidate[],
  {
    personSitelinks = 0,
    minSitelinks = MIN_SITELINKS,
    dominance = DOMINANCE,
  }: {
    personSitelinks?: number;
    minSitelinks?: number;
    dominance?: number;
  } = {},
): Choice {
  const rows = candidates
    .filter(
      (row) =>
        !(row.via === "alias" && row.codes?.has(word)) &&
        /\p{L}/u.test(row.label),
    )
    .sort((a, b) => b.sitelinks - a.sitelinks);
  if (candidates.some((row) => row.kinds.has("name"))) return { none: "name" };
  const top = rows[0];
  if (!top) return { none: "no fitting item" };
  if (top.kinds.has("person")) return { none: "person" };
  if (top.kinds.has("internal")) return { none: "disambiguation" };
  const pool = rows.filter(
    (row) =>
      !row.kinds.has("internal") &&
      !row.kinds.has("person") &&
      !row.kinds.has("work") &&
      (row.via === "label" ||
        (plain(row.label) === plain(word) && row.label !== word)),
  );
  const best = pool[0];
  if (!best) return { none: "no fitting item" };
  if (best.sitelinks < minSitelinks) return { none: "few sitelinks" };
  if (personSitelinks >= best.sitelinks) return { none: "person" };
  const rivals = [
    ...pool.slice(1),
    ...rows.filter((row) => row.kinds.has("internal") && row.via === "label"),
  ].map((row) => row.sitelinks);
  if (rivals.length > 0 && best.sitelinks < dominance * Math.max(...rivals))
    return { none: "ambiguous" };
  return {
    id: best.id,
    sitelinks: best.sitelinks,
    label: best.label,
    via: best.via,
  };
}

/** How often the examples write capitalised tokens as written, and words in lower case. */
export interface ExampleCounts {
  written: ReadonlyMap<string, number>;
  lower: ReadonlyMap<string, number>;
}

/** The example corpus's counts, as rule E reads it (`entryExamplePieces` since 1900). */
export async function exampleCounts(path: string): Promise<ExampleCounts> {
  const written = new Map<string, number>();
  const lower = new Map<string, number>();
  await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    for (const piece of entryExamplePieces(entry, 1900))
      for (const token of pieceWords(piece)) {
        const counts = token === token.toLowerCase() ? lower : written;
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
  });
  return { written, lower };
}

/**
 * How often the examples write a word so: as written, then its plural or possessive
 * written alike (AirPods, Nvidia's), as the capital-only reading takes them; 0 when the
 * examples write it in lower case as often (a common word's capital).
 */
export function writtenCount(word: string, { written, lower }: ExampleCounts) {
  const times = [word, `${word}s`, `${word}'s`].reduce(
    (sum, form) => sum + (written.get(form) ?? 0),
    0,
  );
  return times > (lower.get(word.toLowerCase()) ?? 0) ? times : 0;
}

/** An item's labels and descriptions, by language (`LANGS`). */
export interface ItemTexts {
  label: Record<string, string>;
  description: Record<string, string>;
}

/** A word Wikidata gives a meaning: its item, how often the examples write it, its texts. */
export interface Entity extends ItemTexts {
  id: string;
  sitelinks: number;
  examples: number;
}

/** data/raw/wikidata/entities.json: the words, as written → their entity. */
export type Entities = Readonly<Record<string, Entity>>;

/** Kana or kanji: a Japanese text (not a label in Latin letters, NVIDIA). */
const JAPANESE = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

/**
 * What an entity's sense is about, in English (the hint a translation table's sense
 * carries): its description, else its label.
 */
export const entityHint = (written: string, entity: Entity) =>
  entity.description.en ?? entity.label.en ?? written;

const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * An entity's English definition (en-defs): its description as a sentence ("American
 * multinational technology company."), after its label where the word is another
 * spelling of it ("Tōkaidō: Road of premodern Japan."); its label alone when it has no
 * description. None when that says nothing the word does not.
 */
export function entityDefinition(written: string, entity: Entity) {
  const label = entity.label.en ?? written;
  const description = entity.description.en;
  const other = plain(label) !== plain(written) || label !== written;
  const text =
    description === undefined
      ? other
        ? label
        : undefined
      : other
        ? `${label}: ${capitalised(description)}`
        : capitalised(description);
  return text === undefined
    ? undefined
    : /[.!?]$/.test(text)
      ? text
      : `${text}.`;
}

/**
 * An entity's Japanese meaning (en-ja, EJDict's format): its Japanese label, then its
 * Japanese short description (新幹線 / 日本の高速鉄道), each only in kana or kanji (a
 * label in Latin letters, NVIDIA or ChatGPT, says nothing the word does not; the
 * description says what it is: OpenAIが開発したチャットボット), the first hinted by what
 * it is in English (`entityHint`). Not a description the hover line would cut, as it
 * cuts EJDict's lists of translations at "、" or "・" (台湾系アメリカ人によって創設され
 * た、GPUやAI向けの半導体企業 would read "founded by a Taiwanese American"): the
 * English one, translated at display time, says it whole. None when neither is left.
 */
export function entityJapanese(
  written: string,
  entity: Entity,
): [string, string[], string] | undefined {
  const { ja: label } = entity.label;
  const { ja: description } = entity.description;
  const lines = [
    ...(label !== undefined && JAPANESE.test(label) ? [label] : []),
    ...(description !== undefined &&
    JAPANESE.test(description) &&
    cleanShort(description) === description.trim()
      ? [description]
      : []),
  ];
  if (lines.length === 0) return undefined;
  const first = lines[0]!;
  return [
    first,
    [`《${entityHint(written, entity)}》${first}`, ...lines.slice(1)],
    lines.map(() => "n").join(" "),
  ];
}

/**
 * An entity's senses in a recipe pair's language (`lang`), as [text, hint, what]: its label
 * there when that is no spelling of the word itself (Departamento de Policía de Nueva
 * York, 新干线; not "Nvidia"), then its description (empresa multinacional
 * estadounidense de tecnología). Chinese in simplified characters where Wikidata has
 * them (zh-hans), else as written.
 */
export function entityNative(
  written: string,
  entity: Entity,
  lang: string,
): [string, string, "label" | "description"][] {
  const pick = (texts: Record<string, string>) =>
    lang === "zh" ? (texts["zh-hans"] ?? texts.zh) : texts[lang];
  const label = pick(entity.label);
  const description = pick(entity.description);
  const senses: [string, string, "label" | "description"][] = [];
  if (label !== undefined && plain(label) !== plain(written))
    senses.push([label, entityHint(written, entity), "label"]);
  if (description !== undefined)
    senses.push([description, entityHint(written, entity), "description"]);
  return senses;
}

/** The entities, or none before `wikidata.ts` has run. */
export const readEntities = (path = ENTITIES_PATH): Entities =>
  existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Entities) : {};

/**
 * The entities of the words that joined from Wikidata (`entityWords`, as `kaikki.ts`
 * lists them), whose meanings are their items'; none before both have run.
 */
export function joinedEntities(): Entities {
  const entities = readEntities();
  if (!existsSync(WIKIDATA_WORDS_PATH)) return {};
  const words = JSON.parse(
    readFileSync(WIKIDATA_WORDS_PATH, "utf8"),
  ) as string[];
  return Object.fromEntries(
    words.flatMap((word) => (entities[word] ? [[word, entities[word]]] : [])),
  );
}

/**
 * LEARNING (rule E, with the pack): the entities that join the capital-only words, as
 * written. Not a word the language has already (`known`: a vocabulary word, a form, a
 * capital-only word from Wiktionary, or a possessive of one: Queen's, King's), nor a
 * name the names lexicon has as a person's (a given name or a surname among its kinds).
 */
export function entityWords(
  entities: Entities,
  {
    known,
    names,
    possessive = "'s",
  }: {
    known: (key: string) => boolean;
    names: Readonly<Record<string, string>>;
    possessive?: string;
  },
): string[] {
  return Object.keys(entities)
    .filter((written) => {
      const key = written.toLowerCase();
      if (known(key)) return false;
      if (key.endsWith(possessive) && known(key.slice(0, -possessive.length)))
        return false;
      return !/[gs]/.test(names[key] ?? "");
    })
    .sort(byCodeUnit);
}

/**
 * The items' texts in `LANGS`, fetched in batches, cached in `path` (one JSON line each,
 * with the languages it was fetched in). An item is fetched again when `LANGS` has
 * grown since (a new native language: th), its later line replacing the earlier.
 */
async function itemTexts(ids: readonly string[], path: string) {
  const texts = new Map<string, ItemTexts>();
  const fetched = new Set<string>();
  if (existsSync(path))
    for await (const line of createInterface({
      input: createReadStream(path, "utf8"),
    }))
      if (line) {
        const { id, langs, ...rest } = JSON.parse(line) as ItemTexts & {
          id: string;
          langs?: string[];
        };
        texts.set(id, rest);
        if (LANGS.every((lang) => langs?.includes(lang))) fetched.add(id);
        else fetched.delete(id);
      }
  const missing = ids.filter((id) => !fetched.has(id));
  const batch = 1000;
  const langs = LANGS.map((lang) => `"${lang}"`).join(",");
  for (let i = 0; i < missing.length; i += batch) {
    const part = missing.slice(i, i + batch);
    const file = join(WIKIDATA_DIR, "texts.part.tsv");
    await exportTo(
      `SELECT ?item ?p ?t WHERE { VALUES ?item { ${part.map((id) => `wd:${id}`).join(" ")} }
        { ?item rdfs:label ?t . BIND("l" AS ?p) } UNION { ?item schema:description ?t . BIND("d" AS ?p) }
        FILTER(LANG(?t) IN (${langs})) }`,
      file,
      "?item\t?p\t?t",
    );
    const got = new Map<string, ItemTexts>(
      part.map((id) => [id, { label: {}, description: {} }]),
    );
    for await (const [item, kind, value] of rowsOf(file)) {
      const { id } = tsvValue(item!);
      const { text: p } = tsvValue(kind!);
      const { text, lang } = tsvValue(value!);
      const entry = id && got.get(id);
      if (!entry || text === undefined || lang === undefined) continue;
      (p === "l" ? entry.label : entry.description)[lang] = text;
    }
    rmSync(file);
    await appendFile(
      path,
      [...got]
        .map(([id, t]) => JSON.stringify({ id, langs: LANGS, ...t }))
        .join("\n") + "\n",
    );
    for (const [id, t] of got) texts.set(id, t);
    console.log(
      `  texts: ${Math.min(i + batch, missing.length)} of ${missing.length}`,
    );
  }
  return texts;
}

/** The English words the exports give, as written: one word with a capital (rule E's shape). */
const isWord = (text: string) => ENGLISH_WORDS.capitalWord!.test(text);

async function main() {
  const refresh = process.argv.includes("--refresh");
  mkdirSync(WIKIDATA_DIR, { recursive: true });
  for (const [file, query] of Object.entries(EXPORTS)) {
    const path = join(WIKIDATA_DIR, file);
    if (refresh || !existsSync(path)) {
      console.log(`Exporting ${file} from QLever`);
      await exportTo(query, path);
    }
  }
  const examples = await exampleCounts(KAIKKI_PATH);
  // The words that may be entities: single capitalised words the examples write so.
  const words = new Map<
    string,
    { id: string; sitelinks: number; via: Candidate["via"] }[]
  >();
  const labels = new Map<string, string>();
  for (const [file, via] of [
    ["labels.tsv", "label"],
    ["aliases.tsv", "alias"],
  ] as const)
    for await (const [item, n, value] of rowsOf(join(WIKIDATA_DIR, file))) {
      const { id } = tsvValue(item!);
      const { text } = tsvValue(value!);
      if (!id || text === undefined) continue;
      if (via === "label") labels.set(id, text);
      const word = text.replaceAll("’", "'");
      if (!isWord(word) || writtenCount(word, examples) < MIN_EXAMPLES)
        continue;
      let list = words.get(word);
      if (!list) words.set(word, (list = []));
      list.push({ id, sitelinks: Number(n), via });
    }
  const kindOfClass = new Map<string, Set<Kind>>();
  const rootKind = new Map(
    Object.entries(ROOTS).flatMap(([kind, ids]) =>
      ids.map((id) => [id, kind as Kind]),
    ),
  );
  for await (const [root, cls] of rowsOf(join(WIKIDATA_DIR, "kinds.tsv"))) {
    const kind = rootKind.get(tsvValue(root!).id!);
    const { id } = tsvValue(cls!);
    if (!kind || !id) continue;
    let set = kindOfClass.get(id);
    if (!set) kindOfClass.set(id, (set = new Set()));
    set.add(kind);
  }
  const wanted = new Set([...words.values()].flat().map(({ id }) => id));
  const kinds = new Map<string, Set<Kind>>();
  const persons = new Set<string>();
  for await (const [item, cls] of rowsOf(join(WIKIDATA_DIR, "classes.tsv"))) {
    const { id } = tsvValue(item!);
    const of = kindOfClass.get(tsvValue(cls!).id!);
    if (!id || !of) continue;
    if (of.has("person")) persons.add(id);
    if (!wanted.has(id)) continue;
    let set = kinds.get(id);
    if (!set) kinds.set(id, (set = new Set()));
    for (const kind of of) set.add(kind);
  }
  // The most notable person or character with each word in their name.
  const personSitelinks = new Map<string, number>();
  for await (const [item, n, value] of rowsOf(
    join(WIKIDATA_DIR, "labels.tsv"),
  )) {
    const { id } = tsvValue(item!);
    if (!id || !persons.has(id)) continue;
    for (const word of new Set(pieceWords(tsvValue(value!).text ?? "")))
      if (words.has(word) && Number(n) > (personSitelinks.get(word) ?? 0))
        personSitelinks.set(word, Number(n));
  }
  const names = new Set<string>();
  for await (const [, value] of rowsOf(join(WIKIDATA_DIR, "names.tsv"))) {
    const { text } = tsvValue(value!);
    if (text !== undefined) names.add(text.replaceAll("’", "'"));
  }
  const codes = new Map<string, Set<string>>();
  for await (const [item, value] of rowsOf(join(WIKIDATA_DIR, "codes.tsv"))) {
    const { id } = tsvValue(item!);
    const { text } = tsvValue(value!);
    if (!id || text === undefined || !wanted.has(id)) continue;
    let set = codes.get(id);
    if (!set) codes.set(id, (set = new Set()));
    set.add(text);
  }
  const chosen = new Map<string, Extract<Choice, { id: string }>>();
  const reasons: Record<string, number> = {};
  for (const [word, list] of words) {
    const nameKind = new Set<Kind>(["name"]);
    const candidates: Candidate[] = list.map(({ id, sitelinks, via }) => ({
      id,
      sitelinks,
      via,
      kinds: kinds.get(id) ?? new Set(),
      label: labels.get(id) ?? "",
      codes: codes.get(id) ?? new Set(),
    }));
    if (names.has(word))
      candidates.push({
        id: "",
        sitelinks: 0,
        via: "label",
        kinds: nameKind,
        label: word,
      });
    const choice = chooseEntity(word, candidates, {
      personSitelinks: personSitelinks.get(word) ?? 0,
    });
    if ("none" in choice)
      reasons[choice.none] = (reasons[choice.none] ?? 0) + 1;
    else chosen.set(word, choice);
  }
  const texts = await itemTexts(
    [...new Set([...chosen.values()].map(({ id }) => id))].sort(byCodeUnit),
    join(WIKIDATA_DIR, "texts.jsonl"),
  );
  const entities: Record<string, Entity> = {};
  for (const word of [...chosen.keys()].sort(byCodeUnit)) {
    const { id, sitelinks } = chosen.get(word)!;
    const text = texts.get(id);
    if (!text?.label.en) continue;
    entities[word] = {
      id,
      sitelinks,
      examples: writtenCount(word, examples),
      ...text,
    };
  }
  await writeFile(ENTITIES_PATH, `${JSON.stringify(entities, null, 0)}\n`);
  console.log(
    `wikidata: ${words.size} capitalised words the examples write ${MIN_EXAMPLES} times or more; ` +
      `${Object.keys(entities).length} entities; none: ${JSON.stringify(reasons)}`,
  );
}

if (import.meta.main) await main();
