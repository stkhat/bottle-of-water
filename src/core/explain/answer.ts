/**
 * The model's answer: its JSON schema and how it is checked (architecture "Meaning in
 * context" → "Answer"). Browser-free.
 */

export interface Answer {
  /** Short, like a hover line, in the native language. */
  meaning: string;
  /** The number (from 1) of the dictionary meaning that fits, or none. */
  sense: number | null;
  /**
   * Selected words only: the expression the model takes them to be part of, in
   * dictionary form ("make up one's mind"); "" when none. Checked against the sentence
   * before it is offered (`phrases/correct.ts`).
   */
  phrase?: string;
}

/**
 * The answer's JSON schema, its fields in the order the model writes them. There is
 * no explanation: the model's were wrong a quarter of the time and rarely needed
 * (notes "When to show an explanation").
 */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    meaning: { type: "string" },
    sense: { type: ["integer", "null"] },
  },
  required: ["meaning", "sense"],
  additionalProperties: false,
} as const;

/**
 * The schema for words the user selected: the phrase after the rest, which the model
 * answers as for any term (notes "Correcting a selected phrase": asked first, it was
 * proposed less often and less accurately).
 */
export const PHRASE_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    meaning: { type: "string" },
    sense: { type: ["integer", "null"] },
    phrase: { type: "string" },
  },
  required: ["meaning", "sense", "phrase"],
  additionalProperties: false,
} as const;

/** The schema for a term: with the phrase for words the user selected. */
export const answerSchema = (selected: boolean) =>
  selected ? PHRASE_ANSWER_SCHEMA : ANSWER_SCHEMA;

/** Longest `meaning` kept (in UTF-16 code units). */
export const MAX_MEANING = 200;

/** Longest `phrase` kept; a longer one is no phrase. */
export const MAX_PHRASE = 100;

/** Why an answer is asked again: it is not JSON, or it has no meaning. */
export type BadAnswer = "notJson" | "noMeaning";

export type Checked =
  { ok: true; answer: Answer } | { ok: false; why: BadAnswer };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const isSense = (value: unknown, senses: number) =>
  Number.isInteger(value) &&
  (value as number) >= 1 &&
  (value as number) <= senses;

/**
 * The answer in `json` for a prompt that listed `senses` dictionary meanings: a
 * `sense` that is not one of them becomes null, and fields outside the schema are
 * dropped. Text that is not a JSON object, or has no meaning, is bad. `selected`: the
 * schema asked for the phrase; one over `MAX_PHRASE` is none ("").
 */
export function checkAnswer(
  json: string,
  senses: number,
  selected = false,
): Checked {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, why: "notJson" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { ok: false, why: "notJson" };
  const a = value as Record<string, unknown>;
  const meaning = text(a.meaning).slice(0, MAX_MEANING);
  if (meaning === "") return { ok: false, why: "noMeaning" };
  const sense = isSense(a.sense, senses) ? (a.sense as number) : null;
  if (!selected) return { ok: true, answer: { meaning, sense } };
  const phrase = text(a.phrase);
  return {
    ok: true,
    answer: {
      meaning,
      sense,
      phrase: phrase.length > MAX_PHRASE ? "" : phrase,
    },
  };
}

/**
 * An answer as it was kept (the cache's rows, a message from a content script). Rows
 * kept before the explanation was dropped carry more fields; only these are read.
 */
export function isAnswer(value: unknown): value is Answer {
  const a = (value ?? {}) as Record<string, unknown>;
  return (
    typeof a.meaning === "string" &&
    a.meaning.trim() !== "" &&
    a.meaning.length <= MAX_MEANING &&
    (a.sense === null || isSense(a.sense, Infinity)) &&
    (a.phrase === undefined ||
      (typeof a.phrase === "string" && a.phrase.length <= MAX_PHRASE))
  );
}
