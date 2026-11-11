// Guard: addons.mozilla.org's linter (web-ext lint) rejects text files over 5 MB, so
// every pack file that may be bundled (public/packs/, and data/packs/ while its lock
// entry says bundled) must stay well under that.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_PACKS_DIR, PACKS_DIR, ROOT } from "./common.mjs";

const LIMIT_BYTES = 4_000_000;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe.each(
  [PACKS_DIR, DOWNLOAD_PACKS_DIR].map((dir) => [relative(ROOT, dir), dir]),
)("pack files in %s", (_name, dir) => {
  const files = filesUnder(dir);

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files.map((path) => [relative(dir, path), path]))(
    "%s is under 4 MB",
    (_file, path) => {
      expect(statSync(path).size).toBeLessThan(LIMIT_BYTES);
    },
  );
});
