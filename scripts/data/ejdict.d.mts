export type Dict = Record<string, [short: string, senses: string[]]>;
export function cleanShort(sense: string): string;
export function parseEjdict(text: string): Dict;
export function vocabularyOf(dict: Dict): string[];
export const EJDICT_DIR: string;
export const SHARD_MAX_BYTES: number;
export interface ShardIndex {
  shards: { file: string; first: string; last: string }[];
}
export interface DictShards {
  index: ShardIndex;
  shards: { file: string; dict: Dict }[];
}
export function shardDict(dict: Dict, maxBytes?: number): DictShards;
export function writeDictPacks(dict: Dict): DictShards;
export function readDictPacks(): Dict;
