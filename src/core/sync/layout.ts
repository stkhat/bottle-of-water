/**
 * Where a language's sync data lives in `storage.sync`: `sync:<lang>:meta` points at
 * the chunks `sync:<lang>:0` … `sync:<lang>:<n-1>`.
 */

export interface SyncMeta {
  chunks: number;
  /** When the chunks were written (ms, the writer's clock). */
  updatedAt: number;
  v: 1;
}

export const metaKey = (lang: string) => `sync:${lang}:meta`;
export const chunkKey = (lang: string, i: number) => `sync:${lang}:${i}`;

/** The language of a `sync:<lang>:…` key, or `undefined` for other keys. */
export function langOfKey(key: string): string | undefined {
  return /^sync:([^:]+):[^:]+$/.exec(key)?.[1];
}

const encoder = new TextEncoder();

/** What one item costs against the quota: the key plus the value as JSON, in UTF-8 bytes. */
export const itemBytes = (key: string, value: unknown) =>
  encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;
