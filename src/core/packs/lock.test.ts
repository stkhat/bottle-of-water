import { describe, expect, it } from "vitest";
import { applyOverrides, readLock, type PackLock } from "./lock";

const entry = (name: string) => ({
  package: `@langle/${name}`,
  version: "2026.1111.0",
  format: 1,
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
    fr: entry("fr"),
    "fr-en": entry("fr-en"),
    de: entry("de"),
    "de-en": entry("de-en"),
    "en-es": entry("en-es"),
    "en-pt": entry("en-pt"),
    "en-ru": entry("en-ru"),
    "en-fr": entry("en-fr"),
    "en-de": entry("en-de"),
    "en-zh": entry("en-zh"),
    "en-it": entry("en-it"),
    "en-pl": entry("en-pl"),
    "en-th": entry("en-th"),
    "de-fr": entry("de-fr"),
  },
  pairs: {
    en: ["ja", "es", "pt", "ru", "fr", "de", "zh", "it", "pl", "th"],
    es: ["en"],
    fr: ["en"],
    de: ["en"],
  },
} satisfies PackLock;
const LOCAL = "http://localhost:4719/mirror/{package}@{version}/{file}";

describe("applyOverrides", () => {
  it("replaces the mirrors outside production", () => {
    const result = applyOverrides(
      lock,
      { WXT_PACK_MIRRORS: ` ${LOCAL}, https://example.test/{file} ,` },
      "check",
    );
    expect(result.mirrors).toEqual([LOCAL, "https://example.test/{file}"]);
    expect(result.packs).toBe(lock.packs);
    expect(lock.mirrors).toHaveLength(2);
  });

  it("keeps the lock without WXT_PACK_MIRRORS", () => {
    expect(applyOverrides(lock, {}, "check")).toBe(lock);
    expect(applyOverrides(lock, { WXT_PACK_MIRRORS: "" }, "development")).toBe(
      lock,
    );
  });

  it("ignores the environment in production", () => {
    expect(
      applyOverrides(lock, { WXT_PACK_MIRRORS: LOCAL }, "production"),
    ).toBe(lock);
  });
});

describe("readLock", () => {
  it("is the committed lock: every pack downloaded from jsDelivr, then unpkg", () => {
    const { v, mirrors, packs } = readLock();
    expect(v).toBe(1);
    expect(mirrors).toEqual(lock.mirrors);
    expect(Object.keys(packs).sort()).toEqual(Object.keys(lock.packs).sort());
    for (const pack of Object.values(packs)) {
      expect(pack.files.length).toBeGreaterThan(0);
      expect(pack).not.toHaveProperty("bundled");
    }
  });
});
