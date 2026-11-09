export interface KaikkiResult {
  lemmas: Record<string, string | string[]>;
  ipa: Record<string, string>;
  pos: Record<string, string[]>;
  stats: { entries: number; unparsable: number };
}
export function posLabel(pos: string): string;
export function importKaikki(
  path: string,
  vocab: Iterable<string>,
  dict?: Record<string, [short: string, senses: string[]]>,
): Promise<KaikkiResult>;
