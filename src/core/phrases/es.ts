// The data scripts (scripts/data/) import this file under plain Node: keep its imports
// type-only.
import type { PhraseRules, ReflexiveRules } from "./pattern";

/** Third-person object pronouns, attached after a reflexive one ("comérselo"). */
const OBJECT_ENDING = /(?:lo|la|los|las|le|les)$/;
const REFLEXIVE_ENDING = /(me|te|se|nos|os)$/;
/** A gerund, once its stress accent is gone ("dándose" → "dando"). */
const GERUND = /(?:ando|iendo|yendo)$/;

/** Without the acute accents a pronoun attached to a verb adds ("dándo" → "dando"). */
const unstressed = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\u0301/g, "")
    .normalize("NFC");

const STRESSED = /[áéíóú]/;
const syllables = (text: string) => text.match(/[aeiouáéíóúü]+/g)?.length ?? 0;

/**
 * A verb form with a reflexive pronoun attached, and the reflexive verb it is a form
 * of: the pronoun first after the verb, a third-person object pronoun may follow
 * ("comérselo"). An infinitive or a gerund takes any person ("darme cuenta", "dándonos
 * cuenta"); an imperative only its own: tú "te" ("date"), usted and ustedes "se"
 * ("dese", "dense"), nosotros "nos" after the "-mo" that drops its "s" ("démonos"),
 * vosotros "os" after the "-a", "-e", "-i" that drops its "d" ("daos", "idos"). An
 * imperative of more than one syllable writes its stress once a pronoun is attached
 * ("cállate", "váyase"): without it, "-se" ends a past subjunctive ("llevase") and
 * "-te" another form ("diste").
 */
function attached(
  form: string,
  bases: readonly string[],
  lemmas: (word: string) => readonly string[],
): string | undefined {
  if (bases.length === 0) return undefined;
  const pronoun = REFLEXIVE_ENDING.exec(form.replace(OBJECT_ENDING, ""));
  if (!pronoun) return undefined;
  const written = form.slice(0, pronoun.index);
  const verb = unstressed(written);
  if (verb.length < 2) return undefined;
  const formOf = (text: string) => (base: string) =>
    lemmas(text).includes(base);
  const imperative = STRESSED.test(written) || syllables(written) === 1;
  /** The imperative of the pronoun's person, as a form of `base`. */
  const ownImperative = (base: string) => {
    const person = pronoun[1];
    if (person === "te" || person === "se")
      return imperative && formOf(verb)(base);
    if (person === "nos")
      return verb.endsWith("mo") && formOf(`${verb}s`)(base);
    if (person === "os") return formOf(`${verb}d`)(base) || formOf(verb)(base);
    return false;
  };
  return bases.find(
    (base) =>
      unstressed(base) === verb ||
      (GERUND.test(verb) && formOf(verb)(base)) ||
      ownImperative(base),
  );
}

const SPANISH_REFLEXIVE: ReflexiveRules = {
  ending: "se",
  pronouns: new Set(["me", "te", "se", "nos", "os"]),
  objects: new Set([
    ...["me", "te", "nos", "os", "lo", "la", "los", "las", "le", "les"],
  ]),
  auxiliaries: new Set(["haber", "estar"]),
  maxBetween: 2,
  attached,
};

/**
 * Spanish slots, each filled only by itself, pronominal verbs ("me di cuenta" →
 * `darse cuenta`), the contractions "al" and "del", and adjectives after nouns. No
 * gaps.
 */
export const SPANISH_RULES: PhraseRules = {
  slots: new Map([
    ["alguien", new Set<string>()],
    ["algo", new Set<string>()],
  ]),
  maxGap: 0,
  reflexive: SPANISH_REFLEXIVE,
  contractions: new Map([
    ["al", "a"],
    ["del", "de"],
  ]),
  adjectivesAfterNouns: true,
};
