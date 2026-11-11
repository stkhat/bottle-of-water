export const PACK_FORMATS: Readonly<Record<string, number>>;
export const NPM_SCOPE: string;
export interface PackSource {
  title: string;
  url: string;
  /** How the data was taken from the source, if not directly. */
  via?: string;
  by: string;
  license: string;
  /** What the pack takes from the source. */
  used: string;
}
export interface PackInfo {
  /** The folder holding the pack's files (public/packs/<pack> or data/packs/<pack>). */
  dir: string;
  /** True for data/packs/ packs, which may be downloaded instead of bundled. */
  downloadable: boolean;
  format: number;
  /** The npm package name. */
  package: string;
  license: { spdx: string; name: string; url: string };
  /** How the files differ from the sources (for the license notice). */
  changes: string;
  title: string;
  description: string;
  sources: PackSource[];
}
export const PACKS: Readonly<Record<string, PackInfo>>;
export function packSourcePath(path: string): string;
