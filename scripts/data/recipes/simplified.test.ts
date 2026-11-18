import { describe, expect, it } from "vitest";
import {
  converter,
  parseOpenccDictionary,
  simplifiedConverter,
} from "./simplified.ts";

describe("parseOpenccDictionary", () => {
  it("reads key and first value per line, past the comments", () => {
    const map = parseOpenccDictionary(
      "# OpenCC\n# Format: key\tvalue(s)\n\n乾\t干 乾\n麵\t面 麺\n",
    );
    expect([...map]).toEqual([
      ["乾", "干"],
      ["麵", "面"],
    ]);
  });
});

describe("converter", () => {
  const convert = converter({
    normalization: new Map([["豈", "豈"]]),
    phrases: new Map([
      ["乾坤", "乾坤"],
      ["一目瞭然", "一目了然"],
    ]),
    characters: new Map([
      ["乾", "干"],
      ["瞭", "了"],
      ["麵", "面"],
      ["豈", "岂"],
    ]),
  });
  it("takes the longest phrase first, else each character", () => {
    expect(convert("乾坤")).toBe("乾坤");
    expect(convert("乾麵")).toBe("干面");
    expect(convert("一目瞭然")).toBe("一目了然");
    expect(convert("瞭")).toBe("了");
  });
  it("normalizes compatibility ideographs and keeps other text", () => {
    expect(convert("豈")).toBe("岂");
    expect(convert("Wiki 面包")).toBe("Wiki 面包");
  });
});

describe("simplifiedConverter", () => {
  it("converts traditional characters with OpenCC's own dictionaries", () => {
    const convert = simplifiedConverter();
    expect(convert("麵包")).toBe("面包");
    expect(convert("頭髮")).toBe("头发");
    expect(convert("一目瞭然")).toBe("一目了然");
    // Simplified text stays as it is.
    expect(convert("面包，头发")).toBe("面包，头发");
  });
});
