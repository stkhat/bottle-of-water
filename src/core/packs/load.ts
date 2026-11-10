import type {
  DefsPack,
  DictPack,
  FreqPack,
  IpaPack,
  LemmaPack,
  PhrasesPack,
  PosPack,
  ShardIndex,
  VocabPack,
} from "./types";

/** The bundled packs in public/packs/<name>/ and what each one holds once loaded. */
export interface PackFiles {
  en: {
    lemmas: LemmaPack;
    freq: FreqPack;
    ipa: IpaPack;
    pos: PosPack;
    vocab: VocabPack;
    phrases: PhrasesPack;
  };
  "en-ja": { dict: DictPack; phrases: DictPack };
  "en-defs": { defs: DefsPack };
}
export type PackName = keyof PackFiles;

/** Reads a JSON file bundled with the extension, by its path from the root ("/packs/…"). */
export type FetchJson = (path: string) => Promise<unknown>;

export type LoadPack = <P extends PackName>(name: P) => Promise<PackFiles[P]>;

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
};

/**
 * A pack loader that fetches each pack once and keeps it for the lifetime of the
 * context (the background's service worker). Overlapping calls share one load; a
 * failed load is forgotten so the next call tries again.
 */
export function createPackLoader(fetchJson: FetchJson): LoadPack {
  const loads = new Map<PackName, Promise<unknown>>();
  return <P extends PackName>(name: P) => {
    let load = loads.get(name);
    if (!load) {
      load = LOADERS[name](fetchJson);
      load.catch(() => loads.delete(name));
      loads.set(name, load);
    }
    return load as Promise<PackFiles[P]>;
  };
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
