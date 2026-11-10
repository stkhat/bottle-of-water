import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEsPacks, writeEsPacks, type EsPacks } from "./es-kaikki.mjs";

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
];
// Base ranks: de 1, la 2, el 3, comer 4, casa 5, casar 6, brasil 7, hablar 8, tomar 9, pelo 10.
const options = { commonRank: 4 };

describe("buildEsPacks", () => {
  let packs: EsPacks;
  beforeAll(async () => {
    packs = await buildEsPacks(fixture, forms, options);
  });

  it("builds the vocabulary from the bases with meanings that the listed forms reach", () => {
    expect(packs.vocab).toEqual([
      "brasil",
      "casa",
      "casar",
      "comer",
      "de",
      "el",
      "hablar",
      "la",
      "pelo",
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
    ]);
  });
  it("takes the first phonemic IPA of each vocabulary word", () => {
    expect(packs.ipa.comer).toBe("/koˈmeɾ/");
    expect(packs.ipa.casa).toBe("/ˈkasa/");
    expect(packs.ipa.brasil).toBe("/bɾaˈsil/");
    expect(packs.ipa).not.toHaveProperty("comiendo");
    expect(packs.ipa).not.toHaveProperty("zapato");
  });
  it("ranks the bases by their forms' best rank", () => {
    expect(packs.freq).toEqual([
      "de",
      "la",
      "el",
      "comer",
      "casa",
      "casar",
      "brasil",
      "hablar",
      "tomar",
      "pelo",
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
    expect(packs.defs.brasil).toEqual([
      "Brazil (a country in South America)",
      [["proper noun", "Brazil (a country in South America)"]],
    ]);
    expect(packs.defs.casa?.[1]).toEqual([
      ["noun", "house"],
      ["noun", "home"],
    ]);
  });
  it("defines no forms and no words outside the vocabulary", () => {
    expect(packs.defs).not.toHaveProperty("casas");
    expect(packs.defs).not.toHaveProperty("zapato");
  });
  it("lists idiomatic and phrase entries of vocabulary words with a word outside the common ranks", () => {
    expect(packs.phrases).toEqual(["de la casa", "tomar el pelo"]);
    expect(packs.defs["tomar el pelo"]).toEqual([
      "to pull someone's leg",
      [["verb", "to pull someone's leg; to tease"]],
    ]);
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
      vocab: 10,
      lemmas: 5,
      ipa: 10,
      phrases: 2,
      terms: 12,
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
        : [relative(dir, join(path, entry.name))],
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
  it("shards the dictionary with an index", () => {
    const index = JSON.parse(
      readFileSync(join(dir, "es-en", "index.json"), "utf8"),
    );
    expect(index).toEqual({
      shards: [{ file: "dict-1.json", first: "brasil", last: "tomar el pelo" }],
    });
  });
});
