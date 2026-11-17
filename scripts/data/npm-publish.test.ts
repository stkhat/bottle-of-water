import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PackLock } from "../../src/core/packs/lock.ts";
import { PACKS, type PackInfo } from "./formats.ts";
import { lockProblems, unpublished } from "./npm-publish.ts";
import { buildLock, LOCK_PATH } from "./publish.ts";

let dir: string;
const put = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};

const info = (name: string, downloadable: boolean): PackInfo => ({
  dir: join(dir, downloadable ? "data" : "public", name),
  downloadable,
  format: 1,
  package: `@test-scope/${name}`,
  license: { spdx: "CC-BY-SA-4.0", name: "CC BY-SA 4.0", url: "https://x" },
  changes: "",
  title: name,
  description: name,
  sources: [],
});

let packs: Record<string, PackInfo>;
const lockFor = (p: Record<string, PackInfo>) =>
  buildLock(p, { download: ["es"], now: new Date("2026-11-17T00:00:00Z") });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "npm-publish-"));
  packs = { en: info("en", false), es: info("es", true) };
  put("public/en/freq.json", '["the"]\n');
  put("data/es/freq.json", '["de"]\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("lockProblems", () => {
  it("finds none when the lock describes the files", () => {
    expect(lockProblems(packs, lockFor(packs))).toEqual([]);
  });

  it("finds a downloadable pack whose files changed after the lock was written", () => {
    const lock = lockFor(packs);
    put("data/es/freq.json", '["la"]\n');
    expect(lockProblems(packs, lock)).toEqual([
      "es: its files differ from the lock",
    ]);
  });

  it("ignores bundled packs, which are not published", () => {
    const lock = lockFor(packs);
    put("public/en/freq.json", '["a"]\n');
    expect(lockProblems(packs, lock)).toEqual([]);
  });

  it("finds a package name that differs from formats.ts", () => {
    const lock = lockFor(packs);
    const renamed = {
      ...packs,
      es: { ...info("es", true), package: "@new/es" },
    };
    expect(lockProblems(renamed, lock)).toEqual([
      "es: the lock names @test-scope/es, formats.ts @new/es",
    ]);
  });

  it("finds none for the committed lock", () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as PackLock;
    expect(lockProblems(PACKS, lock)).toEqual([]);
  });
});

describe("unpublished", () => {
  it("keeps the packages npm does not have", () => {
    const a = { name: "@s/a", version: "2026.1117.0", dir: "a" };
    const b = { name: "@s/b", version: "2026.1111.0", dir: "b" };
    expect(unpublished([a, b], (pkg) => pkg === b)).toEqual([a]);
  });
});
