/**
 * The prompt that asks for a term's meaning in its sentence (architecture "Meaning in
 * context" → "Context" and "Answer"), as the M0 study tuned it: English instructions,
 * the answer in the native language, two examples (a dictionary meaning, an idiom).
 * Browser-free.
 */
import type { TermKind } from "../classify";
import type { LanguagePair } from "../packs/pairs";

/** Where the term is in its sentence: [start, end), one per part of a phrase with a gap. */
export interface Mark {
  start: number;
  end: number;
}

/** A dictionary meaning as the pack has it (an English definition stays English). */
interface PackSense {
  pos?: string;
  text: string;
}

/** Everything one prompt is made of. */
export interface ExplainInput extends LanguagePair {
  /** The video's or page's title. */
  title?: string;
  /** The term as written there (the whole phrase, gap included). */
  written: string;
  /** Its dictionary key: the base form, or a phrase's base forms. */
  base: string;
  kind: TermKind;
  /** The sentence the term was met in, learning language only. */
  sentence: string;
  /** Where the term is in `sentence`. */
  marks: readonly Mark[];
  /** The entry's senses in the pack's order, numbered from 1; none without an entry. */
  senses: readonly PackSense[];
  /** Whole lines before the sentence, the nearest last. */
  before: readonly string[];
  /** Whole lines after the sentence, the nearest first. */
  after: readonly string[];
}

const NAMES = new Intl.DisplayNames(["en"], { type: "language" });

/** A language's English name: "ja" → "Japanese". */
const nameOf = (lang: string) => NAMES.of(lang) ?? lang;

/** Native languages written without spaces get a shorter meaning line. */
const DENSE = new Set(["ja", "zh", "ko"]);

/** The hover line's length: about 25 characters in Japanese, 40 in Latin scripts. */
export const meaningLength = (native: string) => (DENSE.has(native) ? 25 : 40);

/**
 * The two example answers' meanings in the native language: "bank" by a river (one of
 * several dictionary meanings) and "spilled the beans" (an idiom without an entry).
 * English for a language without its own.
 */
const EXAMPLES: Readonly<Record<string, { bank: string; beans: string }>> = {
  ja: { bank: "川岸、土手", beans: "秘密をばらす" },
  es: { bank: "orilla (de un río)", beans: "revelar el secreto" },
  pt: { bank: "margem (de um rio)", beans: "revelar o segredo" },
  en: { bank: "riverbank", beans: "revealed the secret" },
};

/**
 * The instructions, the same for every prompt of a pair: the provider gives them
 * first (a system prompt), so one base session can be cloned per term.
 */
export function instructions({ learning, native }: LanguagePair): string {
  const L = nameOf(learning);
  const N = nameOf(native);
  const example = EXAMPLES[native] ?? EXAMPLES.en!;
  const others = ["Chinese", L].filter((name) => name !== N).join(", ");
  return [
    `You help ${/^[AEIOU]/.test(N) ? "an" : "a"} ${N} speaker who is learning ${L}. They met a term in ${L} in a text and want to know what it means in that sentence.`,
    `You get the term, the sentence it is in (the term is marked with [[ ]]), lines around it, and sometimes the dictionary's numbered meanings.`,
    `Answer with JSON only:`,
    `- "meaning": what the marked term itself means in this sentence, written in ${N}, short like a dictionary line (at most ${meaningLength(native)} characters). Translate only the marked words: leave out the words around them (subject, object, "not", "can't", other words of the sentence). Do not just copy the ${L} term.`,
    `- "sense": the number of the dictionary meaning that fits this sentence, or null when none of them fits or there is no list.`,
    `Write "meaning" in ${N} only, never in ${others} or any other language.`,
    `Example for "bank" in "We sat on the [[bank]] and watched the boats." with meanings 1. [noun] a place that keeps money 2. [noun] the land beside a river: ${JSON.stringify({ meaning: example.bank, sense: 2 })}`,
    `Example for "spilled the beans" in "After two drinks he [[spilled the beans]] about the party." with no dictionary meanings: ${JSON.stringify({ meaning: example.beans, sense: null })}`,
  ].join("\n");
}

/** The sentence with each part of the term in [[ ]]. */
export function marked(sentence: string, marks: readonly Mark[]): string {
  let out = "";
  let at = 0;
  for (const { start, end } of [...marks].sort((a, b) => a.start - b.start)) {
    if (start < at || end <= start || end > sentence.length) continue;
    out += `${sentence.slice(at, start)}[[${sentence.slice(start, end)}]]`;
    at = end;
  }
  return out + sentence.slice(at);
}

/** Everything but the lines around the sentence. */
function head(x: ExplainInput): string {
  const parts: string[] = [];
  if (x.title) parts.push(`Source: ${x.title}`);
  const base =
    x.base.toLowerCase() === x.written.toLowerCase()
      ? ""
      : ` (base form: ${x.base})`;
  parts.push(`Term: "${x.written}"${base}, a ${x.kind}`);
  parts.push(
    x.senses.length > 0
      ? "Dictionary meanings:\n" +
          x.senses
            .map((s, i) => `${i + 1}. ${s.pos ? `[${s.pos}] ` : ""}${s.text}`)
            .join("\n")
      : "Dictionary meanings: none (answer sense: null)",
  );
  parts.push(`Sentence: ${marked(x.sentence, x.marks)}`);
  return parts.join("\n");
}

/** A line around the sentence: which side, and how far (1 = next to it). */
interface Around {
  text: string;
  side: "before" | "after";
  distance: number;
}

/**
 * The lines around the sentence in the order they are taken: alternately before and
 * after, the one before first, nearest first. Dropping from the end drops the
 * farthest.
 */
export function alternate(x: Pick<ExplainInput, "before" | "after">): Around[] {
  const out: Around[] = [];
  const n = Math.max(x.before.length, x.after.length);
  for (let distance = 1; distance <= n; distance++) {
    const before = x.before[x.before.length - distance];
    if (before !== undefined)
      out.push({ text: before, side: "before", distance });
    const after = x.after[distance - 1];
    if (after !== undefined) out.push({ text: after, side: "after", distance });
  }
  return out;
}

/** The prompt with the `lines` nearest lines around the sentence, in text order. */
export function buildPrompt(x: ExplainInput, lines: number): string {
  const taken = alternate(x).slice(0, lines);
  const text = head(x);
  if (taken.length === 0) return text;
  const before = taken
    .filter((l) => l.side === "before")
    .sort((a, b) => b.distance - a.distance);
  const after = taken
    .filter((l) => l.side === "after")
    .sort((a, b) => a.distance - b.distance);
  return [
    text,
    "Text around it (the sentence is marked >>>):",
    ...before.map((l) => l.text),
    `>>> ${marked(x.sentence, x.marks)}`,
    ...after.map((l) => l.text),
  ].join("\n");
}
