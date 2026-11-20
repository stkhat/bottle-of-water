import { describe, expect, it } from "vitest";
import { tokenize } from "../text/tokenize";
import { ENGLISH_RULES } from "./en";
import {
  createPhraseMatcher,
  longestMatch,
  type MatchInput,
  type MatchMode,
  type PhraseMatch,
} from "./matcher";
import { SPANISH_RULES } from "./es";
import { FRENCH_RULES } from "./fr";
import { GERMAN_RULES } from "./de";

// Base forms as LanguagePack.lemmas gives them: "beans" has only "bean", so
// `spill the beans` must match its written form.
const BASES: Record<string, string[]> = {
  made: ["make"],
  spilled: ["spill"],
  beans: ["bean"],
  bean: ["bean"],
  figured: ["figure"],
  found: ["found", "find"],
  gave: ["give"],
  pulled: ["pull"],
  picked: ["pick"],
  his: ["his", "he"],
  her: ["her", "she"],
};
const lemmas = (word: string) => BASES[word.toLowerCase()] ?? [];

const english = createPhraseMatcher({
  lang: "en",
  rules: ENGLISH_RULES,
  patterns: {
    detect: [
      "figure out",
      "find out",
      "give up",
      "give up on",
      "look up",
      "make it",
      "make up",
      "pick up",
      "spill the beans",
      "someone else",
      "turn off",
      "up to",
    ],
    more: [
      "be all ears",
      "found out",
      "make up one's mind",
      "pull oneself together",
      "pull someone's leg",
    ],
    gap: ["figure out", "make up", "turn off"],
  },
  lemmas,
});

const input = (text: string) => english.prepare(tokenize(text, "en"));

/** The match starting at the first word that has one, with its words' text. */
function find(
  text: string,
  mode: MatchMode,
  saved?: ReadonlySet<string>,
): { key: string; words: string } | undefined {
  const words = input(text);
  for (let i = 0; i < words.words.length; i++) {
    const match =
      mode === "saved"
        ? english.longestAt(words, i, mode, saved!)
        : english.longestAt(words, i, mode);
    if (match) return described(words, match);
  }
  return undefined;
}

const described = (words: MatchInput, match: PhraseMatch) => ({
  key: match.key,
  words: match.words.map((i) => words.words[i]!.token.text).join(" "),
});

/** The match of a selection: the words inside the first occurrence of `selected`. */
function select(text: string, selected: string) {
  const words = input(text);
  const start = text.indexOf(selected);
  const end = start + selected.length;
  const inside = words.words
    .map((word, i) => ({ word, i }))
    .filter(({ word }) => word.token.start >= start && word.token.end <= end);
  const match = english.matchSelection(
    words,
    inside[0]!.i,
    inside.at(-1)!.i + 1,
  );
  return match && described(words, match);
}

describe("prepare", () => {
  it("keeps the word tokens with their forms and which ones only spaces join", () => {
    const words = input("She made up, her mind.");
    expect(words.words.map((word) => word.token.text)).toEqual([
      "She",
      "made",
      "up",
      "her",
      "mind",
    ]);
    expect(words.words[1]).toMatchObject({ form: "made", bases: ["make"] });
    expect(words.joined).toEqual([true, true, false, true, false]);
    expect(words.between).toEqual([" ", " ", ", ", " "]);
  });

  it("writes what separates two words as a key does", () => {
    expect(input("WH-WHAT?").between).toEqual(["-"]);
    expect(input("Well,\n  I “said”").between).toEqual([", ", ' "']);
  });

  it("prepares a block without words", () => {
    expect(input(" ... ")).toEqual({ words: [], joined: [], between: [] });
  });
});

describe("literal words", () => {
  it("matches a word by a base form or as written", () => {
    expect(find("They spilled the beans.", "detect")).toEqual({
      key: "spill the beans",
      words: "spilled the beans",
    });
  });

  it("does not match a base form that is not the pattern's word", () => {
    expect(find("They spill the bean.", "select")).toBeUndefined();
  });

  it("does not match across punctuation", () => {
    expect(find("They spilled, the beans.", "select")).toBeUndefined();
    expect(find("They spilled the-beans.", "select")).toBeUndefined();
  });

  it("matches across line breaks and several spaces", () => {
    expect(find("spilled  the\nbeans", "detect")?.key).toBe("spill the beans");
  });

  it("takes the pattern with the most words", () => {
    expect(find("I gave up on it.", "detect")).toEqual({
      key: "give up on",
      words: "gave up on",
    });
  });

  it("only matches a pattern that starts at the word", () => {
    const words = input("She gave up.");
    expect(english.longestAt(words, 0, "detect")).toBeUndefined();
    expect(english.longestAt(words, 1, "detect")?.key).toBe("give up");
    expect(english.longestAt(words, 2, "detect")).toBeUndefined();
    expect(english.longestAt(words, 3, "detect")).toBeUndefined();
  });

  it("breaks a tie between patterns on the same words by key", () => {
    // "found" has the bases found and find: both patterns match the same words.
    expect(find("They found out.", "select")?.key).toBe("find out");
    expect(select("They found out.", "found out")?.key).toBe("find out");
  });
});

describe("slots", () => {
  it("fills one's with a possessive", () => {
    expect(find("She made up her mind.", "select")).toEqual({
      key: "make up one's mind",
      words: "made up her mind",
    });
  });

  it("fills a slot with the slot word itself", () => {
    expect(find("make up one's mind", "select")?.key).toBe(
      "make up one's mind",
    );
  });

  it("fills someone's with any word ending in 's", () => {
    expect(find("Don't pull Anna's leg.", "select")).toEqual({
      key: "pull someone's leg",
      words: "pull Anna's leg",
    });
    expect(find("Don't pull Anna’s leg.", "select")?.key).toBe(
      "pull someone's leg",
    );
    expect(find("Don't pull his leg.", "select")?.key).toBe(
      "pull someone's leg",
    );
  });

  it("matches a slot word in the text once, as its slot", () => {
    const words = input("Don't pull someone's leg.");
    expect(english.matchesAt(words, 1, "select")).toEqual([
      { key: "pull someone's leg", words: [1, 2, 3] },
    ]);
  });

  it("fills only someone's with a name's possessive", () => {
    expect(find("She made up Anna's mind.", "select")?.key).toBe("make up");
  });

  it("does not fill a slot with another word", () => {
    expect(find("Don't pull the leg.", "select")).toBeUndefined();
    expect(find("She made up the mind.", "select")?.key).toBe("make up");
  });

  it("fills oneself with a reflexive", () => {
    expect(find("He pulled himself together.", "select")).toEqual({
      key: "pull oneself together",
      words: "pulled himself together",
    });
  });

  it("matches saved keys with slots", () => {
    const saved = new Set(["make up one's mind"]);
    expect(find("He made up his mind.", "saved", saved)).toEqual({
      key: "make up one's mind",
      words: "made up his mind",
    });
  });

  it("fills a Spanish slot only with itself", () => {
    const spanish = createPhraseMatcher({
      lang: "es",
      rules: SPANISH_RULES,
      patterns: { detect: [], more: ["tomar el pelo a alguien"], gap: [] },
      lemmas: () => [],
    });
    const at0 = (text: string) =>
      spanish.longestAt(spanish.prepare(tokenize(text, "es")), 0, "select")
        ?.key;
    expect(at0("tomar el pelo a alguien")).toBe("tomar el pelo a alguien");
    expect(at0("tomar el pelo a Juan")).toBeUndefined();
    expect(at0("tomar el pelo a ella")).toBeUndefined();
  });
});

describe("gaps", () => {
  it("lets a gap pattern skip words after its first word in saved and select modes", () => {
    const expected = { key: "figure out", words: "figure out" };
    expect(find("We figure it out.", "select")).toEqual(expected);
    expect(find("We figure it out.", "saved", new Set(["figure out"]))).toEqual(
      expected,
    );
  });

  it("returns the indices of the pattern's words only", () => {
    const words = input("We figure it out.");
    expect(english.longestAt(words, 1, "select")).toEqual({
      key: "figure out",
      words: [1, 3],
    });
  });

  it("skips up to three words", () => {
    expect(find("Turn the kitchen lights off.", "select")).toEqual({
      key: "turn off",
      words: "Turn off",
    });
    expect(find("Turn all the kitchen lights off.", "select")).toBeUndefined();
  });

  it("does not skip over punctuation", () => {
    expect(find("We figure it, out.", "select")).toBeUndefined();
    expect(find("We figure, it out.", "select")).toBeUndefined();
  });

  it("does not skip a conjunction or a subject, which start another clause", () => {
    expect(find("I figure and we find out.", "select")?.key).not.toBe(
      "figure out",
    );
    expect(find("I figure we'll find out.", "select")?.key).not.toBe(
      "figure out",
    );
    expect(find("I figure they find out.", "select")?.key).not.toBe(
      "figure out",
    );
  });

  it("matches a gap pattern without a gap", () => {
    expect(find("We figured out.", "select")?.key).toBe("figure out");
  });

  it("gives no gap to a saved key the pack does not flag", () => {
    const saved = new Set(["pick up"]);
    expect(find("I picked it up.", "saved", saved)).toBeUndefined();
    expect(find("I picked up.", "saved", saved)?.key).toBe("pick up");
  });

  it("breaks a tie on the number of words with the shorter range", () => {
    // `make it` and `make up` (with a gap) both have two words.
    expect(find("She made it up.", "select")).toEqual({
      key: "make it",
      words: "made it",
    });
  });
});

describe("detect mode", () => {
  it("matches detect patterns contiguously, without gaps", () => {
    expect(find("We figure it out.", "detect")).toBeUndefined();
    expect(find("We figured out.", "detect")?.key).toBe("figure out");
  });

  it("ignores patterns with slots", () => {
    expect(find("She made up her mind.", "detect")).toEqual({
      key: "make up",
      words: "made up",
    });
  });

  it("reads a detect pattern's words literally", () => {
    expect(find("Ask someone else.", "detect")?.key).toBe("someone else");
    expect(find("Ask him else.", "detect")).toBeUndefined();
  });

  it("ignores patterns that are only in more", () => {
    expect(find("Be all ears.", "detect")).toBeUndefined();
    expect(find("Be all ears.", "select")?.key).toBe("be all ears");
  });

  it("matches a name that is a unit where the text writes it with capitals", () => {
    const matcher = createPhraseMatcher({
      lang: "en",
      rules: ENGLISH_RULES,
      patterns: {
        detect: [],
        more: ["council of europe", "new zealand"],
        gap: [],
        names: ["Council of Europe", "New Zealand"],
      },
      lemmas,
    });
    const at = (text: string, upper = false) =>
      matcher.longestAt(
        matcher.prepare(tokenize(text, "en"), upper),
        1,
        "detect",
      )?.key;
    expect(at("in New Zealand.")).toBe("new zealand");
    // Not new land in lower case, nor in a text in capitals, whose case says nothing.
    expect(at("in new zealand.")).toBeUndefined();
    expect(at("in New zealand.")).toBeUndefined();
    expect(at("IN NEW ZEALAND.", true)).toBeUndefined();
    // The name's small words in lower case, as it writes them.
    expect(at("the Council of Europe")).toBe("council of europe");
  });
});

describe("saved mode", () => {
  it("matches only the saved keys", () => {
    expect(find("I gave up on it.", "saved", new Set(["give up"]))).toEqual({
      key: "give up",
      words: "gave up",
    });
    expect(find("I gave up on it.", "saved", new Set())).toBeUndefined();
  });

  it("matches saved keys that are not in the pack and ignores single words", () => {
    const saved = new Set(["tangy dough", "dough"]);
    expect(find("A tangy dough.", "saved", saved)?.key).toBe("tangy dough");
    expect(find("A dough.", "saved", saved)).toBeUndefined();
  });

  it("matches a saved key across the separators it writes, and only those", () => {
    const saved = new Set(["wh-what", "well, i think", "she-she's"]);
    expect(find("WH-WHAT did you say?", "saved", saved)).toEqual({
      key: "wh-what",
      words: "WH WHAT",
    });
    expect(find("Well,  I think so.", "saved", saved)).toEqual({
      key: "well, i think",
      words: "Well I think",
    });
    expect(find("SHE-SHE’S here.", "saved", saved)?.key).toBe("she-she's");
    expect(find("Wh what?", "saved", saved)).toBeUndefined();
    expect(find("Well. I think so.", "saved", saved)).toBeUndefined();
    expect(find("Well I think so.", "saved", saved)).toBeUndefined();
  });

  it("matches a saved key of words joined by spaces across spaces only", () => {
    const saved = new Set(["tangy dough"]);
    expect(find("A tangy, dough.", "saved", saved)).toBeUndefined();
    expect(find("A tangy-dough.", "saved", saved)).toBeUndefined();
  });

  it("keeps dictionary patterns to words joined by spaces", () => {
    expect(find("We gave-up early.", "detect")).toBeUndefined();
    expect(find("We gave, up early.", "detect")).toBeUndefined();
  });

  it("keeps every saved key written with the same words", () => {
    const words = input("Don't pull his leg.");
    const saved = new Set(["pull someone's leg", "pull someone’s leg"]);
    expect(
      english.matchesAt(words, 1, "saved", saved).map((match) => match.key),
    ).toEqual(["pull someone's leg", "pull someone’s leg"]);
  });

  it("indexes each saved set by itself", () => {
    const words = input("We figure it out.");
    const a = new Set(["figure out"]);
    const b = new Map([["give up", "learning"]]);
    expect(english.longestAt(words, 1, "saved", a)?.key).toBe("figure out");
    expect(english.longestAt(words, 1, "saved", b)).toBeUndefined();
    expect(english.longestAt(words, 1, "saved", a)?.key).toBe("figure out");
  });

  it("indexes a saved set once, so changed keys need a new object", () => {
    const words = input("We figure it out.");
    const keys = new Set<string>();
    expect(english.longestAt(words, 1, "saved", keys)).toBeUndefined();
    keys.add("figure out");
    expect(english.longestAt(words, 1, "saved", keys)).toBeUndefined();
    expect(english.longestAt(words, 1, "saved", new Set(keys))?.key).toBe(
      "figure out",
    );
  });
});

describe("matchesAt", () => {
  it("returns every match at the word, which longestMatch ranks", () => {
    const words = input("I gave up on it.");
    const matches = english.matchesAt(words, 1, "detect");
    expect(matches.map((match) => match.key).sort()).toEqual([
      "give up",
      "give up on",
    ]);
    expect(longestMatch(matches)?.key).toBe("give up on");
    expect(longestMatch([])).toBeUndefined();
  });

  it("ranks the most words, then the shorter range, then the key", () => {
    const key = (...matches: PhraseMatch[]) => longestMatch(matches)?.key;
    expect(
      key({ key: "b", words: [0, 1] }, { key: "a", words: [0, 2, 3] }),
    ).toBe("a");
    expect(key({ key: "a", words: [0, 2] }, { key: "b", words: [0, 1] })).toBe(
      "b",
    );
    expect(key({ key: "b", words: [0, 1] }, { key: "a", words: [0, 1] })).toBe(
      "a",
    );
    expect(key({ key: "a", words: [0, 1] }, { key: "b", words: [0, 1] })).toBe(
      "a",
    );
  });
});

describe("matchSelection", () => {
  it("lets the sentence complete a selection that is part of a longer pattern", () => {
    expect(select("She made up her mind.", "made up")).toEqual({
      key: "make up one's mind",
      words: "made up her mind",
    });
    expect(select("She made up her mind.", "her mind")?.key).toBe(
      "make up one's mind",
    );
  });

  it("takes a pattern whose words span the whole selection, gap words included", () => {
    expect(select("She made it up.", "made it up")).toEqual({
      key: "make up",
      words: "made up",
    });
    expect(select("She made it up.", "made it")?.key).toBe("make it");
  });

  it("takes no pattern that only part of the selection is in", () => {
    // Past the pattern's end, before its start, and around it.
    expect(select("She gave up on it.", "gave up on it")).toBeUndefined();
    expect(select("She gave up.", "She gave up")).toBeUndefined();
    expect(select("We pick up the bean.", "We pick up the")).toBeUndefined();
    // Across the end of one pattern and the start of another.
    expect(select("Look up to them.", "Look up to")).toBeUndefined();
  });

  it("prefers the pattern with the most words among those spanning the selection", () => {
    expect(select("She gave up on it.", "gave up")?.key).toBe("give up on");
    expect(select("She gave up on it.", "gave up on")?.key).toBe("give up on");
  });

  it("needs two of the pattern's words inside the selection", () => {
    expect(select("Turn the kitchen lights off.", "Turn the kitchen")).toBe(
      undefined,
    );
    expect(select("Turn the lights off.", "lights off")).toBeUndefined();
    expect(select("She made up her mind.", "mind")).toBeUndefined();
  });

  it("gives ties to the earliest start", () => {
    const matcher = createPhraseMatcher({
      lang: "en",
      rules: ENGLISH_RULES,
      patterns: { detect: ["look up to", "up to you"], more: [], gap: [] },
      lemmas,
    });
    const words = matcher.prepare(tokenize("Look up to you.", "en"));
    expect(matcher.matchSelection(words, 1, 3)?.key).toBe("look up to");
  });

  it("needs two selected words of the pattern, not one next to the selection", () => {
    expect(select("She made up her mind.", "She made")).toBeUndefined();
  });

  it("returns undefined when the selection matches nothing", () => {
    expect(select("The big dog barked.", "big dog")).toBeUndefined();
  });
});

describe("Spanish pronominal verbs and contractions", () => {
  // Base forms as the Spanish pack gives them: a form with a pronoun attached is a form
  // of its verb ("darme" → dar).
  const ES_BASES: Record<string, string[]> = {
    di: ["di", "dar", "decir"],
    dimos: ["dar"],
    da: ["dar"],
    dado: ["dar"],
    dando: ["dar"],
    darme: ["dar"],
    darle: ["dar"],
    darse: ["dar"],
    dándose: ["dar"],
    date: ["dar"],
    dame: ["dar"],
    llevase: ["llevar"],
    lleva: ["llevar"],
    ha: ["haber"],
    cuenta: ["cuenta", "contar"],
    bien: ["bien"],
    través: ["través"],
    de: ["de"],
    a: ["a"],
    del: ["del"],
    al: ["al"],
    tiempo: ["tiempo"],
    fondo: ["fondo"],
  };
  const esLemmas = (word: string) => ES_BASES[word.toLowerCase()] ?? [];
  const spanish = createPhraseMatcher({
    lang: "es",
    rules: SPANISH_RULES,
    patterns: {
      detect: [
        "a fondo",
        "a tiempo",
        "a través de",
        "dar cuenta de",
        "darse cuenta",
        "llevarse bien",
      ],
      more: [],
      gap: [],
    },
    lemmas: esLemmas,
  });
  /** The longest match starting at the first word that has one, as its words' text. */
  const first = (text: string) => {
    const words = spanish.prepare(tokenize(text, "es"));
    for (let i = 0; i < words.words.length; i++) {
      const match = spanish.longestAt(words, i, "detect");
      if (!match) continue;
      const all =
        match.lead === undefined ? match.words : [match.lead, ...match.words];
      return {
        key: match.key,
        words: all.map((j) => words.words[j]!.token.text).join(" "),
      };
    }
    return undefined;
  };

  it("matches a pronominal verb after its reflexive pronoun, which leads the match", () => {
    const words = spanish.prepare(tokenize("Me di cuenta de todo.", "es"));
    expect(spanish.longestAt(words, 0, "detect")).toEqual({
      key: "darse cuenta",
      words: [1, 2],
      lead: 0,
    });
    expect(first("Nos dimos cuenta de que era tarde.")).toEqual({
      key: "darse cuenta",
      words: "Nos dimos cuenta",
    });
  });

  it("lets other pronouns and an auxiliary's forms stand between, as a gap", () => {
    const words = spanish.prepare(tokenize("Se lo ha dado cuenta", "es"));
    expect(spanish.longestAt(words, 0, "detect")).toEqual({
      key: "darse cuenta",
      words: [3, 4],
      lead: 0,
    });
  });

  it("matches a pronominal verb with its pronoun attached, and not the plain verb's pattern", () => {
    expect(first("Tardé en darme cuenta de eso.")).toEqual({
      key: "darse cuenta",
      words: "darme cuenta",
    });
    expect(first("Dándose cuenta de eso, se fue.")?.key).toBe("darse cuenta");
    expect(first("Date cuenta de lo que pasa.")?.key).toBe("darse cuenta");
  });

  it("leaves a verb without a reflexive pronoun to the plain verb's patterns", () => {
    expect(first("Le di cuenta de todo.")?.key).toBe("dar cuenta de");
    expect(first("Vino a darle cuenta de todo.")?.key).toBe("dar cuenta de");
    // An imperative takes "me" as its object, not as a reflexive pronoun.
    expect(first("Dame cuenta de todo.")?.key).toBe("dar cuenta de");
    // A past subjunctive ends in "-se" without the accent an imperative writes.
    expect(first("Llevase bien.")).toBeUndefined();
  });

  it("reads a contraction as its preposition only at a pattern's end", () => {
    expect(first("Lo vimos a través del cristal.")).toEqual({
      key: "a través de",
      words: "a través del",
    });
    expect(first("Está al fondo del pasillo.")).toBeUndefined();
    expect(first("Llegó al tiempo que salía.")).toBeUndefined();
  });

  it("reads a word in capitals by the one known spelling with its accent", () => {
    const matcher = createPhraseMatcher({
      lang: "es",
      rules: SPANISH_RULES,
      patterns: { detect: [], more: [], gap: [] },
      lemmas: (word) => (word === "están" ? ["estar"] : []),
      accented: (word) => (word === "estan" ? "están" : undefined),
    });
    const [upper] = matcher.prepare(tokenize("ESTAN", "es"), true).words;
    expect(upper).toMatchObject({ form: "están", bases: ["estar"] });
    const [mixed] = matcher.prepare(tokenize("Estan", "es")).words;
    expect(mixed).toMatchObject({ form: "estan", bases: [] });
  });
});

describe("French pronominal verbs, elisions and compounds", () => {
  const FR_BASES: Record<string, string[]> = {
    je: ["je"],
    il: ["il"],
    nous: ["nous"],
    me: ["me"],
    "m'": ["m'"],
    se: ["se"],
    "s'": ["s'"],
    toi: ["toi"],
    en: ["en"],
    suis: ["être", "suivre"],
    est: ["être"],
    rendu: ["rendre"],
    rends: ["rendre"],
    rendons: ["rendre"],
    rend: ["rendre"],
    rendre: ["rendre"],
    compte: ["compte", "compter"],
    ne: ["ne"],
    "n'": ["n'"],
    pas: ["pas"],
    plus: ["plus"],
    jamais: ["jamais"],
    "c'": ["c'", "ce"],
    ça: ["ça"],
    fait: ["fait", "faire"],
    "qu'": ["qu'", "que"],
    vais: ["aller"],
    allé: ["aller"],
    aller: ["aller"],
    a: ["avoir"],
    avoir: ["avoir"],
    "l'": ["l'", "le"],
    "d'": ["d'", "de"],
    air: ["air"],
    "d'accord": ["d'accord"],
    mettre: ["mettre"],
    "peut-être": ["peut-être"],
    peut: ["pouvoir"],
    être: ["être"],
    que: ["que"],
  };
  const frLemmas = (word: string) => FR_BASES[word.toLowerCase()] ?? [];
  const whole = (word: string) => frLemmas(word).length > 0;
  const french = createPhraseMatcher({
    lang: "fr",
    rules: FRENCH_RULES,
    patterns: {
      detect: [
        "avoir l'air",
        "c'est ça",
        "mettre d'accord",
        "ne faire que",
        "peut-être que",
        "rendre compte",
        "s'en aller",
        "se rendre compte",
      ],
      more: [],
      gap: [],
      // Verb patterns, but "c'est ça" (an interjection) and "peut-être que".
      pos: { detect: "v i v v - v v v", more: "" },
    },
    lemmas: frLemmas,
  });
  const first = (text: string) => {
    const words = french.prepare(tokenize(text, "fr", whole));
    for (let i = 0; i < words.words.length; i++) {
      const match = french.longestAt(words, i, "detect");
      if (match) return described(words, match);
    }
    return undefined;
  };

  it("splits a key's elided words as text does, and keeps the words text reads whole", () => {
    expect(french.keyParts("avoir l'air")).toEqual({
      words: ["avoir", "l'", "air"],
      between: [" ", ""],
    });
    expect(french.keyParts("mettre d'accord").words).toEqual([
      "mettre",
      "d'accord",
    ]);
    expect(french.keyParts("peut-être que").words).toEqual([
      "peut-être",
      "que",
    ]);
    expect(first("Il a l'air content.")).toEqual({
      key: "avoir l'air",
      words: "a l' air",
    });
    expect(first("On va les mettre d'accord.")?.key).toBe("mettre d'accord");
    expect(first("Peut-être que oui.")?.key).toBe("peut-être que");
  });

  it("joins an elided word to the next with nothing, as the key writes it", () => {
    const { between, joined } = french.prepare(
      tokenize("l'air du temps", "fr", whole),
    );
    expect(between[0]).toBe("");
    expect(joined[0]).toBe(true);
  });

  it("matches a pronominal verb with any reflexive pronoun, être's forms left out", () => {
    expect(first("Je me suis rendu compte de tout.")).toEqual({
      key: "se rendre compte",
      words: "me rendu compte",
    });
    expect(first("Il s'est rendu compte.")).toEqual({
      key: "se rendre compte",
      words: "s' rendu compte",
    });
    expect(first("Il faut se rendre compte.")?.key).toBe("se rendre compte");
    expect(first("Nous nous rendons compte.")).toEqual({
      key: "se rendre compte",
      words: "nous rendons compte",
    });
    expect(first("Je m'en vais.")).toEqual({
      key: "s'en aller",
      words: "m' en vais",
    });
    expect(first("Il s'en est allé.")?.key).toBe("s'en aller");
  });

  it("matches an imperative with the pronoun after it", () => {
    expect(first("Rends-toi compte !")).toEqual({
      key: "se rendre compte",
      words: "Rends toi compte",
    });
  });

  it("leaves a subject and its verb to the plain verb", () => {
    expect(first("Nous rendons compte de tout.")?.key).toBe("rendre compte");
  });

  it("matches a verb pattern with a negation's second word after its verb, a gap", () => {
    expect(first("Je ne me rends pas compte.")).toEqual({
      key: "se rendre compte",
      words: "me rends compte",
    });
    expect(first("Je ne me suis jamais rendu compte.")).toEqual({
      key: "se rendre compte",
      words: "me rendu compte",
    });
    expect(first("Il n'a pas l'air content.")).toEqual({
      key: "avoir l'air",
      words: "a l' air",
    });
    // "pas" negates alone, as speech has it; "plus" needs "ne".
    expect(first("Il a pas l'air content.")?.key).toBe("avoir l'air");
    expect(first("Il a plus l'air content.")).toBeUndefined();
  });

  it("leaves a negation inside a pattern that is no verb's, or one that is a negation itself", () => {
    expect(first("C'est pas ça.")).toBeUndefined();
    expect(first("Il ne fait pas qu'aider.")).toBeUndefined();
  });
});

describe("German word order", () => {
  const DE_BASES: Record<string, string[]> = {
    nimmt: ["nehmen"],
    nehmen: ["nehmen"],
    genommen: ["nehmen"],
    kauf: ["kauf"],
    gibt: ["geben", "abgeben", "angeben"],
    geben: ["geben"],
    gab: ["geben", "abgeben", "angeben"],
    löffel: ["löffel"],
    ab: ["ab"],
    mache: ["machen"],
    macht: ["machen"],
    machen: ["machen"],
    weg: ["weg"],
    den: ["der"],
    sich: ["sich"],
    mich: ["mich", "ich"],
    dich: ["dich", "du"],
    ich: ["ich"],
    er: ["er"],
    sieht: ["sehen", "aussehen"],
    aus: ["aus"],
    gas: ["gas"],
    und: ["und"],
  };
  const deLemmas = (word: string) => DE_BASES[word.toLowerCase()] ?? [];
  const german = createPhraseMatcher({
    lang: "de",
    rules: GERMAN_RULES,
    patterns: {
      detect: [
        "auf den weg machen",
        "den löffel abgeben",
        "gas geben",
        "in kauf nehmen",
        "sich auf den weg machen",
      ],
      more: [],
      gap: [],
      pos: { detect: "v v v v v", more: "" },
    },
    lemmas: deLemmas,
  });
  const first = (text: string) => {
    const words = german.prepare(tokenize(text, "de"));
    for (let i = 0; i < words.words.length; i++) {
      const match = german.longestAt(words, i, "detect");
      if (match)
        return {
          ...described(words, match),
          ...(match.lead !== undefined && {
            lead: words.words[match.lead]!.token.text,
          }),
          ...(match.moved && { moved: true }),
        };
    }
    return undefined;
  };

  it("matches a verb pattern as written, and with zu before its infinitive", () => {
    expect(first("Man muss das in Kauf nehmen.")).toEqual({
      key: "in kauf nehmen",
      words: "in Kauf nehmen",
    });
    expect(first("Er hat es in Kauf genommen.")?.key).toBe("in kauf nehmen");
    expect(first("Sie war bereit, das in Kauf zu nehmen.")).toEqual({
      key: "in kauf nehmen",
      words: "in Kauf nehmen",
    });
  });

  it("matches a finite verb moved before the pattern's other words", () => {
    expect(first("Er nimmt das gern in Kauf.")).toEqual({
      key: "in kauf nehmen",
      words: "in Kauf",
      lead: "nimmt",
      moved: true,
    });
    expect(first("Er gibt jetzt Gas.")).toEqual({
      key: "gas geben",
      words: "Gas",
      lead: "gibt",
      moved: true,
    });
  });

  it("takes a separable verb's particle after the others", () => {
    expect(first("Er gab gestern den Löffel ab.")).toEqual({
      key: "den löffel abgeben",
      words: "den Löffel ab",
      lead: "gab",
      moved: true,
    });
    expect(first("Er gab gestern den Löffel.")).toBeUndefined();
  });

  it("stops at a conjunction, which opens another clause", () => {
    expect(first("Er nimmt es und Kauf.")).toBeUndefined();
    expect(first("Er nimmt das und dann in Kauf.")).toBeUndefined();
  });

  it("reads the subject's reflexive pronoun as sich, with words between", () => {
    expect(first("Ich mache mich auf den Weg.")).toEqual({
      key: "sich auf den weg machen",
      words: "mich auf den Weg",
      lead: "mache",
      moved: true,
    });
    expect(first("Er macht sich endlich auf den Weg.")?.key).toBe(
      "sich auf den weg machen",
    );
    // "mich" with no "ich" in its clause is an object, not reflexive.
    expect(first("Er macht mich auf den Weg.")?.key).toBe("auf den weg machen");
  });

  it("does not match a separable verb's base written apart where the pattern writes it joined", () => {
    const { words } = german.prepare(tokenize("Er sieht gut aus.", "de"));
    expect(words[1]!.literals).toEqual(["sieht", "sehen"]);
    expect(words[1]!.forms).toContain("aussehen");
  });
});
