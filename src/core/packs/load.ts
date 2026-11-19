import type {
  ContractionPack,
  DefsPack,
  DictPack,
  FreqPack,
  IpaPack,
  LemmaPack,
  LemmaShards,
  NamesPack,
  PairPack,
  PosPack,
  SensePosPack,
  ShardIndex,
  TaggerPack,
  VocabPack,
} from "./types";
import type { PhrasePatterns } from "../phrases/pattern";
import { recipeNatives, type RecipePairPack } from "../natives";
import { promiseCache } from "../util";

/**
 * The packs (built into data/packs/<name>/, downloaded, read at /packs/<name>/…) and
 * what each one holds once loaded.
 */
export type PackFiles = BuiltOtherwise & {
  readonly [P in RecipePairPack]: { dict: PairPack };
};

interface BuiltOtherwise {
  en: {
    lemmas: LemmaPack;
    freq: FreqPack;
    ipa: IpaPack;
    pos: PosPack;
    vocab: VocabPack;
    phrases: PhrasePatterns;
    names: NamesPack;
    tagger: TaggerPack;
    contractions: ContractionPack;
  };
  "en-ja": {
    dict: DictPack;
    phrases: DictPack;
    capital: DictPack;
    /** en-ja/pos.json */
    sensePos: SensePosPack;
  };
  "en-defs": { defs: DefsPack };
  es: {
    lemmas: LemmaShards;
    freq: FreqPack;
    ipa: IpaPack;
    pos: PosPack;
    vocab: VocabPack;
    phrases: PhrasePatterns;
    names: NamesPack;
    tagger: TaggerPack;
  };
  "es-en": { defs: DefsPack };
}
export type PackName = keyof PackFiles;

/**
 * Reads a pack's JSON file by its path ("/packs/<pack>/…"): from the downloaded packs
 * (`createPackSource`), or from data/packs/ in tests.
 */
export type FetchJson = (path: string) => Promise<unknown>;

export type LoadPack = <P extends PackName>(name: P) => Promise<PackFiles[P]>;

/** A `LoadPack` that keeps what it loaded, until told to forget a pack. */
export interface PackLoader extends LoadPack {
  /**
   * Drops the pack's load (its version switched or it was removed): the next call
   * reads its files again. A name that is not a pack is ignored.
   */
  forget(name: string): void;
}

const LOADERS: {
  [P in PackName]: (fetchJson: FetchJson) => Promise<PackFiles[P]>;
} = {
  en: (fetchJson) =>
    loadFiles(
      "en",
      [
        "lemmas",
        "freq",
        "ipa",
        "pos",
        "vocab",
        "phrases",
        "names",
        "tagger",
        "contractions",
      ],
      fetchJson,
    ),
  // The dictionaries are split into shards (each well under the 5 MB that AMO's linter
  // allows per text file), listed in index.json.
  "en-ja": async (fetchJson) => {
    const [dict, phrases, capital, sensePos] = await Promise.all([
      loadShards<DictPack[string]>("/packs/en-ja", fetchJson),
      fetchJson("/packs/en-ja/phrases.json") as Promise<DictPack>,
      fetchJson("/packs/en-ja/capital.json") as Promise<DictPack>,
      fetchJson("/packs/en-ja/pos.json") as Promise<SensePosPack>,
    ]);
    return { dict, phrases, capital, sensePos };
  },
  "en-defs": async (fetchJson) => ({
    defs: await loadShards("/packs/en-defs", fetchJson),
  }),
  // Every kaikki form of the Spanish vocabulary (~10 MB) is sharded like a dictionary;
  // the shards are kept apart (`LemmaShards`).
  es: async (fetchJson) => {
    const [lemmas, files] = await Promise.all([
      readShards<LemmaPack>("/packs/es/lemmas", fetchJson),
      loadFiles(
        "es",
        ["freq", "ipa", "pos", "vocab", "phrases", "names", "tagger"],
        fetchJson,
      ),
    ]);
    return { ...files, lemmas };
  },
  "es-en": async (fetchJson) => ({
    defs: await loadShards("/packs/es-en", fetchJson),
  }),
  ...(Object.fromEntries(
    recipeNatives().map((native) => [
      `en-${native}`,
      async (fetchJson: FetchJson) => ({
        dict: await loadShards(`/packs/en-${native}`, fetchJson),
      }),
    ]),
  ) as {
    [P in RecipePairPack]: (fetchJson: FetchJson) => Promise<PackFiles[P]>;
  }),
};

/**
 * A pack loader that fetches each pack once and keeps it for the lifetime of the
 * context (the background's service worker), or until `forget`. Overlapping calls
 * share one load; a failed load is forgotten so the next call tries again.
 */
export function createPackLoader(fetchJson: FetchJson): PackLoader {
  const loads = promiseCache<unknown>({ keep: true });
  const loadPack = <P extends PackName>(name: P) =>
    loads.get(name, () => LOADERS[name](fetchJson)) as Promise<PackFiles[P]>;
  return Object.assign(loadPack, {
    forget(name: string) {
      loads.delete(name);
    },
  });
}

async function loadFiles<P extends PackName>(
  name: P,
  files: readonly (keyof PackFiles[P] & string)[],
  fetchJson: FetchJson,
): Promise<PackFiles[P]> {
  const values = await Promise.all(
    files.map((file) => fetchJson(`/packs/${name}/${file}.json`)),
  );
  return Object.fromEntries(
    files.map((file, i) => [file, values[i]]),
  ) as PackFiles[P];
}

/** Reads every shard listed in `<dir>/index.json` at once, in their order. */
async function readShards<S>(dir: string, fetchJson: FetchJson): Promise<S[]> {
  const index = (await fetchJson(`${dir}/index.json`)) as ShardIndex;
  return (await Promise.all(
    index.shards.map(({ file }) => fetchJson(`${dir}/${file}`)),
  )) as S[];
}

/** Reads every shard listed in `<dir>/index.json` at once and merges them. */
async function loadShards<T>(
  dir: string,
  fetchJson: FetchJson,
): Promise<Readonly<Record<string, T>>> {
  const shards = await readShards<Record<string, T>>(dir, fetchJson);
  // fromEntries defines own properties, so a headword like "__proto__" stays an entry.
  return Object.fromEntries(shards.flatMap((shard) => Object.entries(shard)));
}
