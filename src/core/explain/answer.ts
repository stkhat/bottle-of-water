/**
 * The model's answer: its JSON schema and how it is checked (architecture "Meaning in
 * context" → "Answer"). Browser-free.
 */

export interface Answer {
  /** Short, like a hover line, in the native language. */
  meaning: string;
  /** The number (from 1) of the dictionary meaning that fits, or none. */
  sense: number | null;
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

/** Longest `meaning` kept (in UTF-16 code units). */
export const MAX_MEANING = 200;

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
 * dropped. Text that is not a JSON object, or has no meaning, is bad.
 */
export function checkAnswer(json: string, senses: number): Checked {
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
  return { ok: true, answer: { meaning, sense } };
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
    (a.sense === null || isSense(a.sense, Infinity))
  );
}
