// Correcting selected words to their phrase, over the generated English pack (with its
// tagger), as the background does it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packSourcePath } from "../../../scripts/data/formats.ts";
import { createClassifier } from "../classify";
import { createLanguagePack } from "../lexicon/language-pack";
import { createPackLoader } from "../packs/load";
import {
  correctPhrase,
  corrects,
  isDictionaryPhrase,
  sameWords,
} from "./correct";

const loadPack = createPackLoader(async (path) =>
  JSON.parse(readFileSync(packSourcePath(path), "utf8")),
);
const en = await loadPack("en");
const pack = createLanguagePack("en", {
  lemmas: en.lemmas,
  freq: en.freq,
  ipa: en.ipa,
  vocab: new Set(en.vocab),
  patterns: en.phrases,
  contractions: en.contractions,
  pos: en.pos,
  names: en.names,
  tagger: en.tagger,
});

/** `text` as the phrase of `selected` (the first time it is in `sentence`). */
function fix(sentence: string, selected: string, text: string) {
  const start = sentence.indexOf(selected);
  return correctPhrase(pack, sentence, start, start + selected.length, text);
}

const key = (sentence: string, selected: string, text: string) => {
  const found = fix(sentence, selected, text);
  return found.ok ? found.key : found.why;
};

describe("correctPhrase: the dictionary form", () => {
  const MIND = "In the end she made up her mind.";

  it("puts verbs in their base form and a possessive as one's", () => {
    expect(key(MIND, "she made up her", "made up her mind")).toBe(
      "make up one's mind",
    );
  });

  it("keeps a phrase already in dictionary form", () => {
    expect(key(MIND, "she made up her", "make up one's mind")).toBe(
      "make up one's mind",
    );
  });

  it("puts an object pronoun as someone or something, and a reflexive as oneself", () => {
    expect(
      key("She gave him a hand with the bags.", "gave him", "gave him a hand"),
    ).toBe("give someone a hand");
    expect(
      key(
        "I think we should call it a day now.",
        "should call it",
        "call it a day",
      ),
    ).toBe("call it a day");
    expect(
      key(
        "You need to pull yourself together.",
        "pull yourself",
        "pull yourself together",
      ),
    ).toBe("pull oneself together");
  });

  it("keeps nouns as written and leaves a conjunction that fills no slot", () => {
    expect(
      key(
        "He spilled the beans about the party.",
        "spilled the",
        "spilled the beans",
      ),
    ).toBe("spill the beans");
    expect(
      key(
        "We left early in the hope that it would stop.",
        "the hope that",
        "in the hope that",
      ),
    ).toBe("in the hope that");
  });

  it("keeps the sentence's separators between the words", () => {
    expect(key("Well, I think so.", "Well, I", "well I think")).toBe(
      "well, i think",
    );
    expect(key("Well, I think so.", "Well, I", "Well, I think")).toBe(
      "well, i think",
    );
  });

  it("takes the dictionary's pattern for the words, gap included", () => {
    expect(
      key(
        "Can you put the box away before dinner?",
        "put the box",
        "put the box away",
      ),
    ).toBe("put away");
    // A slot the dictionary leaves out of a phrasal verb.
    expect(
      key(
        "Can you put the box away before dinner?",
        "put the box",
        "put something away",
      ),
    ).toBe("put away");
  });

  it("gives the phrase's place in the sentence, gap included", () => {
    const sentence = "Can you put the box away before dinner?";
    const found = fix(sentence, "put the box", "put the box away");
    expect(found.ok && sentence.slice(found.start, found.end)).toBe(
      "put the box away",
    );
  });
});

describe("correctPhrase: what cannot be saved", () => {
  it("needs two words", () => {
    expect(key("He spilled the beans.", "spilled the", "beans")).toBe("words");
    expect(key("He spilled the beans.", "spilled the", "  ")).toBe("words");
  });

  it("needs the phrase in this sentence, over the selection", () => {
    const sentence = "In the end she made up her mind.";
    expect(key(sentence, "she made up her", "make up my mind")).toBe(
      "sentence",
    );
    expect(key(sentence, "she made up her", "kick the bucket")).toBe(
      "sentence",
    );
    // In the sentence, but away from the selection.
    expect(
      key(
        "He spilled the beans, and then we made up our minds.",
        "spilled the",
        "make up one's mind",
      ),
    ).toBe("sentence");
  });
});

describe("a correction's checks", () => {
  it("corrects: other words, or a slot", () => {
    const sentence = "In the end she made up her mind.";
    const start = sentence.indexOf("made up her mind");
    const end = start + "made up her mind".length;
    const found = correctPhrase(pack, sentence, start, end, "made up her mind");
    // Its own words, but with a slot: a correction.
    expect(corrects(found, start, end, pack.rules)).toBe(true);
    const plain = "He spilled the beans.";
    const s = plain.indexOf("spilled the beans");
    const same = correctPhrase(
      pack,
      plain,
      s,
      s + "spilled the beans".length,
      "spill the beans",
    );
    expect(corrects(same, s, s + "spilled the beans".length, pack.rules)).toBe(
      false,
    );
    expect(corrects(same, s, s + "spilled the".length, pack.rules)).toBe(true);
  });

  it("sameWords compares words as keys do", () => {
    expect(sameWords(pack, "Made  up’ her", "made up' her")).toBe(true);
    expect(sameWords(pack, "made up", "make up")).toBe(false);
  });

  it("isDictionaryPhrase: the pack's patterns", () => {
    expect(isDictionaryPhrase(pack, "make up one's mind")).toBe(true);
    expect(isDictionaryPhrase(pack, "make up her mind")).toBe(false);
  });
});

describe("a corrected phrase, saved, is highlighted in its sentence", () => {
  const classifier = createClassifier(pack);
  it.each([
    ["In the end she made up her mind.", "she made up her", "made up her mind"],
    [
      "Can you put the box away before dinner?",
      "put the box",
      "put the box away",
    ],
    ["She gave him a hand with the bags.", "gave him", "gave him a hand"],
  ])("%s", (sentence, selected, text) => {
    const found = fix(sentence, selected, text);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    const spans = classifier.classify(pack.tokenize(sentence), {
      terms: new Map([[found.key, "learning"]]),
      knownLevel: 3000,
    });
    expect(spans.some((s) => s.key === found.key)).toBe(true);
  });
});
