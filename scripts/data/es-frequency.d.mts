export const ES_FORMS: number;
export function parseEsFrequencyWikitext(text: string): string[];
export function frequencyForms(entries: string[]): string[];
export function frequencyPageTitles(ranks: number): string[];
export function readEsFrequency(ranks?: number): Promise<string[]>;
