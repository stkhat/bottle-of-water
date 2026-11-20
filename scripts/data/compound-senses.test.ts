import { describe, expect, it } from "vitest";
import type { KaikkiEntry } from "./common.ts";
import { compoundSense, createPartGlosses } from "./compound-senses.ts";

const etymology = (word: string, etymology_text: string): KaikkiEntry =>
  ({ word, lang_code: "de", etymology_text }) as KaikkiEntry;

describe("compoundSense", () => {
  const glosses = createPartGlosses();
  for (const text of [
    "Eisen (“iron”) + Bahn (“railway, train”)",
    "Straße (“street”) + Bahn (“railway”)",
    "Bahn (“transport, lane”) + Hof (“yard”)",
    "Rad (“wheel”) + Bahn (“trail, route”)",
    "Licht (“light”) + Jahr (“year”)",
    "licht (“bright”) + blau (“blue”)",
  ])
    glosses.add(etymology("x", text));
  glosses.add(etymology("y", "From Bahn (“railway”), not joined"));

  it("takes the sense the compounds' etymologies name most, of the first sense's case", () => {
    const bahn = [
      ["noun", "route, trail", "capital"],
      ["noun", "railway/railroad or rail transport", "capital"],
      ["noun", "lane", "capital"],
    ] as const;
    expect(compoundSense(bahn, (capital) => glosses.of("bahn", capital))).toBe(
      1,
    );
  });
  it("keeps the first where no other sense is named often enough", () => {
    const licht = [
      ["noun", "light", "capital"],
      ["adjective", "bright, light"],
    ] as const;
    expect(
      compoundSense(licht, (capital) => glosses.of("licht", capital)),
    ).toBeUndefined();
    expect(
      compoundSense([["noun", "x"]], (capital) => glosses.of("bahn", capital)),
    ).toBeUndefined();
  });
});
