/**
 * The prompt that asks for a term's meaning in its sentence (architecture "Meaning in
 * context" → "Context" and "Answer"), as the M0 study tuned it: English instructions,
 * the answer in the native language, one example with an explanation and one without.
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
 * The two example answers in the native language: "bank" by a river (an explanation,
 * `unusual` true) and "boats" (none). English for a language without its own.
 */
const EXAMPLES: Readonly<Record<string, { bank: string; boat: string }>> = {
  ja: {
    bank: '{"meaning":"川岸、土手","unusual":true,"explanation":"ここでは川のそばの土地のこと。お金を預ける銀行ではありません。","sense":2}',
    boat: "船、ボート",
  },
  es: {
    bank: '{"meaning":"orilla (de un río)","unusual":true,"explanation":"Aquí es el terreno junto al río, no la entidad que guarda dinero.","sense":2}',
    boat: "barco, bote",
  },
  pt: {
    bank: '{"meaning":"margem (de um rio)","unusual":true,"explanation":"Aqui é o terreno ao lado do rio, não a instituição que guarda dinheiro.","sense":2}',
    boat: "barco",
  },
  en: {
    bank: '{"meaning":"riverbank","unusual":true,"explanation":"Here it is the land beside the river, not a place that keeps money.","sense":2}',
    boat: "boat",
  },
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
    `- "meaning": what the term means in this sentence, written in ${N}, short like a dictionary line (at most ${meaningLength(native)} characters). Do not just copy the ${L} term.`,
    `- "unusual": true only when the term is used here in a way the meaning line alone does not make clear (an idiom, slang, a figurative or unusual sense); false for an ordinary use of a word, which is most of the time.`,
    `- "explanation": when "unusual" is true and you are sure, one short sentence in ${N} on this use; otherwise null. Never guess, and do not describe grammar.`,
    `- "sense": the number of the dictionary meaning that fits this sentence, or null when none of them fits or there is no list.`,
    `Write "meaning" and "explanation" in ${N} only, never in ${others} or any other language.`,
    `Example for "bank" in "We sat on the [[bank]] and watched the boats." with meanings 1. [noun] a place that keeps money 2. [noun] the land beside a river: ${example.bank}`,
    `Example for "boats" in "We sat on the bank and watched the [[boats]]." with meanings 1. [noun] a small ship 2. [verb] to travel in a boat: {"meaning":"${example.boat}","unusual":false,"explanation":null,"sense":1}`,
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
