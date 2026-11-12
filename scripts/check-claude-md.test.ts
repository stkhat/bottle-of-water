import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkFiles, countLines } from "./check-claude-md.ts";

const script = join(import.meta.dirname, "check-claude-md.ts");
const lines = (n: number, eol = "\n", trailing = true) =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join(eol) +
  (trailing ? eol : "");

describe("countLines", () => {
  it("counts an empty string as 0", () => {
    expect(countLines("")).toBe(0);
  });
  it("does not count a trailing newline as a line", () => {
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
  });
  it("counts CRLF the same as LF", () => {
    expect(countLines(lines(10, "\r\n"))).toBe(countLines(lines(10, "\n")));
    expect(countLines("a\r\nb\r\n")).toBe(2);
  });
});

describe("checkFiles and CLI", () => {
  let dir: string;
  const file = (name: string, content: string) => {
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
  };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "claude-md-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("passes a file with exactly 150 lines", () => {
    expect(checkFiles([file("ok.md", lines(150))])).toEqual([]);
  });
  it("fails a file with 151 lines", () => {
    const p = file("big.md", lines(151));
    expect(checkFiles([p])).toEqual([{ path: p, lines: 151 }]);
  });
  it("counts CRLF files the same", () => {
    expect(checkFiles([file("crlf.md", lines(150, "\r\n"))])).toEqual([]);
    expect(checkFiles([file("crlf2.md", lines(151, "\r\n"))])).toHaveLength(1);
  });
  it("honours a custom limit", () => {
    expect(checkFiles([file("l.md", lines(5))], 4)).toHaveLength(1);
  });

  const hook = (input: string) =>
    spawnSync("node", [script, "--hook"], { input, encoding: "utf8" });
  const payload = (file_path: string) =>
    JSON.stringify({ tool_input: { file_path } });

  it("hook: blocks an over-long CLAUDE.md with exit 2 and a reason", () => {
    const sub = join(dir, "sub");
    spawnSync("node", [
      "-e",
      `require("fs").mkdirSync(${JSON.stringify(sub)})`,
    ]);
    const p = join(sub, "CLAUDE.md");
    writeFileSync(p, lines(151));
    const r = hook(payload(p));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("CLAUDE.md has 151 lines; the limit is 150");
  });
  it("hook: allows a short CLAUDE.md", () => {
    const p = join(dir, "CLAUDE.md");
    writeFileSync(p, lines(10));
    expect(hook(payload(p)).status).toBe(0);
  });
  it("hook: ignores other file names even if long", () => {
    expect(hook(payload(file("notes.md", lines(500)))).status).toBe(0);
  });
  it("hook: ignores malformed input", () => {
    expect(hook("not json").status).toBe(0);
    expect(hook("").status).toBe(0);
    expect(hook("{}").status).toBe(0);
  });
  it("hook: ignores a missing file", () => {
    expect(hook(payload(join(dir, "nope", "CLAUDE.md"))).status).toBe(0);
  });
});
