/**
 * English clitics by their written shape: the tagger splits these words as the treebank
 * does, and the data build reads a contraction's expansions by them
 * (scripts/data/contractions.ts).
 *
 * The data scripts import this file under plain Node: it has no imports.
 */

/** Contractions the treebank writes as two tokens: "do" "n't", "I" "'m". */
export const CONTRACTION = /^(.+?)(n't|'s|'re|'ll|'ve|'d|'m)$/i;

/** Spoken forms the treebank writes as a verb and "to": "gon" "na", "wan" "na", "got" "ta". */
export const VERB_TO = /^(gon|wan|got)(na|ta)$/i;
