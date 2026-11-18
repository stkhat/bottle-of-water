import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASS_HEADWORDS,
  capitalDictionary,
  capitalTermOf,
  convertTerms,
  lastScriptForm,
  mergeSources,
  nativeKindOf,
  pointerTemplates,
  readEdition,
  readTranslationTables,
  termKeyOf,
  withoutPageMarkup,
  withoutStressMarks,
  type PairSense,
  type SourceTerm,
} from "./recipe.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const termKey = termKeyOf({
  vocab: new Set(["light", "upset", "give", "up"]),
  lemmas: { lights: "light" },
  phrases: new Set(["give up"]),
});

describe("withoutPageMarkup", () => {
  it("cuts a gloss where a heading or a list item of the page starts", () => {
    expect(withoutPageMarkup("消色差透镜\n* 正体: 消色差透镜[电机工程]")).toBe(
      "消色差透镜",
    );
    expect(withoutPageMarkup("顶峰，顶点==葡萄牙语==\n顶点")).toBe(
      "顶峰，顶点",
    );
    expect(withoutPageMarkup("adoring\n====翻译====\n翻译")).toBe("adoring");
    expect(withoutPageMarkup("1) бумага\n2) простая бумага")).toBe(
      "1) бумага\n2) простая бумага",
    );
  });
});

describe("lastScriptForm", () => {
  it("takes the last of the forms a Chinese row writes, the simplified one", () => {
    expect(lastScriptForm("麵包 /面包")).toBe("面包");
    expect(lastScriptForm("空閒 /空閑 /空闲")).toBe("空闲");
    expect(lastScriptForm("我")).toBe("我");
  });
});

describe("convertTerms", () => {
  it("rewrites the native text, keeps the English hints, and each word and sense once", () => {
    const terms = new Map<string, SourceTerm>([
      [
        "bread",
        {
          short: "麵包",
          senses: [
            ["noun", "麵包, 面包", "baked dough"],
            ["noun", "面包", "baked dough"],
            ["noun", "麵"],
            ["verb", "make的過去式", null, "make"],
          ],
        },
      ],
    ]);
    const convert = (text: string) => text.replaceAll("麵", "面");
    expect(Object.fromEntries(convertTerms(terms, convert))).toEqual({
      bread: {
        short: "面包",
        senses: [
          ["noun", "面包", "baked dough"],
          ["noun", "面"],
          ["verb", "make的過去式", null, "make"],
        ],
      },
    });
  });
});

describe("withoutStressMarks", () => {
  it("drops the stress marks over Cyrillic letters, as natives write", () => {
    expect(withoutStressMarks("де\u0301ньги")).toBe("деньги");
    expect(withoutStressMarks("бро\u0301сить pf")).toBe("бросить pf");
    expect(withoutStressMarks("ёлка")).toBe("ёлка");
    expect(withoutStressMarks("й")).toBe("й");
    // A grave marks secondary stress: "ѝ" is one code point, a stressed и.
    expect(withoutStressMarks("\u045dдол")).toBe("идол");
  });
  it("keeps a mark that makes a letter, and accents in Latin text", () => {
    expect(withoutStressMarks("\u0453")).toBe("\u0453"); // Macedonian ѓ
    expect(withoutStressMarks("ге\u0301")).toBe("ге");
    expect(withoutStressMarks("e\u0301te\u0301")).toBe("\u00e9t\u00e9");
    expect(withoutStressMarks("été")).toBe("été");
  });
});

describe("termKeyOf", () => {
  it("keys a lowercase vocabulary word as it is", () => {
    expect(termKey("light")).toBe("light");
  });
  it("skips a capitalized headword (a name), an inflected form and an unknown word", () => {
    expect(termKey("Light")).toBeUndefined();
    expect(termKey("lights")).toBeUndefined();
    expect(termKey("zzyzx")).toBeUndefined();
  });
  it("keys a multi-word headword by its pattern key when it is a known phrase", () => {
    expect(termKey("Give  up")).toBe("give up");
    expect(termKey("give in")).toBeUndefined();
  });
});

describe("readEdition", () => {
  it("reads the edition's English entries: senses in the native language, each once, no single-word proper nouns", async () => {
    const { terms, stats } = await readEdition(
      join(FIXTURES, "edition-pt.jsonl"),
      termKey,
    );
    expect(Object.fromEntries(terms)).toEqual({
      light: {
        short: "leve",
        senses: [
          ["adjective", "leve"],
          ["adjective", "claro; luminoso"],
          ["noun", "luz"],
        ],
      },
      "give up": {
        short: "desistir",
        senses: [
          ["verb", "desistir"],
          ["proper noun", "nome de um lugar"],
        ],
      },
      upset: {
        short: "Chatear",
        senses: [
          ["verb", "Chatear."],
          ["verb", "Fazer algo. Depois outra coisa."],
        ],
      },
    });
    expect(stats).toEqual({
      entries: 10,
      unparsable: 1,
      pointers: 0,
      templates: 0,
    });
  });

  it("keeps capitalised headwords and single-word proper nouns apart, by capital key", async () => {
    const { capital, nativeKind } = await readEdition(
      join(FIXTURES, "edition-pt.jsonl"),
      termKey,
      { native: "pt" },
    );
    expect(Object.fromEntries(capital)).toEqual({
      Light: {
        short: "sobrenome",
        senses: [
          ["proper noun", "sobrenome"],
          ["proper noun", "apelido"],
        ],
      },
    });
    // The edition's own Portuguese entry: luz is a common word, however a gloss
    // capitalises it.
    expect(nativeKind("luz")).toBe("word");
    expect(nativeKind("Luz")).toBe("word");
    expect(nativeKind("Lisboa")).toBeUndefined();
  });

  it("drops the period ending a one-sentence gloss with `trimPeriod`", async () => {
    const { terms } = await readEdition(
      join(FIXTURES, "edition-pt.jsonl"),
      termKey,
      { trimPeriod: true },
    );
    expect(terms.get("upset")?.senses).toEqual([
      ["verb", "Chatear"],
      ["verb", "Fazer algo. Depois outra coisa."],
    ]);
  });
});

describe("pointerTemplates", () => {
  it("replaces the target as the gloss writes it, drops notes, lower case", () => {
    expect(
      pointerTemplates("Pasado simple del verbo (to) tell.", "tell"),
    ).toEqual(["pasado simple del verbo {x}"]);
    expect(
      pointerTemplates(
        "Tercera persona del singular (he, she, it) del presente simple de have.",
        "have",
      ),
    ).toEqual(["tercera persona del singular del presente simple de {x}"]);
    expect(
      pointerTemplates('terceira pessoa do verbo "to have"', "have"),
    ).toEqual(["terceira pessoa do verbo {x}"]);
    expect(pointerTemplates("tell 的簡單過去時和過去時分詞", "tell")).toEqual([
      "{x} 的簡單過去時和過去時分詞",
    ]);
  });
  it("gives one template per place the gloss writes the target", () => {
    expect(pointerTemplates("passado simples do verbo do", "do")).toEqual([
      "passado simples {x} verbo do",
      "passado simples do verbo {x}",
    ]);
  });
  it("needs the target written as a word, and something besides it", () => {
    expect(pointerTemplates("Pasado simple del verbo retell", "tell")).toEqual(
      [],
    );
    expect(pointerTemplates("tell", "tell")).toEqual([]);
    expect(pointerTemplates("(to) tell.", "tell")).toEqual([]);
  });
});

describe("readEdition: pointers", () => {
  const formsKey = termKeyOf({
    vocab: new Set(
      "told tell went go knew know saw see children child zeros zero absolute tellen me him us ja on my".split(
        " ",
      ),
    ),
    lemmas: {},
    phrases: new Set(),
  });
  it("keeps forms as pointers in the syntax the edition's marked forms share", async () => {
    const { terms, stats, templates } = await readEdition(
      join(FIXTURES, "edition-forms.jsonl"),
      formsKey,
      { trimPeriod: true, native: "pl" },
    );
    // Three marked forms with three targets (knew's "to know" too) make a template.
    expect([...templates]).toEqual(["pasado simple del verbo {x}"]);
    expect(terms.get("told")).toEqual({
      short: "Pasado simple del verbo (to) tell",
      senses: [["verb", "Pasado simple del verbo (to) tell", null, "tell"]],
    });
    expect(terms.get("knew")?.senses[0]?.[3]).toBe("know");
    // An unmarked sense in the template's syntax is a pointer too.
    expect(terms.get("saw")?.senses).toEqual([
      ["verb", "Pasado simple del verbo (to) see", null, "see"],
      ["noun", "Sierra"],
    ]);
    expect(terms.get("tell")?.senses).toEqual([["verb", "Contar"]]);
    // A marked form in no template (one target), a form of a phrase, and an archaic
    // form are left out.
    expect(terms.has("children")).toBe(false);
    expect(terms.has("zeros")).toBe(false);
    expect(terms.has("tellen")).toBe(false);
    expect(stats).toMatchObject({ pointers: 4, templates: 1 });
  });
  it("learns no template whose targets are words of the edition's own language", async () => {
    const read = (native?: string) =>
      readEdition(join(FIXTURES, "edition-forms.jsonl"), formsKey, {
        trimPeriod: true,
        ...(native !== undefined && { native }),
      });
    // Wikisłownik's form_of links the Polish words of "me", "him", "us".
    expect([...(await read()).templates]).toContain("po than lub as: {x}");
    const { templates, terms } = await read("pl");
    expect([...templates]).toEqual(["pasado simple del verbo {x}"]);
    expect(terms.has("me")).toBe(false);
  });
});

describe("readTranslationTables", () => {
  it("groups each English entry's translations by sense, with the sense as a hint", async () => {
    const { terms } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      { langCodes: ["pt"], termKey },
    );
    expect(Object.fromEntries(terms)).toEqual({
      light: {
        short: "luz",
        senses: [
          ["noun", "luz", "electromagnetic radiation"],
          ["noun", "luz, lâmpada, lanterna", "source of illumination"],
          ["adjective", "leve", "having little weight"],
          ["adjective", "claro", "Pale in colour"],
        ],
      },
      upset: {
        short: "chatear",
        senses: [["verb", "chatear", "to make unhappy"]],
      },
      "give up": {
        short: "render-se",
        senses: [["verb", "render-se", "to surrender"]],
      },
    });
  });
  it("keeps a capitalised headword's translations apart, by capital key", async () => {
    const { terms, capital } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      { langCodes: ["pt"], termKey },
    );
    // "Light" has no sense to file its translation under.
    expect(Object.fromEntries(capital)).toEqual({
      Upset: { short: "Revés", senses: [["proper noun", "Revés", "village"]] },
    });
    expect(terms.get("upset")?.senses).toEqual([
      ["verb", "chatear", "to make unhappy"],
    ]);
  });
  it("keeps only the rows of the languages `langs` names: a variety, not its siblings", async () => {
    const { terms } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      {
        langCodes: ["cmn", "zh"],
        langs: ["Chinese Mandarin"],
        termKey,
        word: lastScriptForm,
      },
    );
    // The Hokkien and Dungan rows (coded zh, as Mandarin's may be) are left out.
    expect(terms.get("light")?.senses).toEqual([
      ["noun", "光", "electromagnetic radiation"],
      ["noun", "灯, 燈光", "source of illumination"],
    ]);
  });
  it("rewrites or drops a translated word with `word`", async () => {
    const { terms } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      {
        langCodes: ["pt"],
        termKey,
        word: (w) => (w === "luz" ? undefined : w.toUpperCase()),
      },
    );
    expect(terms.get("light")?.senses[0]).toEqual([
      "noun",
      "LÂMPADA, LANTERNA, FAROL",
      "source of illumination",
    ]);
  });
});

describe("mergeSources", () => {
  it("takes each term from the first source that has it and records that source", () => {
    const edition = new Map<string, SourceTerm>([
      ["light", { short: "leve", senses: [["adjective", "leve"]] }],
    ]);
    const tables = new Map<string, SourceTerm>([
      ["light", { short: "luz", senses: [["noun", "luz", "radiation"]] }],
      ["upset", { short: "chatear", senses: [["verb", "chatear", "unhappy"]] }],
    ]);
    expect(
      mergeSources([
        { tag: "ptwiktionary", terms: edition },
        { tag: "enwiktionary-translations", terms: tables },
      ]),
    ).toEqual({
      dict: {
        light: ["leve", [["adjective", "leve"]], 0],
        upset: ["chatear", [["verb", "chatear", "unhappy"]], 1],
      },
      sources: ["ptwiktionary", "enwiktionary-translations"],
      counts: { ptwiktionary: 1, "enwiktionary-translations": 1 },
    });
  });
  it("takes a term that only points from the next source with a meaning for it", () => {
    const pointer = (target: string) =>
      ["verb", `passado do verbo ${target}`, null, target] as const;
    const edition = new Map<string, SourceTerm>([
      ["used", { short: "passado", senses: [[...pointer("use")]] }],
      ["told", { short: "passado", senses: [[...pointer("tell")]] }],
      [
        "saw",
        { short: "passado", senses: [[...pointer("see")], ["noun", "serra"]] },
      ],
    ]);
    const tables = new Map<string, SourceTerm>([
      ["used", { short: "usado", senses: [["adjective", "usado", "worn"]] }],
      ["saw", { short: "serrar", senses: [["verb", "serrar", "to cut"]] }],
    ]);
    const { dict, counts } = mergeSources([
      { tag: "ptwiktionary", terms: edition },
      { tag: "enwiktionary-translations", terms: tables },
    ]);
    expect(dict["used"]).toEqual([
      "usado",
      [["adjective", "usado", "worn"]],
      1,
    ]);
    // No later source has "told": its pointers stay. "saw" means something too.
    expect(dict["told"]?.[2]).toBe(0);
    expect(dict["saw"]?.[2]).toBe(0);
    expect(counts).toEqual({
      ptwiktionary: 2,
      "enwiktionary-translations": 1,
    });
  });
});

describe("capitalTermOf", () => {
  it("keys a capitalised single word by its capital key when its lowercase form is a term", () => {
    expect(capitalTermOf("Light", termKey)).toBe("Light");
    expect(capitalTermOf("LIGHT", termKey)).toBe("LIGHT");
    expect(capitalTermOf("Up", termKey)).toBe("Up");
  });
  it("takes a proper noun whatever its case, and nothing else", () => {
    expect(capitalTermOf("light", termKey)).toBeUndefined();
    expect(capitalTermOf("light", termKey, { proper: true })).toBe("Light");
    expect(capitalTermOf("Lights", termKey)).toBeUndefined();
    expect(capitalTermOf("Give Up", termKey)).toBeUndefined();
  });
});

describe("nativeKindOf", () => {
  const entries = (names: string[], common: string[]) => (word: string) => ({
    name: names.includes(word),
    common: common.includes(word),
  });
  it("reads a gloss as the native edition files it", () => {
    const es = entries(["Japón", "Mayo", "China"], ["enero", "mayo", "china"]);
    expect(nativeKindOf("Japón", es)).toBe("name");
    // Wikcionario capitalises every gloss: Enero, Mayo are the months.
    expect(nativeKindOf("Enero", es)).toBe("word");
    expect(nativeKindOf("Mayo", es)).toBe("word");
    expect(nativeKindOf("Estados Unidos", es)).toBeUndefined();
    expect(nativeKindOf("británico", es)).toBe("word");
    const zh = entries(["日本"], ["一月"]);
    expect(nativeKindOf("日本", zh)).toBe("name");
    expect(nativeKindOf("一月", zh)).toBe("word");
  });
  it("reads a capitalised common noun as a word only where the edition capitalises nouns", () => {
    const de = entries(["Frankreich"], ["Januar"]);
    expect(nativeKindOf("Januar", de, { capitalNouns: true })).toBe("word");
    expect(nativeKindOf("Frankreich", de, { capitalNouns: true })).toBe("name");
    // The Russian edition files names as nouns: the capital marks them.
    const ru = entries([], ["Япония", "январь"]);
    expect(nativeKindOf("Япония", ru)).toBe("name");
    expect(nativeKindOf("январь", ru)).toBe("word");
  });
});

describe("capitalDictionary", () => {
  const sense = (text: string): PairSense => ["proper noun", text];
  it("files each capitalised headword under its capital key with what it means", () => {
    const { capital, counts } = capitalDictionary(
      {
        Japan: ["Japón", [sense("Japón")], 0],
        January: ["Enero", [["noun", "Enero"]], 0],
        Thursday: ["jueves", [["noun", "jueves", "day of the week"]], 1],
        US: ["x", [sense("Estados Unidos de América")], 0],
        Texas: ["Texas", [sense("Texas")], 0],
      },
      {
        nativeKind: (item) =>
          item === "Japón" ? "name" : item === "Enero" ? "word" : undefined,
        personFirst: () => false,
      },
    );
    expect(capital).toEqual({
      Japan: ["Japón", [sense("Japón")], 0, "name"],
      January: ["Enero", [["noun", "Enero"]], 0, "word"],
      // Neither: by its shape (lower case, a word).
      Thursday: ["jueves", [["noun", "jueves", "day of the week"]], 1, "word"],
      // Capitalised words and short function words: a name.
      US: ["x", [sense("Estados Unidos de América")], 0, "name"],
      // The gloss is the headword itself: no meaning, the entry stays.
      Texas: ["Texas", [sense("Texas")], 0],
    });
    expect(counts).toEqual({ classSenses: 0, word: 2, name: 2, none: 1 });
  });
  it("leaves out a gloss shared by CLASS_HEADWORDS headwords: a class of names", () => {
    const dict: Record<string, [string, PairSense[], number]> = {};
    for (let i = 0; i < CLASS_HEADWORDS; i++)
      dict[`Name${i}`] = ["Apellido", [sense("Apellido"), sense(`N${i}`)], 0];
    dict["Light"] = ["Apellido", [sense("Apellido")], 0];
    const { capital, counts } = capitalDictionary(dict, {
      nativeKind: () => undefined,
      personFirst: () => false,
    });
    expect(capital["Name3"]).toEqual(["N3", [sense("N3")], 0, "name"]);
    expect(capital["Light"]).toBeUndefined();
    expect(counts.classSenses).toBe(CLASS_HEADWORDS + 1);
  });
  it("compares a gloss that is only a note whole", () => {
    const dict: Record<string, [string, PairSense[], number]> = {};
    for (let i = 0; i < CLASS_HEADWORDS; i++)
      dict[`Name${i}`] = ["", [sense("(английская фамилия)")], 0];
    expect(
      capitalDictionary(dict, {
        nativeKind: () => undefined,
        personFirst: () => false,
      }).capital,
    ).toEqual({});
  });
  it("gives a person's name first no word meaning: a use of the name", () => {
    const { capital } = capitalDictionary(
      {
        Einstein: ["gênio", [["noun", "gênio, indivíduo inteligente"]], 0],
        Helen: ["Helena", [sense("Helena")], 0],
      },
      { nativeKind: () => undefined, personFirst: () => true },
    );
    expect(capital["Einstein"]?.[3]).toBeUndefined();
    // A name stays one; rule D decides for a person's (`keptOrName`).
    expect(capital["Helen"]?.[3]).toBe("name");
  });
  it("reads the meaning from the first sense that is no pointer, without sense numbers", () => {
    const { capital } = capitalDictionary(
      {
        Frank: ["Franco₁", [["noun", "Franco₁, es decir, un franco"]], 0],
        "I'm": [
          "contracción",
          [
            ["contraction", "contracción de I y am", null, "am"],
            ["contraction", "yo soy"],
          ],
          0,
        ],
      },
      {
        nativeKind: (item) => (item === "Franco" ? "name" : undefined),
        personFirst: () => false,
      },
    );
    expect(capital["Frank"]?.[3]).toBe("name");
    expect(capital["I'm"]?.[3]).toBe("word");
  });
  it("finds no kind by shape in a script without case", () => {
    const { capital } = capitalDictionary(
      { Oh: ["源自朝鲜语的姓氏", [sense("源自朝鲜语的姓氏")], 0] },
      { nativeKind: () => undefined, personFirst: () => false },
    );
    expect(capital["Oh"]).toEqual([
      "源自朝鲜语的姓氏",
      [sense("源自朝鲜语的姓氏")],
      0,
    ]);
  });
});
