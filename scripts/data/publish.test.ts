import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PACK_FORMATS, PACKS, type PackInfo } from "./formats.mjs";
import {
  buildLock,
  dateVersion,
  listPackFiles,
  LOCK_PATH,
  MIRRORS,
  nextVersion,
  publish,
  type PackLock,
} from "./publish.mjs";

let dir: string;
const put = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const read = (path: string) => readFileSync(join(dir, path), "utf8");
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

const info = (name: string, downloadable: boolean): PackInfo => ({
  dir: join(dir, downloadable ? "data" : "public", name),
  downloadable,
  format: name === "es" ? 2 : 1,
  package: `@test-scope/${name}`,
  license: {
    spdx: "CC-BY-SA-4.0",
    name: "CC BY-SA 4.0 (full name)",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  changes: "entries were selected",
  title: `${name} data`,
  description: `The ${name} pack`,
  sources: [
    {
      title: "Some Wiktionary",
      url: "https://example.org/wiktionary",
      by: "its contributors",
      license: "CC BY-SA 4.0",
      used: "everything",
    },
  ],
});

let packs: Record<string, PackInfo>;
const NOV_11 = new Date("2026-11-11T09:00:00Z");
const NOV_12 = new Date("2026-11-12T09:00:00Z");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "publish-"));
  packs = { en: info("en", false), es: info("es", true) };
  put("public/en/freq.json", '["the"]\n');
  put("data/es/freq.json", '["de"]\n');
  put("data/es/sub/dict-1.json", '{"comer":1}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("listPackFiles", () => {
  it("lists every file under a folder, sorted, with its size and SHA-256", () => {
    put("data/es/a.json", "{}\n");
    expect(listPackFiles(join(dir, "data/es"))).toEqual([
      { path: "a.json", size: 3, sha256: sha256("{}\n") },
      { path: "freq.json", size: 7, sha256: sha256('["de"]\n') },
      { path: "sub/dict-1.json", size: 12, sha256: sha256('{"comer":1}\n') },
    ]);
  });
});

/** Compares two plain semver versions (MAJOR.MINOR.PATCH, no prerelease) as npm does. */
const compareSemver = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return x![i]! - y![i]!;
  return 0;
};
const PLAIN_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

describe("dateVersion", () => {
  it("is the UTC year, then month × 100 + day", () => {
    expect(dateVersion(NOV_11)).toBe("2026.1111");
    expect(dateVersion(new Date("2027-01-05T09:00:00Z"))).toBe("2027.105");
    expect(dateVersion(new Date("2027-01-05T23:30:00-05:00"))).toBe("2027.106");
  });
});

describe("nextVersion", () => {
  const files = [{ path: "a.json", size: 1, sha256: "aa" }];
  const entry = (version: string, sha = "aa") => ({
    package: "@test-scope/es",
    version,
    format: 1,
    bundled: true,
    files: [{ path: "a.json", size: 1, sha256: sha }],
  });
  const changed = (version: string, now: Date) =>
    nextVersion(files, entry(version, "bb"), now);

  it("is the date's first version for a new pack", () => {
    expect(nextVersion(files, undefined, NOV_11)).toBe("2026.1111.0");
  });
  it("stays while the files are the same", () => {
    expect(nextVersion(files, entry("2026.1101.3"), NOV_11)).toBe(
      "2026.1101.3",
    );
  });
  it("is the date's first version when the files changed on another day", () => {
    expect(changed("2026.1101.3", NOV_11)).toBe("2026.1111.0");
    expect(
      nextVersion(
        [...files, { path: "b.json", size: 1, sha256: "cc" }],
        entry("2026.1101.0"),
        NOV_11,
      ),
    ).toBe("2026.1111.0");
    expect(changed("2026.1111.4", NOV_12)).toBe("2026.1112.0");
  });
  it("counts up for each later change on the same day", () => {
    expect(changed("2026.1111.0", NOV_11)).toBe("2026.1111.1");
    expect(changed("2026.1111.1", NOV_11)).toBe("2026.1111.2");
    expect(changed("2026.1111.9", NOV_11)).toBe("2026.1111.10");
  });
  it("gives plain semver versions that order by date, across months and years", () => {
    const versions = [
      nextVersion(files, undefined, new Date("2026-01-05T00:00:00Z")),
      nextVersion(files, undefined, new Date("2026-01-31T23:59:59Z")),
      nextVersion(files, undefined, new Date("2026-02-01T00:00:00Z")),
      nextVersion(files, undefined, new Date("2026-09-30T12:00:00Z")),
      nextVersion(files, undefined, new Date("2026-10-01T12:00:00Z")),
      changed("2026.1001.0", new Date("2026-10-01T13:00:00Z")),
      nextVersion(files, undefined, NOV_11),
      nextVersion(files, undefined, new Date("2026-12-31T00:00:00Z")),
      nextVersion(files, undefined, new Date("2027-01-01T00:00:00Z")),
    ];
    expect(versions).toEqual([
      "2026.105.0",
      "2026.131.0",
      "2026.201.0",
      "2026.930.0",
      "2026.1001.0",
      "2026.1001.1",
      "2026.1111.0",
      "2026.1231.0",
      "2027.101.0",
    ]);
    for (const version of versions) expect(version).toMatch(PLAIN_SEMVER);
    for (let i = 1; i < versions.length; i++)
      expect(compareSemver(versions[i - 1]!, versions[i]!)).toBeLessThan(0);
  });
});

describe("buildLock", () => {
  it("lists each pack's package, version, format and files, every pack bundled", () => {
    const lock = buildLock(packs, { now: NOV_11 });
    expect(lock).toEqual({
      v: 1,
      mirrors: MIRRORS,
      packs: {
        en: {
          package: "@test-scope/en",
          version: "2026.1111.0",
          format: 1,
          bundled: true,
          files: [{ path: "freq.json", size: 8, sha256: sha256('["the"]\n') }],
        },
        es: {
          package: "@test-scope/es",
          version: "2026.1111.0",
          format: 2,
          bundled: true,
          files: [
            { path: "freq.json", size: 7, sha256: sha256('["de"]\n') },
            {
              path: "sub/dict-1.json",
              size: 12,
              sha256: sha256('{"comer":1}\n'),
            },
          ],
        },
      },
    });
  });
  it("marks the packs to download as not bundled", () => {
    const lock = buildLock(packs, { download: ["es"], now: NOV_11 });
    expect(lock.packs.es?.bundled).toBe(false);
    expect(lock.packs.en?.bundled).toBe(true);
  });
  it("refuses to download a pack from public/packs or an unknown pack", () => {
    expect(() => buildLock(packs, { download: ["en"] })).toThrow(
      /en is always bundled/,
    );
    expect(() => buildLock(packs, { download: ["fr"] })).toThrow(
      /Unknown pack: fr/,
    );
  });
  it("refuses a pack without files and a folder without a pack", () => {
    rmSync(join(dir, "data/es"), { recursive: true });
    mkdirSync(join(dir, "data/es"));
    expect(() => buildLock(packs)).toThrow(/es has no files/);
    put("data/es/freq.json", "[]\n");
    put("data/fr/freq.json", "[]\n");
    expect(() => buildLock(packs)).toThrow(/fr is not a known pack/);
  });
});

describe("publish", () => {
  const options = () => ({
    packs,
    lockPath: join(dir, "src/packs.lock.json"),
    publishDir: join(dir, "publish"),
  });
  const lockOf = () => JSON.parse(read("src/packs.lock.json")) as PackLock;

  it("writes the lock with sorted keys and two-space indents", () => {
    publish({ ...options(), now: NOV_11 });
    const text = read("src/packs.lock.json");
    const lock = JSON.parse(text) as PackLock;
    expect(text).toBe(`${JSON.stringify(sortKeys(lock), null, 2)}\n`);
    expect(Object.keys(lock)).toEqual(["mirrors", "packs", "v"]);
    expect(Object.keys(lock.packs.es!)).toEqual([
      "bundled",
      "files",
      "format",
      "package",
      "version",
    ]);
  });
  it("keeps a pack's version while its files are the same, and bumps it when they change", () => {
    publish({ ...options(), now: NOV_11 });
    const first = read("src/packs.lock.json");
    publish({ ...options(), now: NOV_12 });
    expect(read("src/packs.lock.json")).toBe(first);

    put("data/es/freq.json", '["de","la"]\n');
    publish({ ...options(), now: NOV_11 });
    expect(lockOf().packs.es?.version).toBe("2026.1111.1");
    expect(lockOf().packs.en?.version).toBe("2026.1111.0");
  });
  it("sets bundled from the download option on each run", () => {
    publish({ ...options(), download: ["es"], now: NOV_11 });
    expect(lockOf().packs.es?.bundled).toBe(false);
    publish({ ...options(), now: NOV_11 });
    expect(lockOf().packs.es?.bundled).toBe(true);
    expect(lockOf().packs.es?.version).toBe("2026.1111.0");
  });
  it("writes an npm package folder for each pack in data/packs", () => {
    put("publish/es/stale.json", "{}");
    publish({ ...options(), now: NOV_11 });
    expect(existsSync(join(dir, "publish/en"))).toBe(false);
    expect(existsSync(join(dir, "publish/es/stale.json"))).toBe(false);
    expect(read("publish/es/freq.json")).toBe('["de"]\n');
    expect(read("publish/es/sub/dict-1.json")).toBe('{"comer":1}\n');
    expect(JSON.parse(read("publish/es/package.json"))).toEqual({
      name: "@test-scope/es",
      version: "2026.1111.0",
      description: "The es pack, for the Lingo browser extension",
      license: "CC-BY-SA-4.0",
      files: ["freq.json", "sub/dict-1.json"],
      publishConfig: { access: "public" },
    });
    const license = read("publish/es/LICENSE");
    expect(license).toContain("CC BY-SA 4.0 (full name)");
    expect(license).toContain(
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    expect(license).toContain(
      "Some Wiktionary (https://example.org/wiktionary)",
    );
    expect(license).toContain("entries were selected");
    const readme = read("publish/es/README.md");
    expect(readme).toMatch(/^# @test-scope\/es\n/);
    expect(readme).toContain("es data");
    expect(readme).toContain("Lingo");
    expect(readme).toContain(
      "[Some Wiktionary](https://example.org/wiktionary)",
    );
  });
});

describe("the committed lock", () => {
  const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as PackLock;

  it("matches the pack files and formats (else run npm run data:publish)", () => {
    const download = Object.entries(lock.packs)
      .filter(([, entry]) => !entry.bundled)
      .map(([name]) => name);
    expect(buildLock(PACKS, { previous: lock, download })).toEqual(lock);
    expect(
      Object.fromEntries(
        Object.entries(lock.packs).map(([name, e]) => [name, e.format]),
      ),
    ).toEqual(PACK_FORMATS);
  });
});

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
}
