import type { DictPack, FreqPack, IpaPack, LemmaPack, PosPack } from "./types";

/** The bundled packs in public/packs/<name>/ and the JSON files each one holds. */
export interface PackFiles {
  en: { lemmas: LemmaPack; freq: FreqPack; ipa: IpaPack; pos: PosPack };
  "en-ja": { dict: DictPack };
}
export type PackName = keyof PackFiles;

const FILES: { [P in PackName]: readonly (keyof PackFiles[P])[] } = {
  en: ["lemmas", "freq", "ipa", "pos"],
  "en-ja": ["dict"],
};

/** Reads a JSON file bundled with the extension, by its path from the root ("/packs/…"). */
export type FetchJson = (path: string) => Promise<unknown>;

export type LoadPack = <P extends PackName>(name: P) => Promise<PackFiles[P]>;

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
      load = loadFiles(name, fetchJson);
      load.catch(() => loads.delete(name));
      loads.set(name, load);
    }
    return load as Promise<PackFiles[P]>;
  };
}

async function loadFiles<P extends PackName>(
  name: P,
  fetchJson: FetchJson,
): Promise<PackFiles[P]> {
  const files = FILES[name] as readonly string[];
  const values = await Promise.all(
    files.map((file) => fetchJson(`/packs/${name}/${file}.json`)),
  );
  return Object.fromEntries(
    files.map((file, i) => [file, values[i]]),
  ) as PackFiles[P];
}
