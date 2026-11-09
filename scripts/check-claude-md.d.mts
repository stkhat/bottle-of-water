export function countLines(text: string): number;
export function checkFiles(
  paths: string[],
  limit?: number,
): { path: string; lines: number }[];
