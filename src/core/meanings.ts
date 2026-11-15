/**
 * "Your meanings": the meaning the user ties to a sentence a term was met in
 * (architecture "Meaning in context" → "Your meanings: data"). Browser-free.
 */

/** Where a meaning came from: a dictionary sense, or the on-device AI's answer. */
export type MeaningFrom = "dictionary" | "ai";

/** A meaning as it is chosen and stored. */
export interface Meaning {
  from: MeaningFrom;
  /**
   * A dictionary sense as the pack has it (an English definition stays English, with
   * `glossLang`); an AI meaning as the model answered, in the native language.
   */
  text: string;
  /** Language of `text` when it is not the native language (an English definition). */
  glossLang?: string;
  /** A dictionary sense's part of speech, as the pack has it. */
  pos?: string;
  /** An AI meaning's one-sentence explanation. */
  explanation?: string;
}

/** Base64url without padding. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A meaning's key: SHA-256 of (term id, where it came from, its text), base64url. The
 * same meaning made on two devices, or imported, has the same key.
 */
export async function meaningKey(
  termId: string,
  from: MeaningFrom,
  text: string,
): Promise<string> {
  // JSON keeps the three parts apart whatever characters they hold.
  const data = new TextEncoder().encode(JSON.stringify([termId, from, text]));
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

/**
 * The index of the sense a stored dictionary meaning is among `senses`, matched by part
 * of speech and the pack's text: never by index (a pack update may reorder the senses)
 * or translation (it may differ between devices). -1 when no sense matches.
 */
export function matchSense(
  meaning: { pos?: string; text: string },
  senses: readonly { pos?: string; text: string }[],
): number {
  return senses.findIndex(
    (sense) => sense.text === meaning.text && sense.pos === meaning.pos,
  );
}

/**
 * Meanings in the order they show wherever several do: the one chosen for this
 * sentence first, then the one with the most choices, then the most recently chosen.
 */
export function orderMeanings<
  T extends { key: string; count: number; lastAt: number },
>(meanings: readonly T[], chosenHere?: string): T[] {
  return [...meanings].sort(
    (a, b) =>
      Number(b.key === chosenHere) - Number(a.key === chosenHere) ||
      b.count - a.count ||
      b.lastAt - a.lastAt,
  );
}
