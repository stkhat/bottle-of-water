// Test helper: tiny packs served through the real pack loader, as the bundled files would be.
import { vi } from "vitest";
import {
  createPackLoader,
  type PackFiles,
  type PackName,
} from "../core/packs/load";

export const TEST_PACKS: PackFiles = {
  en: {
    lemmas: { loaves: "loaf", ferments: "ferment" },
    // "yeast" is ranked 2,500: known at the default level (3,000), new at 2,000.
    freq: [
      "the",
      "loaf",
      ...Array.from({ length: 2497 }, (_, i) => `filler${i}`),
      "yeast",
    ],
    ipa: { loaf: "/loʊf/" },
    pos: { loaf: ["noun"], ferment: ["verb"], crust: ["noun"] },
  },
  "en-ja": {
    dict: {
      the: ["その", ["その"]],
      loaf: ["パンのひと塊", ["パンのひと塊"]],
      ferment: ["発酵する", ["発酵する"]],
      yeast: ["酵母", ["酵母"]],
      crust: ["パンの皮", ["パンの皮"]],
    },
  },
};

/**
 * The real pack loader over a stub of the extension's files (the boundary). Packs in
 * `fail` cannot be read; `fetchJson` records every file read.
 */
export function stubPackLoader(fail: ReadonlySet<PackName> = new Set()) {
  const fetchJson = vi.fn(async (path: string) => {
    const [, , name, file] = path.split("/") as [
      string,
      string,
      PackName,
      string,
    ];
    if (fail.has(name)) throw new Error(`could not load ${name}`);
    const files = TEST_PACKS[name] as Record<string, unknown>;
    return files[file.replace(".json", "")];
  });
  return Object.assign(createPackLoader(fetchJson), { fetchJson });
}
