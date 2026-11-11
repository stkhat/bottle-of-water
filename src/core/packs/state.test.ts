import { describe, expect, it } from "vitest";
import { combinedState, dataNote, packUsable, type PackState } from "./state";

const ready = (total: number): PackState => ({
  state: "ready",
  received: total,
  total,
});
const downloading = (received: number, total: number): PackState => ({
  state: "downloading",
  received,
  total,
});
const failed = (received: number, total: number): PackState => ({
  state: "failed",
  received,
  total,
  error: "HTTP 404",
});

describe("packUsable", () => {
  it("is true for a pack at its lock version, or with an older version in use", () => {
    expect(packUsable(ready(10))).toBe(true);
    expect(packUsable({ ...downloading(2, 10), updating: true })).toBe(true);
    expect(packUsable({ ...failed(2, 10), updating: true })).toBe(true);
  });

  it("is false while downloading, after a failure and without a state", () => {
    expect(packUsable(downloading(2, 10))).toBe(false);
    expect(packUsable(failed(2, 10))).toBe(false);
    expect(packUsable(undefined)).toBe(false);
  });
});

describe("dataNote", () => {
  it("shows nothing once every pack can be used", () => {
    expect(
      dataNote(
        { es: ready(30), "es-en": { ...downloading(5, 70), updating: true } },
        ["es", "es-en"],
      ),
    ).toBeNull();
    expect(dataNote({}, [])).toBeNull();
  });

  it("shows the share of the bytes on the device while downloading, usable packs counted whole", () => {
    expect(
      dataNote({ es: ready(30), "es-en": downloading(20, 70) }, [
        "es",
        "es-en",
      ]),
    ).toEqual({ state: "downloading", percent: 50 });
    // Rounded down: never 100% before the end.
    expect(dataNote({ es: downloading(999, 1000) }, ["es"])).toEqual({
      state: "downloading",
      percent: 99,
    });
  });

  it("counts a pack without a state as downloading, with nothing received", () => {
    expect(dataNote({}, ["es"])).toEqual({ state: "downloading", percent: 0 });
    expect(dataNote({ es: ready(30) }, ["es", "es-en"])).toEqual({
      state: "downloading",
      percent: 100,
    });
  });

  it("is failed when a pack that cannot be used failed", () => {
    expect(
      dataNote({ es: downloading(10, 30), "es-en": failed(0, 70) }, [
        "es",
        "es-en",
      ]),
    ).toEqual({ state: "failed" });
  });

  it("ignores the states of other packs", () => {
    expect(dataNote({ en: failed(0, 10), es: ready(30) }, ["es"])).toBeNull();
  });
});

describe("combinedState", () => {
  it("is ready when every pack is, with all bytes received", () => {
    expect(combinedState([ready(30), ready(70)])).toEqual({
      state: "ready",
      percent: 100,
    });
  });

  it("is downloading when one is, with the share of all bytes received", () => {
    expect(combinedState([ready(30), downloading(15, 70)])).toEqual({
      state: "downloading",
      percent: 45,
    });
    // An update downloads too.
    expect(
      combinedState([{ ...downloading(0, 30), updating: true }, ready(70)]),
    ).toEqual({ state: "downloading", percent: 70 });
  });

  it("is failed when one failed", () => {
    expect(combinedState([failed(0, 30), downloading(15, 70)])).toEqual({
      state: "failed",
      percent: 15,
    });
  });

  it("is ready at 0% with no bytes to download", () => {
    expect(combinedState([])).toEqual({ state: "ready", percent: 0 });
  });
});
