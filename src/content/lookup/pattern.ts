import type { send } from "../../messaging/client";
import { warn } from "./warn";

/**
 * The pattern selected words stand for, and where its words are in the text: from its
 * first word to its last, gap included. The text may complete the selection ("made up"
 * → "made up her mind").
 */
export interface PatternMatch {
  key: string;
  start: number;
  end: number;
}

/** The pattern the words at `start`–`end` of `text` stand for; undefined when none matches or on failure. */
export function matchPattern(
  sendRequest: typeof send,
  lang: string,
  text: string,
  start: number,
  end: number,
): Promise<PatternMatch | undefined> {
  return sendRequest({ type: "matchSelection", lang, text, start, end }).then(
    (match) =>
      match.key !== undefined &&
      match.start !== undefined &&
      match.end !== undefined
        ? { key: match.key, start: match.start, end: match.end }
        : undefined,
    (error: unknown) => {
      warn(error);
      return undefined;
    },
  );
}
