import { describe, expect, it } from "vitest";
import type { TokenTag, WordRole } from "../tagging/tagger";
import type { WordReading } from "../word-sense";
import { markerPos, phraseMisfit } from "./fit";
import { NO_RULES } from "./pattern";

/** Phrase patterns' parts of speech, as the source gives them (main first). */
const PHRASE_POS: Record<string, string[]> = {
  "thank you": ["phrase"],
  "you see": ["intj", "phrase"],
  "find out": ["verb"],
  "come to": ["verb"],
  "go to": ["verb", "noun"],
  "kind of": ["adv"],
  "after all": ["prep_phrase"],
  "by the name of": ["prep_phrase"],
  "as a result": ["prep_phrase"],
  "big deal": ["intj", "noun"],
  "you know": ["intj"],
  "got it": ["intj"],
  "come on": ["verb", "intj"],
  "link in": ["verb"],
  "mask off": ["verb"],
  "hold on": ["verb"],
  "fly in": ["verb"],
  "come from below": ["verb"],
  "to go": ["adj"],
  "break up": ["noun", "verb"],
};
/** Words' main parts of speech. */
const WORD_POS: Record<string, string[]> = {
  you: ["pronoun"],
  know: ["verb"],
  kind: ["noun"],
  all: ["determiner"],
  of: ["preposition"],
  result: ["noun"],
  big: ["adjective"],
  got: ["verb"],
  come: ["verb"],
};
const pack = {
  phrasePos: (key: string) => PHRASE_POS[key] ?? [],
  intransitive: (key: string) => key === "fly in" || key === "come from below",
  partsOfSpeech: (word: string) => WORD_POS[word] ?? [],
  rules: {
    ...NO_RULES,
    particles: new Set(["out", "to", "in", "off", "on", "of", "below"]),
    prepositions: new Set(["to", "of"]),
  },
};

const NO_ROLE: WordRole = {
  determiner: false,
  nounPhrase: false,
  object: false,
  modal: false,
  infinitive: false,
  preposition: false,
  subject: false,
  partitive: false,
  be: false,
  pastParticiple: false,
};
/** What each label's word is, as an English tagger would say. */
const ROLES: Record<string, Partial<WordRole>> = {
  determiner: { determiner: true, nounPhrase: true, object: true },
  noun: { nounPhrase: true, object: true, subject: true },
  numeral: { nounPhrase: true, object: true },
  pronoun: { subject: true },
  preposition: { preposition: true },
};

/**
 * A sentence's readings from "word/label[/role,role]" items, a leading "," for a
 * pause before the word; "word/?" has no trusted tag.
 */
function readings(text: string): WordReading[] {
  return text.split(" ").map((item) => {
    const pauseBefore = item.startsWith(",");
    const [, label, flags] = item.replace(/^,/, "").split("/");
    const role: WordRole = { ...NO_ROLE, ...(ROLES[label!] ?? {}) };
    for (const flag of flags?.split(",") ?? [])
      (role as unknown as Record<string, boolean>)[flag] = true;
    const tag: TokenTag | undefined =
      label === "?"
        ? undefined
        : {
            tag: label!,
            label: label!,
            inflected: false,
            morph: false,
            proper: false,
            confidence: Infinity,
          };
    return {
      ...(tag && { tag }),
      use: { auxiliary: false, verbal: false, prepositionSlot: false },
      role,
      pauseBefore,
    };
  });
}

/** The rule the phrase `key` at words `from`… of `text` breaks. */
const misfit = (key: string, text: string, from: number, punctuated = true) =>
  phraseMisfit(
    pack,
    {
      key,
      words: key.split(" ").map((_, i) => from + i),
    },
    readings(text),
    punctuated,
  );

describe("phraseMisfit: P1, utterances", () => {
  it("never highlights a pattern that is only a whole utterance", () => {
    expect(misfit("thank you", "thank/verb you/pronoun", 0)).toBe("utterance");
    expect(misfit("you see", "you/pronoun see/verb", 0)).toBeUndefined();
  });
  it("needs no tags for it", () => {
    expect(
      phraseMisfit(pack, { key: "thank you", words: [0, 1] }, [], true),
    ).toBe("utterance");
    expect(
      phraseMisfit(pack, { key: "find out", words: [0, 1] }, [], true),
    ).toBeUndefined();
  });
});

describe("phraseMisfit: P2, the particle must be adverbial", () => {
  it("keeps a verb and particle read as an adverb", () => {
    expect(misfit("find out", "find/verb out/adverb", 0)).toBeUndefined();
  });
  it("drops one whose particle is read as a preposition or the infinitive marker", () => {
    expect(misfit("come to", "come/verb to/preposition tokyo/noun", 0)).toBe(
      "particle",
    );
    expect(misfit("come to", "come/verb to/particle see/verb", 0)).toBe(
      "particle",
    );
  });
  it("keeps it when a preposition follows the particle", () => {
    expect(
      misfit("find out", "find/verb out/preposition of/preposition", 0),
    ).toBeUndefined();
  });
  it("keeps it when the particle's tag is not trusted", () => {
    expect(misfit("find out", "find/verb out/?", 0)).toBeUndefined();
  });
  it("drops it, trusted tag or not, when the particle is never an adverb", () => {
    expect(misfit("come to", "come/verb to/?", 0)).toBe("particle");
    expect(misfit("go to", "go/verb to/? bed/noun", 0)).toBe("particle");
  });
});

describe("phraseMisfit: adjectives and nouns", () => {
  it("drops one with a word tagged as a bare verb", () => {
    expect(misfit("to go", "have/verb to/? go/verb", 1)).toBe("nominal");
    expect(misfit("to go", "coffee/noun to/? go/adjective", 1)).toBeUndefined();
  });
  it("keeps one the source also has as a verb", () => {
    expect(misfit("break up", "break/verb up/adverb", 0)).toBeUndefined();
  });
});

describe("phraseMisfit: adverbs", () => {
  it("drops an adverb with a noun in it after a determiner", () => {
    expect(
      misfit(
        "kind of",
        "what/determiner kind/noun of/preposition music/noun",
        1,
      ),
    ).toBe("adverb");
  });
  it("keeps it elsewhere, or when a verb, adjective or adverb follows", () => {
    expect(
      misfit("kind of", "it/pronoun kind/noun of/preposition works/verb", 1),
    ).toBeUndefined();
    expect(
      misfit(
        "kind of",
        "this/determiner kind/noun of/preposition opened/verb",
        1,
      ),
    ).toBeUndefined();
  });
});

describe("phraseMisfit: prepositional phrases", () => {
  it("drops one inside a clause before a noun phrase", () => {
    expect(
      misfit(
        "after all",
        "we/pronoun left/verb after/preposition all/determiner the/determiner work/noun",
        2,
      ),
    ).toBe("prepositional");
  });
  it("drops one ending in a determiner before a partitive", () => {
    expect(
      misfit(
        "after all",
        "we/pronoun left/verb after/preposition all/determiner of/preposition/partitive",
        2,
      ),
    ).toBe("prepositional");
  });
  it("keeps one ending in a noun before a partitive: a longer preposition", () => {
    expect(
      misfit(
        "as a result",
        "it/pronoun rose/verb as/preposition a/determiner result/noun of/preposition/partitive",
        2,
      ),
    ).toBeUndefined();
  });
  it("keeps one at a clause start, after a pause, or ending in a preposition", () => {
    expect(
      misfit("after all", "after/preposition all/determiner the/determiner", 0),
    ).toBeUndefined();
    expect(
      misfit(
        "after all",
        "it/pronoun failed/verb ,after/preposition all/determiner the/determiner",
        2,
      ),
    ).toBeUndefined();
    expect(
      misfit(
        "by the name of",
        "a/determiner man/noun by/preposition the/determiner name/noun of/preposition john/noun",
        2,
      ),
    ).toBeUndefined();
  });
});

describe("phraseMisfit: interjections", () => {
  it("drops one after a modal or a do-auxiliary", () => {
    expect(misfit("you know", "do/verb/modal you/pronoun know/verb", 1)).toBe(
      "interjection",
    );
  });
  it("drops one not starting with a pronoun after a determiner, to or a preposition", () => {
    expect(misfit("big deal", "a/determiner big/adjective deal/noun", 1)).toBe(
      "interjection",
    );
    expect(
      misfit("big deal", "no/? ,big/adjective deal/noun", 1),
    ).toBeUndefined();
  });
  it("drops one starting with a verb after a subject", () => {
    expect(misfit("got it", "he/pronoun got/verb it/pronoun", 1)).toBe(
      "interjection",
    );
    expect(misfit("got it", "got/verb it/pronoun", 0)).toBeUndefined();
  });
  it("drops one ending in a verb before an object, in a punctuated document only", () => {
    const text = "you/pronoun know/verb the/determiner guy/noun";
    expect(misfit("you know", text, 0)).toBe("interjection");
    expect(misfit("you know", text, 0, false)).toBeUndefined();
    expect(
      misfit("you know", "you/pronoun know/verb ,the/determiner guy/noun", 0),
    ).toBeUndefined();
  });
});

describe("phraseMisfit: verb phrases", () => {
  it("drops one whose first word is tagged otherwise inside a noun phrase", () => {
    expect(
      misfit("mask off", "take/verb that/determiner mask/noun off/adverb", 2),
    ).toBe("verb");
  });
  it("keeps a noun tag after a subject: more often the tagger's mistake", () => {
    expect(
      misfit("mask off", "boyfriend/noun mask/noun off/adverb", 1),
    ).toBeUndefined();
  });
  it("drops a passive participle right after be whose particle opens a noun phrase", () => {
    const held = "will/verb be/verb/be held/verb/pastParticiple on/adverb";
    expect(misfit("hold on", `${held} the/determiner`, 2)).toBe("passive");
    expect(misfit("hold on", `${held} ,then/adverb`, 2)).toBeUndefined();
    expect(
      misfit(
        "hold on",
        "is/verb/be a/determiner held/verb/pastParticiple on/adverb the/determiner",
        2,
      ),
    ).toBeUndefined();
  });
  it("drops an intransitive one whose particle is a preposition before a determiner or number", () => {
    expect(
      misfit(
        "come from below",
        "come/verb from/preposition below/preposition the/determiner",
        0,
      ),
    ).toBe("intransitive");
    expect(
      misfit(
        "come from below",
        "come/verb from/preposition below/adverb ,the/determiner",
        0,
      ),
    ).toBeUndefined();
  });
});

describe("markerPos: discourse markers", () => {
  const marker = (key: string, text: string, from: number) =>
    markerPos(
      pack,
      { key, words: key.split(" ").map((_, i) => from + i) },
      readings(text),
      true,
    );
  it("takes the interjection senses at a clause start", () => {
    expect(marker("come on", "come/verb on/adverb ,let's/verb", 0)).toBe(
      "interjection",
    );
    expect(
      marker("you know", "well/adverb ,you/pronoun know/verb ,it/pronoun", 1),
    ).toBe("interjection");
  });
  it("not inside a clause, before an object, or for a phrase with no interjection", () => {
    expect(
      marker("come on", "they/pronoun come/verb on/adverb", 1),
    ).toBeUndefined();
    expect(
      marker("you know", "you/pronoun know/verb the/determiner guy/noun", 0),
    ).toBeUndefined();
    expect(marker("find out", "find/verb out/adverb", 0)).toBeUndefined();
  });
});
