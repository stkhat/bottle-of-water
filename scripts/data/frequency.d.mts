export interface FrequencyRow {
  rank: number;
  words: string[];
}
export function isListPage(title: string): boolean;
export function parseFrequencyWikitext(text: string): FrequencyRow[];
export function buildFrequency(
  rows: FrequencyRow[],
  lemmas: Record<string, string | string[]>,
  vocab: Iterable<string>,
  limit?: number,
): string[];
