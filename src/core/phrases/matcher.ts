import { normalizeWord, type Token } from "../text/tokenize";
import { separatorKey, splitKey, type KeyParts } from "./key";
import { NO_RULES, type PhrasePatterns, type PhraseRules } from "./pattern";

/**
 * - `detect`: the pack's `detect` patterns, contiguous, every word literal.
 * - `saved`: the user's saved keys, with slots, and with a gap when the pack flags the
 *   key `gap`.
 * - `select`: every pattern (`detect` and `more`), with slots and gaps.
 */
export type MatchMode = "detect" | "saved" | "select";

export interface MatchWord {
  readonly token: Token;
  /** The written form, normalized (`normalizeWord`): what fills a slot. */
  readonly form: string;
  /** Base forms from `LanguagePack.lemmas`; [] when the word is unknown. */
  readonly bases: readonly string[];
  /** The written form and the base forms, distinct. */
  readonly forms: readonly string[];
  /**
   * The pronominal verb a form with a reflexive pronoun attached stands for, as
   * patterns write it ("darme", "dándose" → "darse"; `PhraseRules.reflexive`).
   */
  readonly reflexive?: string;
  /** What a literal pattern word matches: `forms`, then `reflexive`. */
  readonly literals: readonly string[];
  /** The slots the word fills under the language's rules. */
  readonly slots: readonly string[];
  /**
   * The trie words it stands for where the rules' slot words are slots: its literals
   * that are not slot words, then the slots it fills (`literals` when it fills none and
   * is none).
   */
  readonly steps: readonly string[];
}

/** The words of one block of text, prepared once for every match in it. */
export interface MatchInput {
  readonly words: readonly MatchWord[];
  /**
   * `joined[i]`: only whitespace, or nothing after an elided word, separates word i
   * from word i + 1 (false for the last).
   */
  readonly joined: readonly boolean[];
  /**
   * `between[i]`: what separates word i from word i + 1, as a key writes it
   * (`separatorKey`: " " for whitespace alone, "" after an elided word: "l'homme");
   * none after the last.
   */
  readonly between: readonly string[];
}

export interface PhraseMatch {
  readonly key: string;
  /**
   * Indices of the words that match the pattern's words, one per pattern word,
   * ascending. The words in a gap are not among them.
   */
  readonly words: readonly number[];
  /**
   * A word before them that belongs to the match: the reflexive pronoun before a
   * pronominal verb ("me" in "me di cuenta" for `darse cuenta`). The words between it
   * and the verb ("se ha quitado la vida") are a gap.
   */
  readonly lead?: number;
}

/** A match's first word: its lead, or its first pattern word. */
export const matchStart = (match: PhraseMatch) => match.lead ?? match.words[0]!;

/** Saved terms (a `TermIndex`, or a set of keys); single words among them are ignored. */
interface SavedKeys {
  keys(): Iterable<string>;
}

export interface PhraseMatcherOptions {
  /** The language: saved keys are split into words as its text is (`splitKey`). */
  lang: string;
  rules: PhraseRules;
  patterns: PhrasePatterns;
  /** Base forms of a word as written in text (`LanguagePack.lemmas`). */
  lemmas(word: string): readonly string[];
  /**
   * The one known spelling of an unknown word with the accent that writing it in
   * capitals left out ("estan" → "están"; `LanguagePack.accented`).
   */
  accented?(word: string): string | undefined;
}

export interface PhraseMatcher {
  /**
   * The block's words, from all of its tokens (words, spaces and punctuation). `upper`:
   * the text is in capitals, so an unknown word is read as the one known spelling with
   * the accent capitals leave out (`PhraseMatcherOptions.accented`).
   */
  prepare(tokens: readonly Token[], upper?: boolean): MatchInput;
  /** Every match whose first word (its lead, or its first pattern word) is word `i`. */
  matchesAt(
    input: MatchInput,
    i: number,
    mode: "detect" | "select",
  ): PhraseMatch[];
  matchesAt(
    input: MatchInput,
    i: number,
    mode: "saved",
    saved: SavedKeys,
  ): PhraseMatch[];
  /** The longest match whose first word is word `i` (see `longestMatch`). */
  longestAt(
    input: MatchInput,
    i: number,
    mode: "detect" | "select",
  ): PhraseMatch | undefined;
  longestAt(
    input: MatchInput,
    i: number,
    mode: "saved",
    saved: SavedKeys,
  ): PhraseMatch | undefined;
  /**
   * The pattern a selection of words `from` (inclusive) to `to` (exclusive) stands
   * for, in select mode. A match counts when its first-to-last word (gap words
   * included) spans every selected word and at least two of its words (its lead
   * included) are selected (so a one-word selection matches nothing); it may reach past the
   * selection, so the sentence completes a selection that is part of a longer
   * pattern, but a pattern that only part of the selection is in does not stand for
   * it. Wins: the most pattern words, then the earliest start, then the key in
   * code-unit order. Undefined when no match counts.
   */
  matchSelection(
    input: MatchInput,
    from: number,
    to: number,
  ): PhraseMatch | undefined;
  /**
   * A key's words and separators as the language's text has them (`splitKey` with the
   * words its tokenizer reads whole): French "avoir l'air" is "avoir", "l'", "air", as
   * a match's words are.
   */
  keyParts(key: string): KeyParts;
}

const NO_SLOTS: readonly string[] = [];

/** The most words a pronominal verb's match is walked over (its pronoun included). */
const REACH = 12;

/** How many keys' words a matcher keeps (`keyParts`); then it starts over. */
const KEY_CACHE_SIZE = 5_000;

/** Follows a gap pattern's first word in a trie: its next word may come after a gap. */
const GAP = "\u0000";

/**
 * A trie over pattern words. A node is named by the words leading to it, joined by
 * what separates them, a space for most ("make", "make up", "make up one's"; "wh",
 * "wh-what"): as strings in a set, thousands of patterns take a fraction of the
 * memory of node objects. A slot is named by its slot word; a gap pattern's first word
 * is followed by GAP ("figure\0", "figure\0 out").
 */
interface Trie {
  readonly nodes: ReadonlySet<string>;
  /** Node → the keys of the patterns that end there. */
  readonly ends: ReadonlyMap<string, readonly string[]>;
  /** Whether the rules' slot words are slots; otherwise every word is literal. */
  readonly slots: boolean;
  /** The first words of the patterns with a gap. */
  readonly gapStarts: ReadonlySet<string>;
}

/** A pattern's words and what separates them. */
interface TrieWords {
  words: readonly { text: string }[];
  between: readonly string[];
}

/** Patterns of two words or more; `split` gives each key's words (one for a word). */
function buildTrie(
  keys: Iterable<string>,
  rules: PhraseRules,
  hasGap: (key: string) => boolean,
  split: (key: string) => TrieWords,
): Trie {
  const nodes = new Set<string>();
  const ends = new Map<string, string[]>();
  const gapStarts = new Set<string>();
  for (const key of keys) {
    const pattern = split(key);
    if (pattern.words.length < 2) continue;
    const { words, between } = pattern;
    const gap = hasGap(key);
    if (gap) gapStarts.add(words[0]!.text);
    let node = words[0]!.text + (gap ? GAP : "");
    nodes.add(node);
    for (let n = 1; n < words.length; n++) {
      node += between[n - 1]! + words[n]!.text;
      nodes.add(node);
    }
    const keysHere = ends.get(node);
    if (keysHere) keysHere.push(key);
    else ends.set(node, [key]);
  }
  return { nodes, ends, slots: rules.slots.size > 0, gapStarts };
}

const range = (match: PhraseMatch) => match.words.at(-1)! - matchStart(match);

const byKey = (a: PhraseMatch, b: PhraseMatch) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/**
 * The longest of the matches at one word: the most pattern words, then the shorter
 * range (a gap match loses to a contiguous one of the same length), then the key in
 * code-unit order.
 */
export function longestMatch(
  matches: readonly PhraseMatch[],
): PhraseMatch | undefined {
  let best: PhraseMatch | undefined;
  for (const match of matches) {
    if (
      !best ||
      (match.words.length - best.words.length ||
        range(best) - range(match) ||
        byKey(best, match)) > 0
    )
      best = match;
  }
  return best;
}

/**
 * Matches text against a language's phrase patterns. A literal pattern word matches a
 * word whose written form or any base form equals it ("spilled the beans" matches
 * `spill the beans`); a slot matches the words its rules give. Words of a match, and
 * of a gap, are separated only by whitespace, except in a saved key that writes
 * another separator between two of its words ("wh-what", "well, i think"), which
 * matches words separated by that (`separatorKey`). The detect trie is built here, the
 * select trie on first use, and a saved trie once per `SavedKeys` object.
 *
 * With the language's rules:
 * - a pronominal verb (`reflexive`, "darse") matches a form with a reflexive pronoun
 *   attached ("darme", "dándose") and a verb form after a reflexive pronoun, which
 *   joins the match as its `lead` ("me di cuenta"; other pronouns and auxiliaries'
 *   forms may come between: "se ha quitado la vida"). Where a pronominal verb's
 *   pattern matches a form with the pronoun attached, the plain verb's patterns do not
 *   ("darse cuenta de" is `darse cuenta`, not `dar cuenta de`);
 * - a contraction (`contractions`, "del") matches its preposition as a pattern's last
 *   word only ("a través del" is `a través de`).
 */
export function createPhraseMatcher({
  lang,
  rules,
  patterns,
  lemmas,
  accented,
}: PhraseMatcherOptions): PhraseMatcher {
  const gaps = new Set(patterns.gap);
  const hasGap = (key: string) => gaps.has(key);
  /** The words the language's tokenizer reads whole ("d'accord", "peut-être"). */
  const whole = (word: string) => lemmas(word).length > 0;
  const parts = new Map<string, KeyParts>();
  const keyParts = (key: string): KeyParts => {
    let found = parts.get(key);
    if (!found) {
      if (parts.size >= KEY_CACHE_SIZE) parts.clear();
      found = splitKey(key, lang, whole);
      parts.set(key, found);
    }
    return found;
  };
  /** A key's words as text splits them; slot words are slots under `slotRules`. */
  const patternWords = (slotRules: PhraseRules) => (key: string) => {
    const { words, between } = splitKey(key, lang, whole);
    return {
      words: words.map((text) => ({ text, slot: slotRules.slots.has(text) })),
      between,
    };
  };
  const detect = buildTrie(
    patterns.detect,
    NO_RULES,
    () => false,
    patternWords(NO_RULES),
  );
  let select: Trie | undefined;
  const saved = new WeakMap<SavedKeys, Trie>();

  // Prepared for every word of every block: the slots each slot word and filler fills,
  // in the rules' order, looked up once.
  const slotNames = [...rules.slots.keys()];
  const fillerSlots = new Map<string, string[]>();
  for (const [slot, fillers] of rules.slots)
    for (const word of [slot, ...fillers]) {
      const slots = fillerSlots.get(word);
      if (!slots) fillerSlots.set(word, [slot]);
      else if (!slots.includes(slot)) slots.push(slot);
    }

  const slotsFilledBy = (form: string): readonly string[] => {
    const slots = fillerSlots.get(form) ?? NO_SLOTS;
    const possessive = rules.possessiveSlot;
    if (
      possessive === undefined ||
      slots.includes(possessive) ||
      !form.endsWith("'s") ||
      rules.notPossessive?.has(form)
    )
      return slots;
    return slotNames.filter(
      (slot) => slot === possessive || slots.includes(slot),
    );
  };

  const isSlot = (form: string) => rules.slots.has(form);

  /**
   * The trie words a word can stand for: its forms, and with slots, the slots it fills
   * instead of the slot words as literals.
   */
  const stepsOf = (trie: Trie, word: MatchWord): readonly string[] =>
    trie.slots ? word.steps : word.literals;
  const { reflexive, contractions } = rules;

  /** A word's `steps`, prepared once. */
  const slotSteps = (forms: readonly string[], slots: readonly string[]) =>
    slots.length === 0 && !forms.some(isSlot)
      ? forms
      : [...forms.filter((form) => !isSlot(form)), ...slots];

  /** Collects the patterns ending at `node` and below it, matching from word `j`. */
  function walk(
    trie: Trie,
    input: MatchInput,
    node: string,
    j: number,
    path: readonly number[],
    out: PhraseMatch[],
  ) {
    const keys = trie.ends.get(node);
    if (keys) for (const key of keys) out.push({ key, words: path });
    // Stops after the last word. A separator other than a space only goes on to a
    // saved key that writes it ("wh-what"): no dictionary pattern does.
    const separator = input.between[j - 1];
    if (separator === undefined) return;
    const word = input.words[j]!;
    for (const step of stepsOf(trie, word)) {
      const child = node + separator + step;
      if (trie.nodes.has(child))
        walk(trie, input, child, j + 1, [...path, j], out);
    }
    // A contraction ends a pattern as its preposition.
    const preposition = contractions?.get(word.form);
    const ends =
      preposition === undefined
        ? undefined
        : trie.ends.get(node + separator + preposition);
    if (ends) for (const key of ends) out.push({ key, words: [...path, j] });
  }

  /**
   * Matches of pronominal verbs whose pattern writes the reflexive pronoun as a word of
   * its own before the verb (`ReflexiveRules.leading`, French "se rendre compte",
   * "s'en aller"), with word `i` as that pronoun: any reflexive pronoun ("je me suis
   * rendu compte", "tu t'en vas"; "me", "te", "nous", "vous" only with their own
   * subject before them: `ReflexiveRules.subjects`), the auxiliaries' forms right
   * after it and its object pronouns left out ("il s'est rendu compte", "je m'en suis
   * allé"). Or
   * word `i` as the verb of an imperative with the pronoun after it
   * (`ReflexiveRules.after`: "rends-toi compte"). The match's words are in text
   * order, the pronoun among them.
   */
  function pronounWord(
    trie: Trie,
    input: MatchInput,
    i: number,
    out: PhraseMatch[],
  ) {
    const rules = reflexive!;
    const leading = rules.leading!;
    const { words } = input;
    const word = words[i]!;
    /** Walks `order` (word indices) with the pronoun first as the pattern's `lead`. */
    const walkWith = (order: readonly number[], pronoun: number) => {
      const view: MatchInput = {
        words: order.map((k) => words[k]!),
        joined: order.map(() => true),
        // A word left out between two others: a space ("s'en est allé").
        between: order
          .slice(1)
          .map((k, n) =>
            k === order[n]! + 1 ? input.between[order[n]!]! : " ",
          ),
      };
      for (const lead of leading) {
        if (!trie.nodes.has(lead)) continue;
        // The pattern's own separator after its pronoun ("se rendre", "s'attendre").
        const found: PhraseMatch[] = [];
        const first = { ...view, between: [...view.between] };
        first.between[0] = lead.endsWith("'") ? "" : " ";
        walk(trie, first, lead, 1, [0], found);
        for (const match of found)
          out.push({
            key: match.key,
            words: [
              pronoun,
              ...match.words.slice(1).map((n) => order[n]!),
            ].sort((a, b) => a - b),
          });
      }
    };
    // The imperative: "rends-toi compte", the pronoun after the verb and a hyphen.
    const next = words[i + 1];
    if (next && input.between[i] === "-" && rules.after?.has(next.form)) {
      const order = [i + 1, i];
      for (
        let k = i + 2;
        k < words.length && input.joined[k - 1] && order.length < REACH;
        k++
      )
        order.push(k);
      walkWith(order, i + 1);
    }
    if (!rules.pronouns.has(word.form)) return;
    const subjects = rules.subjects?.get(word.form);
    if (subjects) {
      let found = false;
      for (
        let k = i - 1;
        k >= Math.max(0, i - (rules.subjectReach ?? 1)) &&
        input.joined[k] === true &&
        !found;
        k--
      )
        found = subjects.has(words[k]!.form);
      if (!found) return;
    }
    const order = [i];
    let left = 0;
    for (
      let k = i + 1;
      k < words.length && input.joined[k - 1] && order.length < REACH;
      k++
    ) {
      const objectsOnly = order
        .slice(1)
        .every((n) => rules.objects.has(words[n]!.form));
      if (
        objectsOnly &&
        left < rules.maxBetween &&
        words[k]!.bases.some((base) => rules.auxiliaries.has(base))
      ) {
        left++;
        continue;
      }
      order.push(k);
    }
    if (order.length > 1) walkWith(order, i);
  }

  /**
   * Matches of pronominal verbs whose reflexive pronoun is word `i`, written before
   * the verb ("me di cuenta"), with up to `maxBetween` other pronouns or auxiliaries'
   * forms between ("se lo tomó", "se ha quitado").
   */
  function afterPronoun(
    trie: Trie,
    input: MatchInput,
    i: number,
    out: PhraseMatch[],
  ) {
    if (reflexive?.leading !== undefined) {
      pronounWord(trie, input, i, out);
      return;
    }
    if (!reflexive?.pronouns.has(input.words[i]!.form)) return;
    for (let j = i + 1; j <= i + 1 + reflexive.maxBetween; j++) {
      const word = input.words[j];
      if (!word || !input.joined[j - 1]) return;
      // A finite form or a participle: an infinitive or a gerund takes its pronoun
      // attached.
      if (word.reflexive === undefined)
        for (const base of word.bases) {
          if (base === word.form) continue;
          const node = base + reflexive.ending!;
          if (!trie.nodes.has(node)) continue;
          const found: PhraseMatch[] = [];
          walk(trie, input, node, j + 1, [j], found);
          for (const match of found) out.push({ ...match, lead: i });
        }
      const between =
        reflexive.objects.has(word.form) ||
        word.bases.some((base) => reflexive.auxiliaries.has(base));
      if (!between) return;
    }
  }

  function trieFor(mode: MatchMode, keys?: SavedKeys): Trie | undefined {
    if (mode === "detect") return detect;
    if (mode === "select")
      return (select ??= buildTrie(
        new Set([...patterns.detect, ...patterns.more]),
        rules,
        hasGap,
        patternWords(rules),
      ));
    if (!keys) return undefined;
    let trie = saved.get(keys);
    if (!trie) {
      // A saved key's words are split as text is: a phrase saved across punctuation
      // keeps its separators ("wh-what").
      trie = buildTrie(keys.keys(), rules, hasGap, (key) => {
        const { words, between } = splitKey(key, lang, whole);
        return { words: words.map((text) => ({ text })), between };
      });
      saved.set(keys, trie);
    }
    return trie;
  }

  function matchesAt(
    input: MatchInput,
    i: number,
    mode: MatchMode,
    keys?: SavedKeys,
  ): PhraseMatch[] {
    const trie = trieFor(mode, keys);
    const word = input.words[i];
    const out: PhraseMatch[] = [];
    if (!trie || !word || trie.nodes.size === 0) return out;
    /** Each match's first trie word, by its index in `out`. */
    const firsts: string[] = [];
    for (const first of stepsOf(trie, word)) {
      if (trie.nodes.has(first)) walk(trie, input, first, i + 1, [i], out);
      if (trie.gapStarts.has(first))
        // Skip 0 to maxGap words after the first word, each joined by whitespace only.
        for (let skip = 0; skip <= rules.maxGap; skip++) {
          if (skip > 0 && !input.joined[i + skip - 1]) break;
          if (skip > 0 && rules.gapStop?.has(input.words[i + skip]!.form))
            break;
          walk(trie, input, first + GAP, i + 1 + skip, [i], out);
        }
      while (firsts.length < out.length) firsts.push(first);
    }
    // The plain verb's patterns give way to its pronominal verb's ("darse cuenta de").
    const pronominal = word.reflexive;
    if (pronominal !== undefined && firsts.includes(pronominal)) {
      const plain = pronominal.slice(0, -reflexive!.ending!.length);
      const kept = out.filter((_, m) => firsts[m] !== plain);
      out.length = 0;
      out.push(...kept);
    }
    afterPronoun(trie, input, i, out);
    return out;
  }

  const longestAt = (
    input: MatchInput,
    i: number,
    mode: MatchMode,
    keys?: SavedKeys,
  ) => longestMatch(matchesAt(input, i, mode, keys));

  return {
    prepare(tokens, upper = false) {
      const words: MatchWord[] = [];
      const joined: boolean[] = [];
      const between: string[] = [];
      /** The text since the last word. */
      let gap = "";
      for (const token of tokens) {
        if (token.isWord) {
          if (words.length > 0) {
            const separator = separatorKey(gap, words.at(-1)!.form);
            between.push(separator);
            joined.push(separator === " " || separator === "");
          }
          gap = "";
          let form = normalizeWord(token.text);
          let bases = lemmas(token.text);
          const spelt =
            upper && bases.length === 0 ? accented?.(form) : undefined;
          if (spelt !== undefined) {
            form = spelt;
            bases = lemmas(spelt);
          }
          // Most words are their only base form, or unknown.
          const forms =
            bases.length === 0
              ? [form]
              : bases.length === 1 && bases[0] === form
                ? bases
                : [...new Set([form, ...bases])];
          const verb = reflexive?.attached?.(form, bases, lemmas);
          const pronominal =
            verb === undefined ? undefined : verb + reflexive!.ending!;
          const literals =
            pronominal === undefined || forms.includes(pronominal)
              ? forms
              : [...forms, pronominal];
          const slots = slotsFilledBy(form);
          words.push({
            token,
            form,
            bases,
            forms,
            ...(pronominal !== undefined && { reflexive: pronominal }),
            literals,
            slots,
            steps: slotSteps(literals, slots),
          });
        } else {
          gap += token.text;
        }
      }
      if (words.length > 0) joined.push(false);
      return { words, joined, between };
    },
    matchesAt,
    longestAt,
    keyParts,
    matchSelection(input, from, to) {
      const selected = (i: number) => i >= from && i < to;
      let best: PhraseMatch | undefined;
      for (let i = 0; i <= from; i++)
        for (const match of matchesAt(input, i, "select")) {
          if (match.words.at(-1)! < to - 1) continue;
          const own = match.words.filter(selected).length;
          if (
            own + (match.lead !== undefined && selected(match.lead) ? 1 : 0) <
            2
          )
            continue;
          if (
            !best ||
            (match.words.length - best.words.length ||
              matchStart(best) - matchStart(match) ||
              byKey(best, match)) > 0
          )
            best = match;
        }
      return best;
    },
  };
}
