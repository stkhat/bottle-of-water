export type Dict = Record<string, [short: string, senses: string[]]>;
export function cleanShort(sense: string): string;
export function parseEjdict(text: string): Dict;
export function vocabularyOf(dict: Dict): string[];
