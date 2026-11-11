import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { stringifyPack } from "./common.ts";

describe("the data scripts", () => {
  it("load under plain Node, with the src/ files they import", () => {
    const imports = readdirSync(import.meta.dirname, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map(
        (file) =>
          `await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, file)).href)});`,
      );
    const node = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", imports.join("\n")],
      { encoding: "utf8" },
    );
    expect(node.stderr).toBe("");
    expect(node.status).toBe(0);
  });
});

describe("stringifyPack", () => {
  it("sorts object keys by code unit, one entry per line", () => {
    const text = stringifyPack({ b: 1, B: [2], a: "x" });
    expect(text).toBe('{\n"B":[2],\n"a":"x",\n"b":1\n}\n');
    expect(JSON.parse(text)).toEqual({ a: "x", b: 1, B: [2] });
  });
  it("keeps array order, one item per line", () => {
    expect(stringifyPack(["the", "you"])).toBe('[\n"the",\n"you"\n]\n');
  });
  it("writes empty containers on one line", () => {
    expect(stringifyPack({})).toBe("{}\n");
    expect(stringifyPack([])).toBe("[]\n");
  });
  it("writes the lists of an object of lists one item per line too, if asked", () => {
    const value = { more: ["b"], detect: ["a", "c"], gap: [] };
    const text = stringifyPack(value, { lists: true });
    expect(text).toBe(
      '{\n"detect":[\n"a",\n"c"\n],\n"gap":[],\n"more":[\n"b"\n]\n}\n',
    );
    expect(JSON.parse(text)).toEqual(value);
    expect(stringifyPack(value)).toBe(
      '{\n"detect":["a","c"],\n"gap":[],\n"more":["b"]\n}\n',
    );
  });
});
