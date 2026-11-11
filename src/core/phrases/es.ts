import type { PhraseRules } from "./pattern";

/**
 * Spanish slots, each filled only by itself until Spanish has rules of its own
 * (clitics: "me di cuenta" → `darse cuenta`). No gaps.
 */
export const SPANISH_RULES: PhraseRules = {
  slots: new Map([
    ["alguien", new Set<string>()],
    ["algo", new Set<string>()],
  ]),
  maxGap: 0,
};
