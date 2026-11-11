import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { byCodeUnit, shardDict, stringifyPack } from "./common.ts";
import {
  capitalizedOnly,
  cleanShort,
  parseEjdict,
  vocabularyOf,
} from "./ejdict.ts";

const fixture = readFileSync(
  join(import.meta.dirname, "fixtures", "ejdict.txt"),
  "utf8",
);

describe("cleanShort", () => {
  it("removes 《…》 notes and 『』 marks and cuts at the first ;", () => {
    expect(cleanShort("《可能性の推量》…『かもしれない』;たぶん")).toBe(
      "…かもしれない",
    );
  });
  it("removes nested 《…》 notes", () => {
    expect(
      cleanShort("のらくらする《+『around』(『along』),《英》『about』》"),
    ).toBe("のらくらする");
  });
  it("removes countability markers 〈C〉 and 〈U〉 but keeps other 〈…〉 notes", () => {
    expect(cleanShort("〈C〉〈U〉『色』,色彩")).toBe("色,色彩");
    expect(cleanShort("〈人が〉『急ぐ』")).toBe("〈人が〉急ぐ");
  });
});

describe("parseEjdict", () => {
  const dict = parseEjdict(fixture);

  it("splits the meaning on ' / ' into trimmed senses", () => {
    expect(dict.dough).toEqual([
      "練り粉,こね粉,生パン",
      ["練り粉,こね粉,生パン", "《おもに米俗》金銭,ぜに"],
    ]);
  });
  it("expands comma-separated variants into separate keys", () => {
    expect(dict.color).toEqual(dict.colour);
    expect(dict.color?.[0]).toBe("色,色彩");
  });
  it("lowercases headwords and keeps multi-word headwords", () => {
    expect(dict["figure of speech"]?.[1]).toEqual([
      "比喩(ひゆ)[的表現],言葉のあや",
    ]);
    expect(dict["jim crow"]).toEqual(["黒人差別", ["《米話》黒人差別"]]);
    expect(Object.keys(dict)).not.toContain("May");
  });
  it("takes the short from the first sense that is not empty after cleanup", () => {
    expect(dict.the?.[0]).toBe("その,あの");
  });
  it("keeps the note text when every sense is only a note", () => {
    expect(parseEjdict("were\t《be の過去形》 / 《be の仮定法過去》")).toEqual({
      were: ["be の過去形", ["《be の過去形》", "《be の仮定法過去》"]],
    });
  });
  it("merges headwords that differ only in case, lowercase headword first", () => {
    expect(dict.may).toEqual([
      "…かもしれない",
      [
        "《可能性の推量》…『かもしれない』",
        "《許可》…『してもよい』",
        "『5月』",
      ],
    ]);
  });
  it("ignores blank lines and CRLF line endings", () => {
    expect(parseEjdict("dough\tパン生地\r\n\r\n")).toEqual({
      dough: ["パン生地", ["パン生地"]],
    });
  });
});

describe("vocabularyOf", () => {
  it("is the single-word headwords, sorted", () => {
    expect(vocabularyOf(parseEjdict(fixture))).toEqual([
      "color",
      "colour",
      "dough",
      "loaf",
      "may",
      "the",
    ]);
  });
});

describe("shardDict", () => {
  const dict = parseEjdict(fixture);
  const keys = Object.keys(dict).sort(byCodeUnit);
  const bytes = (value: Record<string, unknown>) =>
    Buffer.byteLength(stringifyPack(value));
  // Room for about two entries per shard.
  const maxBytes = 2 * Math.max(...keys.map((k) => bytes({ [k]: dict[k] })));
  const { index, shards } = shardDict(dict, maxBytes);

  it("splits the headwords in sorted order into consecutive shards", () => {
    expect(shards.length).toBeGreaterThan(1);
    expect(shards.flatMap((s) => Object.keys(s.dict))).toEqual(keys);
  });
  it("keeps every shard file within the size limit", () => {
    for (const shard of shards)
      expect(bytes(shard.dict)).toBeLessThanOrEqual(maxBytes);
  });
  it("names the shards dict-1.json, dict-2.json, … and indexes their first and last headwords", () => {
    expect(index.shards).toEqual(
      shards.map((shard, i) => {
        const shardKeys = Object.keys(shard.dict);
        return {
          file: `dict-${i + 1}.json`,
          first: shardKeys[0],
          last: shardKeys.at(-1),
        };
      }),
    );
    expect(shards.map((s) => s.file)).toEqual(index.shards.map((s) => s.file));
  });
  it("fills each shard as far as the limit allows, so the split is the same every run", () => {
    for (const [i, shard] of shards.slice(0, -1).entries()) {
      const next = shards[i + 1]!.dict;
      const firstOfNext = Object.keys(next)[0]!;
      expect(
        bytes({ ...shard.dict, [firstOfNext]: next[firstOfNext] }),
      ).toBeGreaterThan(maxBytes);
    }
    expect(shardDict(dict, maxBytes)).toEqual({ index, shards });
  });
  it("keeps a small dictionary in one shard", () => {
    expect(shardDict(dict, 1e9).index).toEqual({
      shards: [{ file: "dict-1.json", first: keys[0], last: keys.at(-1) }],
    });
  });
  it("fails when one entry alone is over the limit", () => {
    expect(() => shardDict(dict, 10)).toThrow("over 10 bytes");
  });
});

describe("capitalizedOnly", () => {
  it("lists single words EJDict writes only with capitals, lowercase", () => {
    const text = [
      "David\tダビデ",
      "May\t5月",
      "may\tかもしれない",
      "TV\ttelevision",
      "Mr.,Mr\tMister",
      "Jim Crow\t黒人差別",
      "bill\t勘定書",
    ].join("\n");
    expect(capitalizedOnly(text)).toEqual(["david", "mr", "tv"]);
  });
});
