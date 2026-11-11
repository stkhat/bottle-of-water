export const FUNCTION_POS: ReadonlySet<string>;
export const AUXILIARY_WORDS: ReadonlySet<string>;
export function isFunctionWord(word: string, pos: readonly string[]): boolean;
export function contentWords(options: {
  freq: readonly string[];
  pos: Readonly<Record<string, readonly string[]>>;
  lemmas: Readonly<Record<string, string | readonly string[]>>;
  vocab: ReadonlySet<string>;
  top: number;
  names?: ReadonlySet<string>;
}): { words: string[]; excluded: string[] };
