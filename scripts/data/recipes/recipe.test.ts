import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASS_HEADWORDS,
  beforeReference,
  capitalDictionary,
  grammarFrame,
  isExampleNote,
  isOtherWord,
  meaningFirst,
  nativeFrame,
  placeholderKey,
  withLabelsInBrackets,
  capitalTermOf,
  convertTerms,
  inCapitalCase,
  inNativeCase,
  inTablesCase,
  lastScriptForm,
  mergeSources,
  nativeKindOf,
  nativeLetterOf,
  pointerTemplates,
  readEdition,
  readTranslationTables,
  termKeyOf,
  usesOfForm,
  withAbbreviations,
  withAuxiliarySenses,
  withSharedFirst,
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
      unmarkedTemplates: 0,
      cased: 0,
      foreign: 0,
      // Its glosses open in lower case.
      sentenceCase: false,
      placeheld: 0,
      reshaped: 0,
      labels: [],
      abbreviations: [],
      placeholders: [],
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

  it("reads no entry on a page `leftOut` names (an undocumented bot import's)", async () => {
    const { terms, capital } = await readEdition(
      join(FIXTURES, "edition-pt.jsonl"),
      termKey,
      { leftOut: new Set(["light", "Light"]) },
    );
    expect([...terms.keys()]).toEqual(["give up", "upset"]);
    expect(capital.size).toBe(0);
  });
});

describe("readEdition: native case and script", () => {
  it("writes glosses in the edition's own case", async () => {
    const { terms, stats } = await readEdition(
      join(FIXTURES, "edition-case.jsonl"),
      termKey,
      { native: "es" },
    );
    // A form an entry lists counts as the edition writes it (clara of claro), after
    // a label in brackets too.
    expect(terms.get("light")?.senses).toEqual([
      ["adjective", "ser leve."],
      ["adjective", "Dicho del color: claro."],
      ["adjective", "Japón"],
      ["adjective", "(de una bebida) clara"],
    ]);
    expect(stats).toMatchObject({ cased: 3, sentenceCase: true });
  });
  it("keeps the case of an edition whose glosses do not open with capitals", async () => {
    // Wikisłownik opens its glosses in lower case: a capital is the word's own
    // (Meksykanin, a noun of nationality), though "meksykanin" is a headword.
    const { terms, stats } = await readEdition(
      join(FIXTURES, "edition-lower.jsonl"),
      termKeyOf({
        vocab: new Set(["mexican", "go"]),
        lemmas: {},
        phrases: new Set(),
      }),
      { native: "pl" },
    );
    expect(stats).toMatchObject({ sentenceCase: false, cased: 0 });
    expect(terms.get("mexican")?.senses[0]).toEqual([
      "noun",
      "Meksykanin, Meksykanka",
    ]);
  });
  it("leaves out a gloss with no letter of the native script beside one with, unless it is the headword", async () => {
    const { terms, stats } = await readEdition(
      join(FIXTURES, "edition-case.jsonl"),
      termKey,
      { native: "ru", letter: nativeLetterOf(["Cyrillic"]) },
    );
    expect(terms.get("upset")?.senses).toEqual([
      ["verb", "расстроить"],
      ["verb", "upset"],
    ]);
    // No gloss of "light" is in the script: it keeps them.
    expect(terms.get("light")?.senses).toHaveLength(4);
    expect(stats.foreign).toBe(1);
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

describe("readEdition: unmarked pointers, placeholders, labels (U1-7)", () => {
  const hygieneKey = termKeyOf({
    vocab: new Set(
      (
        "shrank shrink blessed bless lurked lurk color colour gaol jail ax axe adviser advisor " +
        "bedbug bug ramekin ramequin wore wear doge duke cardinal squeeze stem pression " +
        "absorber binder cocky stub easter rabbit dong dork gun jack prick rod tool wang willy " +
        "schlong abbey baron castle earl knight lord manor squire vassal liege britain soonest " +
        "soon prismatical prismatic shes she has acetanilide"
      ).split(" "),
    ),
    lemmas: {},
    phrases: new Set(),
  });
  const read = () =>
    readEdition(join(FIXTURES, "edition-hygiene.jsonl"), hygieneKey, {
      trimPeriod: true,
      native: "fr",
    });

  it("learns the pointer syntax the edition writes without marking it", async () => {
    const { terms, templates, stats } = await read();
    expect([...templates].sort()).toEqual([
      "prétérit de {x}",
      "variante de {x}",
      "→ voir {x}",
    ]);
    expect(stats.unmarkedTemplates).toBe(2);
    expect(terms.get("color")?.senses).toEqual([
      ["noun", "variante de colour", null, "colour"],
    ]);
    expect(terms.get("adviser")?.senses).toEqual([
      ["noun", "→ voir advisor", null, "advisor"],
    ]);
    // A template with one target, said in the words of the learned ones.
    expect(terms.get("wore")?.senses).toEqual([
      ["verb", "variante de prétérit de wear", null, "wear"],
    ]);
  });

  it("cuts a reference that closes a gloss after an arrow", async () => {
    const { terms } = await read();
    expect(terms.get("doge")?.senses).toEqual([["noun", "doge"]]);
  });

  it("leaves out a placeholder ten headwords share, not a word they share, nor a gloss without letters", async () => {
    const { terms, stats } = await read();
    expect(terms.has("cardinal")).toBe(false);
    expect(terms.has("rabbit")).toBe(false);
    expect(stats.placeheld).toBe(10);
    expect(terms.get("dong")?.senses).toEqual([["noun", "vieux"]]);
    expect(terms.has("acetanilide")).toBe(false);
  });

  it("puts the edition's opening label abbreviations in brackets", async () => {
    const { terms, stats } = await read();
    expect(stats.labels).toEqual(["fig."]);
    expect(terms.get("abbey")?.senses).toEqual([
      ["noun", "(fig.) quelque chose"],
    ]);
    expect(terms.get("britain")?.senses).toEqual([["noun", "(fig.) Bretagne"]]);
  });

  it("puts a translation first after a sentence about the English word", async () => {
    const { terms } = await read();
    expect(terms.get("soonest")?.senses).toEqual([
      ["adverb", "le plus tôt. Superlatif de soon."],
    ]);
    expect(terms.get("prismatical")?.senses).toEqual([
      ["adjective", "prismatique. Variante de prismatic."],
    ]);
    // A description after it stays second.
    expect(terms.get("shes")?.senses[0]?.[1]).toBe(
      "Contraction de she has. Elle a une longue description de ce qu'elle a fait.",
    );
  });
});

describe("U1-7 gloss helpers", () => {
  const frames = new Set(["→ voir {x}"]);
  const isFrame = (template: string) => frames.has(template);
  it("beforeReference: the text before a closing reference", () => {
    expect(beforeReference("doge → voir duke", isFrame)).toBe("doge");
    expect(
      beforeReference("Rouge cardinal. → voir cardinal red", isFrame),
    ).toBe("Rouge cardinal");
    expect(beforeReference("United States → Stany Zjednoczone", isFrame)).toBe(
      "United States → Stany Zjednoczone",
    );
    expect(beforeReference("→ voir duke", isFrame)).toBe("→ voir duke");
  });
  it("meaningFirst: the translation before a sentence about the English word", () => {
    const english = (text: string) => /\b(soon|know|we|are)\b/.test(text);
    expect(meaningFirst("Superlatif de soon. Le plus tôt.", english)).toBe(
      "Le plus tôt. Superlatif de soon.",
    );
    expect(meaningFirst("I don't know. → Nie wiem", english)).toBe(
      "Nie wiem. I don't know.",
    );
    // es we're: the next sentence describes (more than three words in its first item).
    const werE = "Contracción de we are. Nosotros somos o nosotros estamos.";
    expect(meaningFirst(werE, english)).toBe(werE);
    expect(meaningFirst("Más. Comparativo de much", english)).toBe(
      "Más. Comparativo de much",
    );
  });
  it("withLabelsInBrackets: the labels that open a gloss, after a note", () => {
    const isLabel = (token: string) => ["истор.", "астрон."].includes(token);
    expect(withLabelsInBrackets("истор. Британия", isLabel)).toBe(
      "(истор.) Британия",
    );
    expect(
      withLabelsInBrackets("(the Plough) астрон. Большая Медведица", isLabel),
    ).toBe("(the Plough) (астрон.) Большая Медведица");
    expect(withLabelsInBrackets("más. Comparativo de much", isLabel)).toBe(
      "más. Comparativo de much",
    );
  });
  it("withLabelsInBrackets: a label of two abbreviations (ru мн. ч., plural)", () => {
    const isLabel = (token: string) => token === "мн.";
    const isAbbreviation = (token: string) => ["мн.", "т."].includes(token);
    expect(withLabelsInBrackets("мн. ч. слова песни", isLabel)).toBe(
      "(мн. ч.) слова песни",
    );
    // The edition's own bracket takes the second part.
    expect(withLabelsInBrackets("(мн.) ч. тонкости", isLabel)).toBe(
      "(мн. ч.) тонкости",
    );
    expect(
      withLabelsInBrackets("(мн.) т. д. слова", isLabel, isAbbreviation),
    ).toBe("(мн. т. д.) слова");
    // No label first: nothing.
    expect(withLabelsInBrackets("ч. тонкости", isLabel)).toBe("ч. тонкости");
    // Labels a comma joins are one: ru mom "амер., канадск., разг. мама".
    const ru = (token: string) => ["амер.", "разг."].includes(token);
    const ruAbbreviation = (token: string) => token === "канадск.";
    expect(
      withLabelsInBrackets("амер., канадск., разг. мама", ru, ruAbbreviation),
    ).toBe("(амер., канадск., разг.) мама");
    // A comma before a word that is no label: that label is left as written.
    expect(withLabelsInBrackets("разг., мама", ru)).toBe("разг., мама");
  });
  it("withAbbreviations: a no-break space after the edition's abbreviations", () => {
    const isAbbreviation = (token: string) => ["bzw.", "np."].includes(token);
    expect(
      withAbbreviations("unnötiger Gegenstand bzw. Ergänzung", isAbbreviation),
    ).toBe("unnötiger Gegenstand bzw.\u00a0Ergänzung");
    expect(withAbbreviations("osłabić (np. mięsień)", isAbbreviation)).toBe(
      "osłabić (np.\u00a0mięsień)",
    );
    // Not inside a word, not another word's period.
    expect(withAbbreviations("Haus. Note", isAbbreviation)).toBe("Haus. Note");
    expect(withAbbreviations("xbzw. Ende", isAbbreviation)).toBe("xbzw. Ende");
  });
  it("nativeFrame and grammarFrame: templates in the edition's own words", () => {
    const native = (word: string) => ["вариант", "de", "voir"].includes(word);
    const term = (word: string) =>
      ["american", "association", "de"].includes(word);
    expect(nativeFrame("вариант {x}", native, term)).toBe(true);
    expect(nativeFrame("→ voir {x}", native, term)).toBe(true);
    expect(nativeFrame("american {x} association", native, term)).toBe(false);
    const vocabulary = new Set(["pasado", "simple", "del", "verbo", "de"]);
    expect(grammarFrame("pasado simple de {x}", vocabulary)).toBe(true);
    expect(grammarFrame("de {x}", vocabulary)).toBe(false);
    expect(grammarFrame("pasado simple de {x} y algo", vocabulary)).toBe(false);
    // One more word of the edition's own qualifies the syntax; two do not.
    const own = (word: string) =>
      ["auxiliar", "persona", "otro"].includes(word);
    expect(grammarFrame("pasado simple auxiliar de {x}", vocabulary, own)).toBe(
      true,
    );
    expect(grammarFrame("persona de {x}", vocabulary, own)).toBe(false);
    expect(grammarFrame("pasado otro auxiliar de {x}", vocabulary, own)).toBe(
      false,
    );
  });
  it("placeholderKey: a gloss without notes and closing marks", () => {
    expect(
      placeholderKey("Définition manquante ou à compléter. (Ajouter)."),
    ).toBe("définition manquante ou à compléter");
  });
});

describe("readTranslationTables", () => {
  it("leaves a term whose most translated sense the language says with no word to later sources", async () => {
    const read = (langCodes: string[]) =>
      readTranslationTables(join(FIXTURES, "tables-wordless.jsonl"), {
        langCodes,
        termKey: termKeyOf({
          vocab: new Set(["the"]),
          lemmas: {},
          phrases: new Set(),
        }),
      });
    // "not used in Mandarin": 越……越…… is no meaning of "the".
    const zh = await read(["cmn"]);
    expect(zh.terms.has("the")).toBe(false);
    expect(zh.stats.wordless).toBe(1);
    // A lesser sense said with no word is only left out.
    const es = await read(["es"]);
    expect(es.terms.get("the")?.senses).toEqual([["article", "el", "article"]]);
  });

  it("leaves out a row's words where its note gives an example", async () => {
    const { terms } = await readTranslationTables(
      join(FIXTURES, "tables-example.jsonl"),
      {
        langCodes: ["pt"],
        termKey: termKeyOf({
          vocab: new Set(["would"]),
          lemmas: {},
          phrases: new Set(),
        }),
      },
    );
    expect(terms.get("would")?.senses).toEqual([
      ["verb", "usaria", "used to form the conditional"],
    ]);
    expect(
      isExampleNote("We would sit by the hole. - No inverno", "would"),
    ).toBe(true);
    expect(isExampleNote("Use the imperfect tense", "would")).toBe(false);
    expect(isExampleNote("a threefold increase - um aumento", "would")).toBe(
      false,
    );
  });

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
  it("keeps only the parts of a word in the native script, or the headword itself", async () => {
    const { terms, stats } = await readTranslationTables(
      join(FIXTURES, "tables-en.jsonl"),
      { langCodes: ["ru"], termKey, letter: nativeLetterOf(["Cyrillic"]) },
    );
    expect(terms.get("light")?.senses).toEqual([
      ["noun", "свет", "electromagnetic radiation"],
      ["noun", "лампа, light", "source of illumination"],
    ]);
    // A term with no word in the script keeps what it has.
    expect(terms.get("upset")?.senses).toEqual([
      ["verb", "or implied", "to make unhappy"],
    ]);
    expect(stats.foreign).toBe(1);
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
  describe("sense order", () => {
    const orderKey = termKeyOf({
      vocab: new Set(["be", "do", "english", "january", "better", "kg"]),
      lemmas: {},
      phrases: new Set(),
    });
    const tables = (langCodes: string[]) =>
      readTranslationTables(join(FIXTURES, "tables-order.jsonl"), {
        langCodes,
        termKey: orderKey,
      });
    it("orders a term's senses by how many languages translate them, not the page's order", async () => {
      // "to occupy a place" (3 languages) before the passive auxiliary's table (2),
      // which the page lists first; the archaic sense (4) comes last.
      expect((await tables(["de"])).terms.get("be")?.senses).toEqual([
        ["verb", "sein", "to occupy a place"],
        ["verb", "werden", "auxiliary: used to form the passive voice"],
        ["verb", "wesen", "To be, in an old way"],
      ]);
    });
    it("puts a sense outside standard use after the others, however translated", async () => {
      expect((await tables(["de"])).terms.get("do")?.senses).toEqual([
        ["verb", "tun", "perform"],
        ["verb", "bumsen", "slang: have sex with"],
      ]);
    });
    it("leaves a capitalised headword's marked senses out beside unmarked ones", async () => {
      const { capital } = await tables(["it"]);
      expect(capital.get("English")?.senses).toEqual([
        ["adjective", "inglese", "Of or pertaining to England"],
      ]);
      // A surname's transliteration is no marked sense; `capitalDictionary` decides.
      expect((await tables(["ru"])).capital.get("English")?.senses).toEqual([
        ["proper noun", "Инглиш", "transliterations of the surname"],
      ]);
    });
    it("gives the words English writes in lower case, Translingual symbols too", async () => {
      const { lowercase } = await tables(["de"]);
      expect(lowercase.has("english")).toBe(true);
      expect(lowercase.has("kg")).toBe(true);
      expect(lowercase.has("january")).toBe(false);
    });
  });
});

describe("withSharedFirst", () => {
  it("puts the word most of a term's senses share first, in its most translated sense", () => {
    // zh be: 在 is "to occupy a place", the most translated sense; 是 has three senses.
    expect(
      withSharedFirst([
        ["verb", "在", "to occupy a place"],
        ["verb", "有, 存在, 是", "to exist"],
        ["verb", "是", "identical"],
        ["verb", "是", "predicate nominal"],
      ]),
    ).toEqual([
      ["verb", "是, 有, 存在", "to exist"],
      ["verb", "在", "to occupy a place"],
      ["verb", "是", "identical"],
      ["verb", "是", "predicate nominal"],
    ]);
  });
  it("keeps the order when the shared word is in fewer than three senses or the first already", () => {
    const get: PairSense[] = [
      ["verb", "获得, 得到, 取", "to obtain"],
      ["verb", "取", "to fetch"],
    ];
    expect(withSharedFirst(get)).toEqual(get);
    const be: PairSense[] = [
      ["verb", "sein", "to occupy a place"],
      ["verb", "sein", "to exist"],
      ["verb", "sein", "identical"],
    ];
    expect(withSharedFirst(be)).toEqual(be);
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
      described: [],
      lacking: [],
      pointing: [],
      expanded: [],
    });
  });
  it("takes a closed-class term a source only describes from the next that translates it", () => {
    const edition = new Map<string, SourceTerm>([
      [
        "the",
        {
          short: "stosowany przed wyrazem znanym z kontekstu",
          senses: [
            ["article", "stosowany przed wyrazem znanym z kontekstu"],
            ["article", "stosowany przed nazwą geograficzną"],
          ],
        },
      ],
      [
        "a",
        {
          short: "używany przed spółgłoską",
          senses: [["article", "używany przed spółgłoską i rzeczownikiem"]],
        },
      ],
      // A description that is followed by translations translates.
      [
        "you",
        {
          short: "Pronombre de segunda persona",
          senses: [["pronoun", "Pronombre de segunda persona; tú, usted"]],
        },
      ],
      // An open class's description is its meaning.
      [
        "pilot",
        {
          short: "Persona que dirige un avión",
          senses: [["noun", "Persona que dirige un avión"]],
        },
      ],
    ]);
    const tables = new Map<string, SourceTerm>([
      ["the", { short: "ten", senses: [["article", "ten", "this"]] }],
      // Only the letter's name: no article.
      ["a", { short: "a", senses: [["noun", "a", "name of the letter A"]] }],
      ["you", { short: "ty", senses: [["pronoun", "ty", "you"]] }],
      ["pilot", { short: "piloto", senses: [["noun", "piloto", "pilot"]] }],
    ]);
    const { dict, described } = mergeSources([
      { tag: "plwiktionary", terms: edition },
      { tag: "enwiktionary-translations", terms: tables },
    ]);
    expect(dict["the"]).toEqual(["ten", [["article", "ten", "this"]], 1]);
    expect(dict["a"]?.[2]).toBe(0);
    expect(dict["you"]?.[2]).toBe(0);
    expect(dict["pilot"]?.[2]).toBe(0);
    expect(described).toEqual(["the"]);
  });
  it("takes a contraction from a later source that translates what it is short for", () => {
    const edition = new Map<string, SourceTerm>([
      [
        "don't",
        {
          short: "signifie l’impératif négatif",
          senses: [["verb", "signifie l’impératif négatif"]],
        },
      ],
      ["i'm", { short: "je suis", senses: [["verb", "je suis"]] }],
    ]);
    const tables = new Map<string, SourceTerm>([
      ["don't", { short: "ne… pas", senses: [["verb", "ne… pas", "do not"]] }],
      ["i'm", { short: "chuis", senses: [["verb", "chuis", "Contraction"]] }],
    ]);
    const { dict, expanded } = mergeSources(
      [
        { tag: "frwiktionary", terms: edition },
        { tag: "enwiktionary-translations", terms: tables },
      ],
      {
        expansionsOf: (key) =>
          ({ "don't": ["do not"], "i'm": ["I am"] })[key] ?? [],
      },
    );
    expect(dict["don't"]?.[2]).toBe(1);
    expect(dict["i'm"]?.[2]).toBe(0);
    expect(expanded).toEqual(["don't"]);
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
  it("keeps a form's pointers beside another word of the same spelling (dug: no teat)", () => {
    const pointer = (target: string) =>
      ["verb", `pretérito de ${target}`, null, target] as const;
    const edition = new Map<string, SourceTerm>([
      ["dug", { short: "pretérito", senses: [[...pointer("dig")]] }],
      ["used", { short: "pasado", senses: [[...pointer("use")]] }],
      [
        "stranger",
        {
          short: "comparativo",
          senses: [["adjective", "comparativo de strange", null, "strange"]],
        },
      ],
    ]);
    const tables = new Map<string, SourceTerm>([
      ["dug", { short: "teta", senses: [["noun", "teta", "teat"]] }],
      ["used", { short: "usado", senses: [["adjective", "usado", "worn"]] }],
      [
        "stranger",
        { short: "extraño", senses: [["noun", "extraño", "person"]] },
      ],
    ]);
    const english = {
      formTags: new Map([
        ["dug", new Set(["form-of", "past", "participle"])],
        ["used", new Set(["form-of", "past", "participle"])],
        ["stranger", new Set(["form-of", "comparative"])],
      ]),
      coverage: new Map([
        ["dug", 7],
        ["dig", 98],
        ["used", 27],
        ["use", 112],
        ["stranger", 55],
        ["strange", 109],
      ]),
    };
    const { dict, pointing } = mergeSources(
      [
        { tag: "eswiktionary", terms: edition },
        { tag: "enwiktionary-translations", terms: tables },
      ],
      {
        otherWord: (key, taken, later) =>
          isOtherWord(key, taken, later, english),
      },
    );
    // A past is no noun, and "teat" is translated far less than dig.
    expect(dict["dug"]?.[2]).toBe(0);
    // A past participle is an adjective ("usado"); a widely translated noun is a word.
    expect(dict["used"]?.[2]).toBe(1);
    expect(dict["stranger"]?.[2]).toBe(1);
    expect(pointing).toEqual(["dug"]);
  });
  it("usesOfForm: what English uses a form of each kind as", () => {
    expect(usesOfForm(new Set(["form-of", "past", "participle"]))).toEqual([
      "adjective",
    ]);
    expect(usesOfForm(new Set(["form-of", "past"]))).toEqual([]);
    expect(
      usesOfForm(new Set(["form-of", "gerund", "participle", "present"])),
    ).toEqual(["adjective", "noun"]);
    expect(usesOfForm(new Set(["form-of", "plural"]))).toEqual(["noun"]);
  });
  it("takes a term with no meaning in its main part of speech from the next source with one", () => {
    const edition = new Map<string, SourceTerm>([
      // pl better: the verb and the noun only.
      [
        "better",
        {
          short: "poprawić",
          senses: [
            ["verb", "poprawić, ulepszyć"],
            ["noun", "ktoś lepszy"],
          ],
        },
      ],
      // es worse: its adjective is only a degree of "bad".
      [
        "worse",
        {
          short: "empeorar",
          senses: [
            ["verb", "empeorar"],
            ["adjective", "comparativo de bad"],
          ],
        },
      ],
      // The same translation under another label.
      ["yesterday", { short: "ayer", senses: [["adverb", "ayer"]] }],
      // Not an open class: sources label numerals differently.
      ["seven", { short: "siete", senses: [["adjective", "siete"]] }],
    ]);
    const tables = new Map<string, SourceTerm>([
      [
        "better",
        { short: "lepszy", senses: [["adjective", "lepszy", "comparative"]] },
      ],
      ["worse", { short: "peor", senses: [["adjective", "peor", "worse"]] }],
      ["yesterday", { short: "ayer", senses: [["noun", "ayer", "the day"]] }],
      ["seven", { short: "siete", senses: [["numeral", "siete", "7"]] }],
    ]);
    const main: Record<string, string> = {
      better: "adjective",
      worse: "adjective",
      yesterday: "noun",
      seven: "numeral",
    };
    const { dict, lacking } = mergeSources(
      [
        { tag: "plwiktionary", terms: edition },
        { tag: "enwiktionary-translations", terms: tables },
      ],
      {
        mainPos: (key) => main[key],
        degree: (_, sense) => sense[1].startsWith("comparativo de"),
      },
    );
    expect(dict["better"]?.[0]).toBe("lepszy");
    expect(dict["worse"]?.[0]).toBe("peor");
    expect(dict["yesterday"]?.[2]).toBe(0);
    expect(dict["seven"]?.[2]).toBe(0);
    expect(lacking).toEqual(["better", "worse"]);
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
  it("reads a typographic apostrophe as the vocabulary's (Wiktionnaire's I’m)", () => {
    const keys = termKeyOf({
      vocab: new Set(["i'm"]),
      lemmas: {},
      phrases: new Set(),
    });
    expect(capitalTermOf("I’m", keys)).toBe("I'm");
    expect(keys("i’m")).toBe("i'm");
  });
  it("keys a capital-only word by its capitals only, and lets a name's words be one", () => {
    const keys = termKeyOf({
      vocab: new Set(["new"]),
      lemmas: {},
      phrases: new Set(["new zealand"]),
      capitals: ["AI", "Tokyo", "Zealand"],
    });
    expect(capitalTermOf("Tokyo", keys)).toBe("Tokyo");
    expect(capitalTermOf("AI", keys)).toBe("AI");
    // Not the sloth "ai", nor any lower-case headword.
    expect(keys("ai")).toBeUndefined();
    expect(keys("New Zealand")).toBe("new zealand");
  });
});

describe("nativeLetterOf", () => {
  it("knows a script other than Latin, the learning language's", () => {
    expect(nativeLetterOf(["Latin"])).toBeUndefined();
    expect(nativeLetterOf(["Han"])?.test("是")).toBe(true);
    expect(nativeLetterOf(["Han"])?.test("or implied")).toBe(false);
    expect(nativeLetterOf(["Cyrillic"])?.test("We sat, опоздает")).toBe(true);
  });
});

describe("inNativeCase", () => {
  const entries = (names: string[], common: string[]) => (word: string) => ({
    name: names.includes(word),
    common: common.includes(word),
  });
  const es = entries(
    ["Holanda", "China"],
    ["ser", "y", "pronombre", "profundo", "enero", "holanda", "china"],
  );
  it("writes an opening word, and one a colon introduces, as the edition does", () => {
    expect(inNativeCase("Ser", es, { head: "be" })).toBe("ser");
    expect(inNativeCase("Y", es, { head: "and" })).toBe("y");
    expect(
      inNativeCase("Pronombre de segunda persona", es, { head: "you" }),
    ).toBe("pronombre de segunda persona");
    expect(
      inNativeCase("Dicho del sueño: Profundo", es, { head: "deep" }),
    ).toBe("Dicho del sueño: profundo");
  });
  it("keeps a word the edition writes capitalised, and acronyms", () => {
    expect(inNativeCase("Japón", es, { head: "japan" })).toBe("Japón");
    expect(inNativeCase("EE. UU.", es, { head: "us" })).toBe("EE. UU.");
    // The first word of a name of several.
    const it = entries([], ["gran"]);
    expect(
      inNativeCase("Gran Bretagna", it, { head: "Britain", capital: true }),
    ).toBe("Gran Bretagna");
    // German capitalises its nouns: "Sein" is one, "sein" a verb.
    const de = entries([], ["sein", "Sein"]);
    expect(
      inNativeCase("Sein", de, { head: "being", capitalNouns: true }),
    ).toBe("Sein");
    // Elsewhere a capitalised entry is no word of its own (fr "Ce", a symbol).
    const fr = entries([], ["ce", "Ce"]);
    expect(inNativeCase("Ce … -ci", fr, { head: "this" })).toBe("ce … -ci");
  });
  it("keeps a capitalised headword's proper noun or the headword itself", () => {
    expect(inNativeCase("Enero", es, { head: "January", capital: true })).toBe(
      "enero",
    );
    expect(
      inNativeCase("Holanda", es, { head: "Holland", capital: true }),
    ).toBe("Holanda");
    expect(inNativeCase("China", es, { head: "China", capital: true })).toBe(
      "China",
    );
  });
});

describe("inTablesCase", () => {
  it("writes an edition's capitalised gloss in the case the tables write it", () => {
    const capital: Parameters<typeof inTablesCase>[0] = {
      March: ["Marzo", [["noun", "Marzo"]], 0, "word"],
      God: ["Dios", [["proper noun", "Dios"]], 0, "word"],
      Japan: ["Japón", [["proper noun", "Japón"]], 1, "name"],
    };
    const tables = new Map<string, SourceTerm>([
      [
        "March",
        { short: "marzo", senses: [["proper noun", "marzo", "month"]] },
      ],
      ["God", { short: "Dios", senses: [["proper noun", "Dios", "deity"]] }],
      ["Japan", { short: "japón", senses: [["proper noun", "japón", "x"]] }],
    ]);
    expect(inTablesCase(capital, 0, tables)).toBe(1);
    expect(capital["March"]).toEqual(["marzo", [["noun", "marzo"]], 0, "word"]);
    expect(capital["God"]?.[0]).toBe("Dios");
    // Another source's words stay as written.
    expect(capital["Japan"]?.[0]).toBe("Japón");
  });
});

describe("withAuxiliarySenses", () => {
  it("labels an edition's verb senses that name the tables' word for auxiliary", () => {
    const dict: Record<string, [string, PairSense[], number]> = {
      have: [
        "tener",
        [
          ["verb", "tener"],
          ["verb", "haber (como verbo auxiliar)"],
        ],
        0,
      ],
      help: ["auxiliar", [["noun", "auxiliar"]], 0],
      do: ["hacer", [["verb", "hacer", "to perform"]], 1],
    };
    expect(withAuxiliarySenses(dict, 0, ["auxiliar", "aux"])).toBe(1);
    expect(dict["have"]?.[1][1]).toEqual([
      "auxiliary",
      "haber (como verbo auxiliar)",
    ]);
    expect(dict["help"]?.[1][0]?.[0]).toBe("noun");
  });
});

describe("capitalDictionary: an exclamation's senses", () => {
  it("come after the word's others", () => {
    const { capital } = capitalDictionary(
      {
        God: [
          "interjeição que mostra frustração",
          [
            ["interjection", "interjeição que mostra frustração"],
            ["noun", "Deus"],
          ],
          0,
        ],
      },
      { nativeKind: () => "word", personFirst: () => false },
    );
    expect(capital["God"]?.[1].map(([pos]) => pos)).toEqual([
      "noun",
      "interjection",
    ]);
    expect(capital["God"]?.[0]).toBe("Deus");
  });
});

describe("inCapitalCase", () => {
  it("puts one source's capitalised glosses in the edition's case, their meaning as read", () => {
    const capital = capitalDictionary(
      {
        January: ["Enero", [["proper noun", "Enero"]], 0],
        Birmingham: [
          "Ciudad de Inglaterra",
          [["proper noun", "Ciudad de Inglaterra"]],
          0,
        ],
        Japan: ["Japón", [["proper noun", "Japón", "country"]], 1],
      },
      {
        nativeKind: (item) => (item === "Enero" ? "word" : undefined),
        personFirst: () => false,
      },
    ).capital;
    const entries = (word: string) => ({
      name: false,
      common: ["enero", "ciudad"].includes(word),
    });
    expect(
      inCapitalCase(capital, 0, (text, head) =>
        inNativeCase(text, entries, { head, capital: true }),
      ),
    ).toBe(2);
    expect(capital["January"]).toEqual([
      "enero",
      [["proper noun", "enero"]],
      0,
      "word",
    ]);
    // Read as a name from its capitals before.
    expect(capital["Birmingham"]?.[3]).toBe("name");
    expect(capital["Birmingham"]?.[1][0]?.[1]).toBe("ciudad de Inglaterra");
    // Another source's words stay as written.
    expect(capital["Japan"]?.[0]).toBe("Japón");
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
    expect(counts).toEqual({
      classSenses: 0,
      personSenses: 0,
      word: 2,
      name: 2,
      none: 1,
    });
  });
  it("leaves out a headword with no meaning that has an English definition instead", () => {
    const { capital } = capitalDictionary(
      {
        Instagram: ["Instagram", [sense("Instagram")], 1],
        Tokyo: ["Tokio", [sense("Tokio")], 0],
        Texas: ["Texas", [sense("Texas")], 0],
      },
      {
        nativeKind: () => "name",
        personFirst: () => false,
        // Capital-only words: their English definitions.
        defined: (term) => ["instagram", "tokyo"].includes(term),
      },
    );
    expect(Object.keys(capital)).toEqual(["Tokyo", "Texas"]);
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
  it("reads a common word's sense as a word in a script without case, where the edition does not say", () => {
    const { capital } = capitalDictionary(
      { English: ["英国人的", [["adjective", "英国人的", "of England"]], 0] },
      { nativeKind: () => undefined, personFirst: () => false },
    );
    expect(capital["English"]?.[3]).toBe("word");
  });
  it("leaves a sense about a person's name out beside a meaning: no surname under a language", () => {
    const { capital, counts } = capitalDictionary(
      {
        English: [
          "английский",
          [
            ["adjective", "английский", "of England"],
            ["proper noun", "Инглиш", "transliterations of the surname"],
            ["proper noun", "Инглиш", "A male or female given name"],
          ],
          0,
        ],
        // A person's name alone keeps what it has.
        Michael: ["Михаил", [["proper noun", "Михаил", "male given name"]], 0],
      },
      { nativeKind: () => undefined, personFirst: () => false },
    );
    expect(capital["English"]?.[1]).toEqual([
      ["adjective", "английский", "of England"],
    ]);
    expect(capital["Michael"]?.[1]).toHaveLength(1);
    expect(counts.personSenses).toBe(2);
  });
  it("takes an edition's senses in turns by part of speech, then caps them", () => {
    const { capital } = capitalDictionary(
      {
        English: [
          "anglais",
          [
            ["adjective", "anglais"],
            ["adjective", "relatif à l'Angleterre"],
            ["adjective", "relatif aux habitants de l'Angleterre"],
            ["adjective", "qui n'est pas Amish"],
            ["noun", "Anglais ; le peuple anglais"],
            ["proper noun", "anglais, langue anglaise"],
          ],
          0,
        ],
      },
      { nativeKind: () => "word", personFirst: () => false },
    );
    expect(capital["English"]?.[1]).toEqual([
      ["adjective", "anglais"],
      ["noun", "Anglais ; le peuple anglais"],
      ["proper noun", "anglais, langue anglaise"],
      ["adjective", "relatif à l'Angleterre"],
    ]);
  });
});
