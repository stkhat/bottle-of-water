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
import { buildId, syncBuild } from "./build-check.ts";

let dir: string;
const put = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const read = (path: string) => readFileSync(join(dir, path), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "build-check-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("syncBuild", () => {
  it("copies the build into a new folder and writes the build id", () => {
    put("from/manifest.json", "{}");
    put("from/chunks/a.js", "a");
    syncBuild(join(dir, "from"), join(dir, "to"), "id-1");
    expect(read("to/manifest.json")).toBe("{}");
    expect(read("to/chunks/a.js")).toBe("a");
    expect(read("to/build-id.txt")).toBe("id-1\n");
  });

  it("overwrites changed files and deletes the ones the new build no longer has", () => {
    put("to/manifest.json", "old");
    put("to/chunks/gone.js", "gone");
    put("to/stale/x.js", "x");
    put("to/build-id.txt", "id-1\n");
    put("from/manifest.json", "new");
    put("from/chunks/b.js", "b");
    syncBuild(join(dir, "from"), join(dir, "to"), "id-2");
    expect(read("to/manifest.json")).toBe("new");
    expect(read("to/chunks/b.js")).toBe("b");
    expect(existsSync(join(dir, "to/chunks/gone.js"))).toBe(false);
    expect(existsSync(join(dir, "to/stale"))).toBe(false);
    expect(read("to/build-id.txt")).toBe("id-2\n");
  });
});

describe("buildId", () => {
  it("is the time and the commit", () => {
    expect(buildId(new Date("2026-11-10T10:00:00.000Z"), "abc1234")).toBe(
      "2026-11-10T10:00:00.000Z abc1234",
    );
  });
});
