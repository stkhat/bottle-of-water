import type {
  DefsPack,
  DictPack,
  FreqPack,
  IpaPack,
  LemmaPack,
  PairPack,
  PosPack,
  ShardIndex,
  VocabPack,
} from "./types";
import type { PhrasePatterns } from "../phrases/pattern";
import { promiseCache } from "../util";

/**
 * The packs (built into public/packs/<name>/ or data/packs/<name>/, served at
 * /packs/<name>/) and what each one holds once loaded.
 */
export interface PackFiles {
  en: {
    lemmas: LemmaPack;
    freq: FreqPack;
    ipa: IpaPack;
    pos: PosPack;
    vocab: VocabPack;
    phrases: PhrasePatterns;
  };
  "en-ja": { dict: DictPack; phrases: DictPack };
  "en-defs": { defs: DefsPack };
  es: {
    lemmas: LemmaPack;
    freq: FreqPack;
    ipa: IpaPack;
    vocab: VocabPack;
    phrases: PhrasePatterns;
  };
  "es-en": { defs: DefsPack };
  "en-es": { dict: PairPack };
  "en-pt": { dict: PairPack };
}
export type PackName = keyof PackFiles;

/**
 * Reads a pack's JSON file by its path from the extension's root ("/packs/<pack>/…"):
 * bundled with the extension, or downloaded (`createPackSource`).
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
      ["lemmas", "freq", "ipa", "pos", "vocab", "phrases"],
      fetchJson,
    ),
  // The dictionaries are split into shards (each well under the 5 MB that AMO's linter
  // allows per text file), listed in index.json.
  "en-ja": async (fetchJson) => {
    const [dict, phrases] = await Promise.all([
      loadShards<DictPack[string]>("/packs/en-ja", fetchJson),
      fetchJson("/packs/en-ja/phrases.json") as Promise<DictPack>,
    ]);
    return { dict, phrases };
  },
  "en-defs": async (fetchJson) => ({
    defs: await loadShards("/packs/en-defs", fetchJson),
  }),
  es: (fetchJson) =>
    loadFiles("es", ["lemmas", "freq", "ipa", "vocab", "phrases"], fetchJson),
  "es-en": async (fetchJson) => ({
    defs: await loadShards("/packs/es-en", fetchJson),
  }),
  "en-es": async (fetchJson) => ({
    dict: await loadShards("/packs/en-es", fetchJson),
  }),
  "en-pt": async (fetchJson) => ({
    dict: await loadShards("/packs/en-pt", fetchJson),
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

/** Reads every shard listed in `<dir>/index.json` at once and merges them. */
async function loadShards<T>(
  dir: string,
  fetchJson: FetchJson,
): Promise<Readonly<Record<string, T>>> {
  const index = (await fetchJson(`${dir}/index.json`)) as ShardIndex;
  const shards = (await Promise.all(
    index.shards.map(({ file }) => fetchJson(`${dir}/${file}`)),
  )) as Record<string, T>[];
  // fromEntries defines own properties, so a headword like "__proto__" stays an entry.
  return Object.fromEntries(shards.flatMap((shard) => Object.entries(shard)));
}
