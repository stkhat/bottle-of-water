// Smoke test of the classifier over the generated pack files in public/packs/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createClassifier, unsavedKeys, type TermIndex } from "./classify";
import { createEnglishPack } from "./language-pack";
import { vocabularyOf } from "./packs/vocabulary";
import type { DictPack, FreqPack, IpaPack, LemmaPack } from "./packs/types";

const packs = join(import.meta.dirname, "..", "..", "public", "packs");
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(packs, path), "utf8")) as T;

const pack = createEnglishPack({
  lemmas: read<LemmaPack>("en/lemmas.json"),
  freq: read<FreqPack>("en/freq.json"),
  ipa: read<IpaPack>("en/ipa.json"),
  vocab: vocabularyOf(read<DictPack>("en-ja/dict.json")),
});
const classifier = createClassifier(pack);

// The article in the UI mock.
const PARAGRAPH =
  "When the mixture ferments slowly in a cool place, the yeast and bacteria have more time to break down starches. The result is a loaf with a deeper, slightly tangy taste and a crust that crackles as it cools.";

function categories(terms: TermIndex = new Map()) {
  const spans = classifier.classify(pack.tokenize(PARAGRAPH), {
    terms,
    knownLevel: 3000,
  });
  const byWord = new Map(
    spans.map((s) => [PARAGRAPH.slice(s.start, s.end), s] as const),
  );
  return { spans, byWord };
}

describe("classifier over the generated packs", () => {
  it("sorts the mock's paragraph into known and new words at level 3000", () => {
    const { spans, byWord } = categories();
    const brief = (word: string) => {
      const span = byWord.get(word);
      return span && `${span.key}:${span.category}`;
    };
    expect(brief("the")).toBe("the:known");
    expect(brief("ferments")).toBe("ferment:new");
    expect(brief("tangy")).toBe("tangy:new");
    expect(brief("starches")).toBe("starch:new");
    expect(brief("crackles")).toBe("crackle:new");
    expect(brief("cools")).toBe("cool:known");
    expect(brief("deeper")).toBe("deep:known");
    expect(brief("slowly")).toBe("slowly:known");
    expect(brief("a")).toBe("a:ignored");
    expect(unsavedKeys(spans)).toEqual([
      "mixture",
      "ferment",
      "yeast",
      "bacteria",
      "starch",
      "loaf",
      "slightly",
      "tangy",
      "crust",
      "crackle",
    ]);
  });

  it("uses saved words and phrases", () => {
    const { byWord, spans } = categories(
      new Map([
        ["ferment", "learning"],
        ["break down", "known"],
      ]),
    );
    expect(byWord.get("ferments")).toMatchObject({
      key: "ferment",
      category: "learning",
    });
    expect(byWord.get("break down")).toMatchObject({
      key: "break down",
      kind: "phrase",
      category: "known",
    });
    expect(unsavedKeys(spans)).not.toContain("ferment");
  });
});
