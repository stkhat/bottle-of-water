export function ipaCoverage(
  freq: string[],
  ipa: Record<string, string>,
  top: number,
): { words: number; withIpa: number; ratio: number };
