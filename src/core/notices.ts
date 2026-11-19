/**
 * The data sources and licenses page (`entrypoints/notices`), made at build time from
 * `scripts/data/formats.ts` and the full notices in `scripts/data/licenses/`
 * (`scripts/notices-data.ts`, served as `virtual:langle-notices` by `scripts/notices.ts`).
 */
export interface NoticesData {
  /** Every language pack, as its npm package carries its notices. */
  packs: NoticePack[];
  /** The full notices a license asks every copy to carry (WordNet-style). */
  notices: { title: string; text: string }[];
}

interface NoticeLicense {
  name: string;
  url?: string;
}

export interface NoticePack {
  /** The npm package (`@langle/en-ja`). */
  package: string;
  title: string;
  /** The pack's license as a whole. */
  license: NoticeLicense;
  /** How the files differ from the sources. */
  changes: string;
  sources: NoticeSource[];
}

interface NoticeSource {
  title: string;
  url: string;
  /** How the data was taken from the source, if not directly. */
  via?: string;
  by: string;
  license: NoticeLicense;
  /** What the pack takes from the source. */
  used: string;
}
