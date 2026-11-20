import { describe, expect, it } from "vitest";
import {
  chooseEntity,
  entityDefinition,
  entityJapanese,
  entityNative,
  entityWords,
  tsvValue,
  writtenCount,
  type Candidate,
  type Entity,
  type Kind,
} from "./wikidata.ts";

const item = (
  id: string,
  sitelinks: number,
  {
    via = "label",
    kinds = [],
    label = "",
    codes = [],
  }: {
    via?: Candidate["via"];
    kinds?: Kind[];
    label?: string;
    codes?: string[];
  } = {},
): Candidate => ({
  id,
  sitelinks,
  via,
  kinds: new Set(kinds),
  label,
  codes: new Set(codes),
});

describe("chooseEntity", () => {
  it("takes the item the word is the label of", () => {
    expect(
      chooseEntity("Nvidia", [item("Q182477", 83, { label: "Nvidia" })]),
    ).toEqual({
      id: "Q182477",
      sitelinks: 83,
      label: "Nvidia",
      via: "label",
    });
  });
  it("leaves out a word that is a given name or a family name", () => {
    expect(
      chooseEntity("Kane", [
        item("Q1185000", 27, { label: "Kane" }),
        item("Q13570642", 0, { kinds: ["name"], label: "Kane" }),
      ]),
    ).toEqual({ none: "name" });
  });
  it("leaves out a word whose most notable item is a person or its disambiguation page", () => {
    expect(
      chooseEntity("Heisenberg", [
        item("Q40904", 141, {
          via: "alias",
          kinds: ["person"],
          label: "Werner Heisenberg",
        }),
        item("Q598427", 17, { via: "alias", label: "Heisenberg" }),
      ]),
    ).toEqual({ none: "person" });
    expect(
      chooseEntity("Masterson", [
        item("Q243145", 10, { kinds: ["internal"], label: "Masterson" }),
      ]),
    ).toEqual({ none: "disambiguation" });
  });
  it("leaves out a word a more notable person has in their name", () => {
    expect(
      chooseEntity("Dirac", [item("Q1118592", 39, { label: "Dirac" })], {
        personSitelinks: 120,
      }),
    ).toEqual({ none: "person" });
  });
  it("reads aliases only as the label without its accents", () => {
    expect(
      chooseEntity("Tokaido", [
        item("Q963514", 29, { via: "alias", label: "Tōkaidō" }),
      ]),
    ).toMatchObject({ id: "Q963514" });
    // An acronym's aliases chose the wrong thing half the time: none.
    expect(
      chooseEntity("NYPD", [
        item("Q328473", 44, {
          via: "alias",
          label: "New York City Police Department",
        }),
      ]),
    ).toEqual({ none: "no fitting item" });
  });
  it("never counts an item's code or a label with no letter", () => {
    expect(
      chooseEntity("AED", [
        item("Q200294", 65, { via: "alias", label: "AED", codes: ["AED"] }),
        item("Q1", 30, { label: "AED" }),
      ]),
    ).toMatchObject({ id: "Q1" });
    expect(
      chooseEntity("VIII", [item("Q23348", 144, { via: "alias", label: "8" })]),
    ).toEqual({
      none: "no fitting item",
    });
  });
  it("leaves out a title of a work, takes the next item", () => {
    expect(
      chooseEntity("Oculus", [
        item("Q3349019", 35, { kinds: ["work"], label: "Oculus" }),
        item("Q107392606", 14, { label: "Oculus" }),
      ]),
    ).toMatchObject({ id: "Q107392606" });
  });
  it("asks the item to dominate the others the word names, and its disambiguation page", () => {
    expect(
      chooseEntity("Fredericktown", [
        item("Q1", 37, { label: "Fredericktown" }),
        item("Q2", 30, { label: "Fredericktown" }),
      ]),
    ).toEqual({ none: "ambiguous" });
    expect(
      chooseEntity("RTI", [
        item("Q1", 17, { label: "RTI" }),
        item("Q2", 14, { kinds: ["internal"], label: "RTI" }),
      ]),
    ).toEqual({ none: "ambiguous" });
    expect(
      chooseEntity("BTS", [
        item("Q13580495", 126, { label: "BTS" }),
        item("Q298548", 29, { kinds: ["internal"], label: "BTS" }),
      ]),
    ).toMatchObject({ id: "Q13580495" });
  });
  it("asks for enough sitelinks", () => {
    expect(chooseEntity("Tiny", [item("Q1", 5, { label: "Tiny" })])).toEqual({
      none: "few sitelinks",
    });
  });
});

describe("tsvValue", () => {
  it("reads items and literals", () => {
    expect(tsvValue("<http://www.wikidata.org/entity/Q42>")).toEqual({
      id: "Q42",
    });
    expect(tsvValue('"Tōkaidō"@en')).toEqual({ text: "Tōkaidō", lang: "en" });
    expect(tsvValue('"a \\"b\\""@en')).toEqual({ text: 'a "b"', lang: "en" });
    expect(tsvValue("83")).toEqual({ text: "83" });
  });
});

describe("writtenCount", () => {
  it("counts the word as written, with its plural and possessive, unless lower case is as common", () => {
    const counts = {
      written: new Map([
        ["Nvidia", 27],
        ["Nvidia's", 2],
        ["Polish", 3],
      ]),
      lower: new Map([["polish", 40]]),
    };
    expect(writtenCount("Nvidia", counts)).toBe(29);
    expect(writtenCount("Polish", counts)).toBe(0);
  });
});

const nvidia: Entity = {
  id: "Q182477",
  sitelinks: 83,
  examples: 29,
  label: { en: "Nvidia", ja: "NVIDIA", es: "Nvidia", "zh-hans": "英伟达" },
  description: {
    en: "American multinational technology company",
    ja: "アメリカの半導体企業",
    es: "empresa multinacional estadounidense de tecnología",
  },
};
const tokaido: Entity = {
  id: "Q963514",
  sitelinks: 29,
  examples: 4,
  label: { en: "Tōkaidō", ja: "東海道" },
  description: { en: "road of premodern Japan", ja: "江戸時代の街道" },
};

describe("entityWords", () => {
  it("leaves out words the language has, possessives of them and persons' names", () => {
    const entities = {
      Nvidia: nvidia,
      "Queen's": nvidia,
      Rachel: nvidia,
      Tokyo: nvidia,
    };
    expect(
      entityWords(entities, {
        known: (key) => key === "queen" || key === "tokyo",
        names: { rachel: "xgp" },
      }),
    ).toEqual(["Nvidia"]);
  });
});

describe("the entities' meanings", () => {
  it("defines one in English by its description, after its label when that is spelt otherwise", () => {
    expect(entityDefinition("Nvidia", nvidia)).toBe(
      "American multinational technology company.",
    );
    expect(entityDefinition("Tokaido", tokaido)).toBe(
      "Tōkaidō: Road of premodern Japan.",
    );
  });
  it("gives the Japanese label and description in kana or kanji only", () => {
    expect(entityJapanese("Nvidia", nvidia)).toEqual([
      "アメリカの半導体企業",
      ["《American multinational technology company》アメリカの半導体企業"],
      "n",
    ]);
    expect(entityJapanese("Tokaido", tokaido)).toEqual([
      "東海道",
      ["《road of premodern Japan》東海道", "江戸時代の街道"],
      "n n",
    ]);
  });
  it("leaves out a Japanese description the hover line would cut", () => {
    const cut: Entity = {
      ...nvidia,
      label: { en: "Nvidia", ja: "NVIDIA" },
      description: {
        en: "American multinational technology company",
        ja: "台湾系アメリカ人によって創設された、GPUやAI向けの半導体企業",
      },
    };
    expect(entityJapanese("Nvidia", cut)).toBeUndefined();
  });
  it("gives a recipe pair's label when it is no spelling of the word, then the description", () => {
    expect(entityNative("Nvidia", nvidia, "es")).toEqual([
      [
        "empresa multinacional estadounidense de tecnología",
        "American multinational technology company",
        "description",
      ],
    ]);
    expect(entityNative("Nvidia", nvidia, "zh")).toEqual([
      ["英伟达", "American multinational technology company", "label"],
    ]);
  });
});
