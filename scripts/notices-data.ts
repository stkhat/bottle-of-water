import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NoticesData } from "../src/core/notices.ts";
import { NOTICES_DIR, PACKS } from "./data/formats.ts";

/**
 * What the extension's data sources and licenses page lists: every pack with its
 * license, changes and sources (as `scripts/data/formats.ts` records them for the npm
 * packages), and the full text of each notice a source's license asks every copy to
 * carry, once.
 */
export function noticesData(): NoticesData {
  const notices = new Map<string, { title: string; text: string }>();
  const packs = Object.values(PACKS).map((info) => ({
    package: info.package,
    title: info.title,
    license: { name: info.license.name, url: info.license.url },
    changes: info.changes,
    sources: info.sources.map((source) => {
      const { notice } = source.license;
      if (notice && !notices.has(notice))
        notices.set(notice, {
          title: source.license.name,
          text: readFileSync(join(NOTICES_DIR, notice), "utf8").trimEnd(),
        });
      return {
        title: source.title,
        url: source.url,
        ...(source.via !== undefined && { via: source.via }),
        by: source.by,
        license: {
          name: source.license.name,
          ...(source.license.url !== undefined && { url: source.license.url }),
        },
        used: source.used,
      };
    }),
  }));
  return { packs, notices: [...notices.values()] };
}
