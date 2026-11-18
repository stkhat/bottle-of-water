import { describe, expect, it } from "vitest";
import { mirrorEntry } from "./pack-mirrors";

const URL =
  "https://cdn.jsdelivr.net/npm/@langle/en-defs@2026.1118.0/dict-1.json";

describe("mirrorEntry", () => {
  it("records the mirror that served a file, as a record and not a finding", () => {
    expect(
      mirrorEntry({
        pack: "en-defs",
        file: "dict-1.json",
        url: URL,
        served: true,
        bytes: 1_843_200,
        ms: 412,
      }),
    ).toEqual({
      level: "info",
      message: `Pack en-defs dict-1.json: served by ${URL} (1843200 bytes, 412 ms)`,
    });
  });

  it("records a mirror that failed as a warning", () => {
    expect(
      mirrorEntry({
        pack: "en-defs",
        file: "dict-1.json",
        url: URL,
        served: false,
        error: "HTTP 503",
      }),
    ).toEqual({
      level: "warning",
      message: `Pack en-defs dict-1.json: mirror failed, ${URL}: HTTP 503`,
    });
  });
});
