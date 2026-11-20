// Guards on the size of the language packs (docs/notes/data-sizes.md). Every pack is
// downloaded (none is bundled), but each file stays well under the 5 MB that
// addons.mozilla.org's linter (web-ext lint) allows per text file, so a pack could
// still ship inside the extension.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  learningLanguages,
  nativeLanguages,
} from "../../src/core/languages.ts";
import { packsFor } from "../../src/core/packs/pairs.ts";
import { PACKS_DIR } from "./common.ts";
import { PACKS } from "./formats.ts";

const FILE_LIMIT_BYTES = 4_000_000;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const bytesUnder = (dir: string) =>
  filesUnder(dir).reduce((sum, path) => sum + statSync(path).size, 0);

describe("pack files in data/packs", () => {
  const files = filesUnder(PACKS_DIR);

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files.map((path) => [relative(PACKS_DIR, path), path]))(
    "%s is under 4 MB",
    (_file, path) => {
      expect(statSync(path).size).toBeLessThan(FILE_LIMIT_BYTES);
    },
  );
});

// What one offered pair downloads (its packs, `packsFor`) stays at most 40 MB raw:
// English → Japanese, the largest, is about 35 MB raw and 9 MB gzipped on the wire.
const PAIR_LIMIT_BYTES = 40_000_000;
const pairs = learningLanguages().flatMap((learning) =>
  nativeLanguages(learning).map((native) => [
    `${learning}→${native}`,
    learning,
    native,
  ]),
);

it.each(pairs)("%s downloads at most 40 MB", (_pair, learning, native) => {
  const packs = packsFor(learning!, native!);
  expect(packs.length).toBeGreaterThan(0);
  const total = packs.reduce(
    (sum, pack) => sum + bytesUnder(PACKS[pack].dir),
    0,
  );
  expect(total).toBeLessThanOrEqual(PAIR_LIMIT_BYTES);
});

// Every English page loads these: the tagger and the phrase patterns with the language
// pack, the sense labels with the dictionary; every Spanish and French page its tagger
// (docs/notes/data-sizes.md). The phrase
// patterns are every multi-word entry of the source (rule B1): about 73,000, and the
// names that are units as written (about 2,500: 450 → 470 KB, 2026-11-20).
describe.each([
  ["en/tagger.json", 150_000],
  ["en/contractions.json", 5_000],
  ["es/tagger.json", 150_000],
  ["fr/tagger.json", 150_000],
  ["en/phrases.json", 470_000],
  ["en-ja/pos.json", 100_000],
])("%s", (file, budget) => {
  it(`stays under ${budget / 1000} KB gzipped`, () => {
    const bytes = gzipSync(readFileSync(join(PACKS_DIR, file))).length;
    expect(bytes).toBeLessThan(budget);
  });
});
