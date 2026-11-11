import { describe, expect, it } from "vitest";
import { applyOverrides, readLock, type PackLock } from "./lock";

const entry = (name: string) => ({
  package: `@lingo-data/${name}`,
  version: "2026.1111.0",
  format: 1,
  bundled: true,
  files: [{ path: "freq.json", size: 3, sha256: "ab" }],
});
const lock = {
  v: 1,
  mirrors: [
    "https://cdn.jsdelivr.net/npm/{package}@{version}/{file}",
    "https://unpkg.com/{package}@{version}/{file}",
  ],
  packs: {
    en: entry("en"),
    "en-ja": entry("en-ja"),
    "en-defs": entry("en-defs"),
    es: entry("es"),
    "es-en": entry("es-en"),
  },
} satisfies PackLock;
const LOCAL = "http://localhost:4719/mirror/{package}@{version}/{file}";

describe("applyOverrides", () => {
  it("downloads the listed packs and replaces the mirrors outside production", () => {
    const result = applyOverrides(
      lock,
      {
        WXT_PACKS_DOWNLOAD: " es, es-en ,",
        WXT_PACK_MIRRORS: `${LOCAL}, https://example.test/{file}`,
      },
      "check",
    );
    expect(result.packs.es).toEqual({ ...lock.packs.es, bundled: false });
    expect(result.packs["es-en"].bundled).toBe(false);
    expect(result.packs.en).toBe(lock.packs.en);
    expect(result.mirrors).toEqual([LOCAL, "https://example.test/{file}"]);
    expect(lock.packs.es.bundled).toBe(true);
  });

  it("keeps the mirrors without WXT_PACK_MIRRORS, and the packs without WXT_PACKS_DOWNLOAD", () => {
    expect(
      applyOverrides(lock, { WXT_PACKS_DOWNLOAD: "es" }, "development").mirrors,
    ).toBe(lock.mirrors);
    const mirrorsOnly = applyOverrides(
      lock,
      { WXT_PACK_MIRRORS: LOCAL },
      "test",
    );
    expect(mirrorsOnly.packs).toEqual(lock.packs);
    expect(applyOverrides(lock, {}, "check")).toBe(lock);
    expect(applyOverrides(lock, { WXT_PACKS_DOWNLOAD: "" }, "check")).toBe(
      lock,
    );
  });

  it("ignores the environment in production", () => {
    expect(
      applyOverrides(
        lock,
        { WXT_PACKS_DOWNLOAD: "es,es-en,zz", WXT_PACK_MIRRORS: LOCAL },
        "production",
      ),
    ).toBe(lock);
  });

  it("refuses a pack the lock does not have", () => {
    expect(() =>
      applyOverrides(lock, { WXT_PACKS_DOWNLOAD: "es,zz" }, "check"),
    ).toThrow("WXT_PACKS_DOWNLOAD: unknown pack zz");
  });
});

describe("readLock", () => {
  it("is the committed lock: every pack bundled, jsDelivr then unpkg", () => {
    const { v, mirrors, packs } = readLock();
    expect(v).toBe(1);
    expect(mirrors).toEqual(lock.mirrors);
    expect(Object.keys(packs).sort()).toEqual(Object.keys(lock.packs).sort());
    for (const pack of Object.values(packs)) {
      expect(pack.bundled).toBe(true);
      expect(pack.files.length).toBeGreaterThan(0);
    }
  });
});
