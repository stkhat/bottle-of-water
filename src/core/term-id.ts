import type { TermKind } from "./classify";

/** A term's id: its language and key ("en:figure out"). */
export const termId = (lang: string, key: string) => `${lang}:${key}`;

/** A key of several words is a phrase. */
export const kindOfKey = (key: string): TermKind =>
  key.includes(" ") ? "phrase" : "word";
