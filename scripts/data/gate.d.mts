export const GATE: { top: number; share: number };
export const TOPS: number[];
export interface Coverage {
  terms: number;
  covered: number;
  share: number;
  bySource: Record<string, number>;
}
export interface PairReport {
  pair: string;
  tops: Record<number, Coverage>;
  phrases: Coverage;
  passes: boolean;
}
export function coverage(
  terms: string[],
  sourceOf: (term: string) => string | undefined,
): Coverage;
export function pairCoverage(options: {
  words: string[];
  phrases: string[];
  sourceOf: (term: string) => string | undefined;
}): Omit<PairReport, "pair">;
export function gateReport(): PairReport[];
export function offeredPairs(
  report: Pick<PairReport, "pair" | "passes">[],
): Record<string, string[]>;
