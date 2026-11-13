// Guard: addons.mozilla.org's linter (web-ext lint) rejects text files over 5 MB, so
// every pack file that may be bundled (public/packs/, and data/packs/ while its lock
// entry says bundled) must stay well under that.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_PACKS_DIR, PACKS_DIR, ROOT } from "./common.ts";

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

// Every English page loads these: the tagger with the language pack, the sense labels
// with the dictionary (docs/notes/data-sizes.md).
describe.each([
  ["en/tagger.json", 150_000],
  ["en-ja/pos.json", 100_000],
])("%s", (file, budget) => {
  it(`stays under ${budget / 1000} KB gzipped`, () => {
    const bytes = gzipSync(readFileSync(join(PACKS_DIR, file))).length;
    expect(bytes).toBeLessThan(budget);
  });
});
