import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEsPacks, writeEsPacks, type EsPacks } from "./es-kaikki.ts";

const fixture = join(import.meta.dirname, "fixtures", "kaikki-es.jsonl");
// Frequency-list forms in rank order. "casar" and "hablar" are reached only through
// their forms; "zapato" (in the fixture) is outside the list.
const forms = [
  "de",
  "la",
  "el",
  "comiendo",
  "comí",
  "casas",
  "casa",
  "brasil",
  "hablo",
  "tomar",
  "pelo",
  "comer",
  "ajeno",
  "rosa",
  "a",
  "pelos",
];
// Base ranks: de 1, la 2, el 3, comer 4, casa 5, casar 6, hablar 7, tomar 8, pelo 9,
// rosa 10, a 11. "brasil" has only a proper-noun entry, so it is not a vocabulary word.
const options = { commonRank: 4 };

describe("buildEsPacks", () => {
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(fixture, forms, options);
  });

  it("builds the vocabulary from the bases with meanings that the listed forms reach", () => {
    expect(packs.vocab).toEqual([
      "a",
      "casa",
      "casar",
      "comer",
      "de",
      "el",
      "hablar",
      "la",
      "pelo",
      "rosa",
      "tomar",
    ]);
  });
  it("maps listed forms to their vocabulary bases", () => {
    expect(packs.lemmas.comiendo).toBe("comer");
    expect(packs.lemmas.hablo).toBe("hablar");
    expect(packs.lemmas.casas).toEqual(["casa", "casar"]);
  });
  it("keeps the bases of forms that are vocabulary words themselves", () => {
    expect(packs.lemmas.casa).toBe("casar");
  });
  it("maps a form whose entries are all form-of senses, skipping junk and obsolete targets", () => {
    expect(packs.lemmas["comí"]).toBe("comer");
    expect(packs.vocab).not.toContain("comí");
  });
  it("leaves out forms outside the frequency list and bases equal to the form", () => {
    expect(packs.lemmas).not.toHaveProperty("comemos");
    expect(packs.lemmas).not.toHaveProperty("comer");
    expect(Object.keys(packs.lemmas).sort()).toEqual([
      "casa",
      "casas",
      "comiendo",
      "comí",
      "hablo",
      "pelos",
    ]);
  });
  it("takes the first phonemic IPA of each vocabulary word", () => {
    expect(packs.ipa.comer).toBe("/koˈmeɾ/");
    expect(packs.ipa.casa).toBe("/ˈkasa/");
    expect(packs.ipa.rosa).toBe("/ˈrosa/");
    expect(packs.ipa).not.toHaveProperty("comiendo");
    expect(packs.ipa).not.toHaveProperty("zapato");
  });
  it("keeps only the phonemic /…/ part of an IPA that also gives the phonetic one", () => {
    // The fixture gives "rosa" as "/ˈrosa/ [ˈro.sa]".
    expect(packs.ipa.rosa).toBe("/ˈrosa/");
  });
  it("ranks the bases by their forms' best rank", () => {
    expect(packs.freq).toEqual([
      "de",
      "la",
      "el",
      "comer",
      "casa",
      "casar",
      "hablar",
      "tomar",
      "pelo",
      "rosa",
      "a",
    ]);
  });
  it("ranks a form that is a vocabulary word only as itself", async () => {
    const { freq } = await buildEsPacks(fixture, ["casa", "de", "casas"]);
    expect(freq).toEqual(["casa", "de", "casar"]);
  });
  it("defines vocabulary words with up to 6 usable senses across their entries", () => {
    expect(packs.defs.comer).toEqual([
      "to eat",
      [
        ["verb", "to eat; to dine"],
        ["verb", "to have lunch"],
        ["verb", "to eat away, corrode"],
        ["verb", "to capture a piece"],
        ["noun", "food"],
        ["noun", "meal"],
      ],
    ]);
  });
  it("uses a sense's last gloss and readable parts of speech", () => {
    expect(packs.defs.tomar).toEqual([
      "to drink (a beverage)",
      [["verb", "to drink (a beverage)"]],
    ]);
    expect(packs.defs.rosa).toEqual(["rose", [["noun", "rose"]]]);
    expect(packs.defs.casa?.[1]).toEqual([
      ["noun", "house"],
      ["noun", "home"],
    ]);
  });
  it("leaves out words whose only entries are proper nouns", () => {
    expect(packs.vocab).not.toContain("brasil");
    expect(packs.defs).not.toHaveProperty("brasil");
    expect(packs.ipa).not.toHaveProperty("brasil");
  });
  it("defines no forms and no words outside the vocabulary", () => {
    expect(packs.defs).not.toHaveProperty("casas");
    expect(packs.defs).not.toHaveProperty("zapato");
  });
  it("detects idiomatic and phrase entries of vocabulary words and forms with a word outside the common ranks", () => {
    expect(packs.phrases.detect).toEqual([
      "de la casa",
      "de pelos",
      "tomar el pelo",
    ]);
    expect(packs.defs["tomar el pelo"]).toEqual([
      "to pull someone's leg",
      [["verb", "to pull someone's leg; to tease"]],
    ]);
  });
  it("ranks a form outside the vocabulary as its base", () => {
    // "pelos" ranks as "pelo" (9), outside the common ranks (4).
    expect(packs.phrases.detect).toContain("de pelos");
    expect(packs.defs["de pelos"]?.[0]).toBe("great, awesome");
  });
  it("keeps patterns with a slot apart, defined, for selections only", () => {
    expect(packs.phrases.more).toEqual(["tomar el pelo a alguien"]);
    expect(packs.phrases.gap).toEqual([]);
    expect(packs.defs["tomar el pelo a alguien"]?.[0]).toBe(
      "to pull someone's leg",
    );
  });
  it("merges phrase entries that differ only in case", () => {
    expect(packs.defs["de la casa"]?.[1]).toEqual([
      ["phrase", "on the house (free of charge)"],
      ["phrase", "of the House (parliament)"],
    ]);
  });
  it("counts what it built", () => {
    expect(packs.stats).toMatchObject({
      unparsable: 0,
      forms: forms.length,
      vocab: 11,
      lemmas: 6,
      ipa: 10,
      detect: 3,
      more: 1,
      terms: 15,
    });
  });
});

describe("writeEsPacks", () => {
  let dir: string;
  let written: string[];
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "lingo-es-"));
    written = writeEsPacks(await buildEsPacks(fixture, forms, options), dir);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function filesUnder(path: string): string[] {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(join(path, entry.name))
        : [relative(dir, join(path, entry.name)).split(sep).join("/")],
    );
  }

  it("writes only under es/ and es-en/", () => {
    expect(filesUnder(dir).sort()).toEqual([
      "es-en/dict-1.json",
      "es-en/index.json",
      "es/freq.json",
      "es/ipa.json",
      "es/lemmas.json",
      "es/phrases.json",
      "es/vocab.json",
    ]);
    expect([...written].sort()).toEqual(filesUnder(dir).sort());
  });
  it("writes the phrase patterns as lists, one pattern per line", () => {
    expect(readFileSync(join(dir, "es", "phrases.json"), "utf8")).toBe(
      '{\n"detect":[\n"de la casa",\n"de pelos",\n"tomar el pelo"\n],\n' +
        '"gap":[],\n"more":[\n"tomar el pelo a alguien"\n]\n}\n',
    );
  });
  it("shards the dictionary with an index", () => {
    const index = JSON.parse(
      readFileSync(join(dir, "es-en", "index.json"), "utf8"),
    );
    expect(index).toEqual({
      shards: [
        { file: "dict-1.json", first: "a", last: "tomar el pelo a alguien" },
      ],
    });
  });
});
