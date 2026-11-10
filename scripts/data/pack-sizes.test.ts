// Guard: addons.mozilla.org's linter (web-ext lint) rejects text files over 5 MB, so
// every bundled pack file must stay well under that.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKS_DIR } from "./common.mjs";

const LIMIT_BYTES = 4_000_000;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("bundled pack files", () => {
  const files = filesUnder(PACKS_DIR);

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files.map((path) => [relative(PACKS_DIR, path), path]))(
    "%s is under 4 MB",
    (_name, path) => {
      expect(statSync(path).size).toBeLessThan(LIMIT_BYTES);
    },
  );
});
