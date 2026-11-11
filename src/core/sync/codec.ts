/**
 * The compact form of a language's terms in `storage.sync` (spec: "Sync").
 * One line per term, `key \t code \t minutes in base36`, sorted by key, gzip, base64,
 * cut into chunks small enough for one `storage.sync` item each.
 */

export type SyncRecordStatus = "learning" | "known" | "removed";

export interface SyncRecord {
  /** The term's key; a phrase's base forms are joined by spaces. */
  key: string;
  status: SyncRecordStatus;
  /** Last change, in whole minutes since the Unix epoch. */
  updatedMinutes: number;
}

/** The longest chunk; leaves room in an 8,192-byte item for the key and quotes. */
export const CHUNK_CHARS = 7000;

const MINUTE = 60_000;

export const toMinutes = (ms: number) => Math.floor(ms / MINUTE);
export const fromMinutes = (minutes: number) => minutes * MINUTE;

const CODES: Record<SyncRecordStatus, string> = {
  learning: "l",
  known: "k",
  removed: "x",
};
const STATUSES = new Map(
  Object.entries(CODES).map(([status, code]) => [
    code,
    status as SyncRecordStatus,
  ]),
);

const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  "\t": "\\t",
  "\n": "\\n",
  "\r": "\\r",
};
const UNESCAPES: Record<string, string> = Object.fromEntries(
  Object.entries(ESCAPES).map(([char, escaped]) => [escaped[1], char]),
);

const escapeKey = (key: string) =>
  key.replace(/[\\\t\n\r]/g, (c) => ESCAPES[c]!);

function unescapeKey(key: string): string {
  return key.replace(/\\(.)/g, (_whole, c: string) => {
    const char = UNESCAPES[c];
    if (char === undefined) throw damaged();
    return char;
  });
}

const damaged = () => new Error("The synced data is damaged");

/** Orders strings by Unicode code point (not UTF-16 unit), like most other languages. */
export function compareKeys(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(i)!;
    if (x !== y) return x - y;
    if (x > 0xffff) i++;
  }
  return a.length - b.length;
}

const byKey = (a: SyncRecord, b: SyncRecord) => compareKeys(a.key, b.key);

const isMinutes = (n: number) => Number.isSafeInteger(n) && n >= 0;

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Packs records into base64 chunks of at most `chunkChars` characters. */
export async function encode(
  records: readonly SyncRecord[],
  { chunkChars = CHUNK_CHARS }: { chunkChars?: number } = {},
): Promise<string[]> {
  if (records.length === 0) return [];
  const lines = [...records].sort(byKey).map((r) => {
    if (!isMinutes(r.updatedMinutes))
      throw new RangeError(
        `updatedMinutes must be whole minutes from 0: ${r.updatedMinutes}`,
      );
    const code = CODES[r.status];
    if (code === undefined)
      throw new RangeError(`Unknown status: ${String(r.status)}`);
    return `${escapeKey(r.key)}\t${code}\t${r.updatedMinutes.toString(36)}`;
  });
  const text = toBase64(await gzip(lines.join("\n")));
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkChars)
    chunks.push(text.slice(i, i + chunkChars));
  return chunks;
}

/** Unpacks chunks written by `encode`. Rejects data that is incomplete or damaged. */
export async function decode(chunks: readonly string[]): Promise<SyncRecord[]> {
  if (chunks.length === 0) return [];
  const text = await gunzip(fromBase64(chunks.join("")));
  return text.split("\n").map((line) => {
    const fields = line.split("\t");
    if (fields.length !== 3) throw damaged();
    const [key, code, minutes] = fields as [string, string, string];
    const status = STATUSES.get(code);
    if (status === undefined || !/^[0-9a-z]+$/.test(minutes)) throw damaged();
    const updatedMinutes = parseInt(minutes, 36);
    if (!isMinutes(updatedMinutes)) throw damaged();
    return { key: unescapeKey(key), status, updatedMinutes };
  });
}

export interface MergeResult {
  /** Every key from both sides with its winning version, sorted by key. */
  merged: SyncRecord[];
  /** The remote versions that win over (or are missing from) the local side. */
  changedLocal: SyncRecord[];
}

/**
 * Per key, the newer `updatedMinutes` wins and equal times keep the local version,
 * so a removal (tombstone) wins only when it is strictly newer.
 */
export function merge(
  local: readonly SyncRecord[],
  remote: readonly SyncRecord[],
): MergeResult {
  const byKeyMap = new Map(local.map((r) => [r.key, r]));
  const changedLocal: SyncRecord[] = [];
  for (const theirs of remote) {
    const ours = byKeyMap.get(theirs.key);
    if (ours && ours.updatedMinutes >= theirs.updatedMinutes) continue;
    byKeyMap.set(theirs.key, theirs);
    changedLocal.push(theirs);
  }
  return {
    merged: [...byKeyMap.values()].sort(byKey),
    changedLocal: changedLocal.sort(byKey),
  };
}
