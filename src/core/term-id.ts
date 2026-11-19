import type { TermKind } from "./classify";
import { wordsOfKey } from "./phrases/key";

/** A term's id: its language and key ("en:figure out"). */
export const termId = (lang: string, key: string) => `${lang}:${key}`;

/**
 * A key of several words is a phrase, whatever separates them ("figure out",
 * "wh-what", "well, i think").
 */
export const kindOfKey = (key: string): TermKind =>
  /\s/.test(key) || wordsOfKey(key).length > 1 ? "phrase" : "word";
