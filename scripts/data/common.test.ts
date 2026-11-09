import { describe, expect, it } from "vitest";
import { stringifyPack } from "./common.mjs";

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
});
