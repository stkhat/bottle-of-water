/**
 * The model's answer: its JSON schema and how it is checked (architecture "Meaning in
 * context" → "Answer"). Browser-free.
 */

export interface Answer {
  /** Short, like a hover line, in the native language. */
  meaning: string;
  /** The term is used in a way the meaning alone does not make clear. */
  unusual: boolean;
  /** One short sentence, only when `unusual`. */
  explanation: string | null;
  /** The number (from 1) of the dictionary meaning that fits, or none. */
  sense: number | null;
}

/** The answer's JSON schema, its fields in the order the model writes them. */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    meaning: { type: "string" },
    unusual: { type: "boolean" },
    explanation: { type: ["string", "null"] },
    sense: { type: ["integer", "null"] },
  },
  required: ["meaning", "unusual", "explanation", "sense"],
  additionalProperties: false,
} as const;

/** Longest `meaning` and `explanation` kept (in UTF-16 code units). */
export const MAX_MEANING = 200;
export const MAX_EXPLANATION = 1000;

/** Why an answer is asked again: it is not JSON, or it has no meaning. */
export type BadAnswer = "notJson" | "noMeaning";

export type Checked =
  { ok: true; answer: Answer } | { ok: false; why: BadAnswer };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * The answer in `json` for a prompt that listed `senses` dictionary meanings: a
 * `sense` that is not one of them becomes null, and the explanation is dropped unless
 * the term is `unusual`. Text that is not a JSON object, or has no meaning, is bad.
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
  const unusual = a.unusual === true;
  const explanation = unusual
    ? text(a.explanation).slice(0, MAX_EXPLANATION) || null
    : null;
  const sense =
    Number.isInteger(a.sense) &&
    (a.sense as number) >= 1 &&
    (a.sense as number) <= senses
      ? (a.sense as number)
      : null;
  return { ok: true, answer: { meaning, unusual, explanation, sense } };
}

/** An answer as it was kept (the cache's rows, a message from a content script). */
export function isAnswer(value: unknown): value is Answer {
  const a = (value ?? {}) as Record<string, unknown>;
  return (
    typeof a.meaning === "string" &&
    a.meaning.trim() !== "" &&
    a.meaning.length <= MAX_MEANING &&
    typeof a.unusual === "boolean" &&
    (a.explanation === null ||
      (typeof a.explanation === "string" &&
        a.explanation.length <= MAX_EXPLANATION)) &&
    (a.sense === null ||
      (Number.isInteger(a.sense) && (a.sense as number) >= 1))
  );
}
