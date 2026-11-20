// A learning language's frequency lists (architecture.md "Vocabulary and frequency" →
// "Two frequency lists"): what people say (a subtitle list, which every learning
// language has) and, when the language's build names one, what people write (a list of
// written text: Wikipedia, news). A subtitle list ranks greetings and other spoken
// words as speech does but written-register words and cognates low (Spanish
// "producir", "década"); a written list the other way round ("hola" 7,936th). With
// both, a form ranks by the better of its two ranks, so neither register's words are
// pushed down by the other's (2026-11-21, user decision; Spanish only so far).

/** A learning language's frequency lists: each its forms in rank order, each once. */
export interface FrequencyLists {
  /** What people say: a subtitle list. */
  spoken: readonly string[];
  /** What people write, when the language's build names a written-text list. */
  text?: readonly string[];
}

/**
 * Lists' forms (each list in rank order) in one strict order, by each form's better
 * rank: a form's rank in a list is its first position there (1 first), none where the
 * list lacks it. Forms are ordered by their best rank, then by their next-best (of two
 * forms one list ranks equally, the one the other list ranks higher first, and one
 * both lists have before one only one list has), then by the list that gives the best
 * rank, the earlier list first. That is a strict order: two forms cannot share both
 * their best rank and the list that gives it, as a list holds each position once.
 */
export function betterRank(lists: readonly (readonly string[])[]) {
  const ranks = new Map<string, number[]>();
  lists.forEach((list, which) => {
    list.forEach((form, i) => {
      let found = ranks.get(form);
      if (!found) ranks.set(form, (found = lists.map(() => Infinity)));
      found[which] = Math.min(found[which]!, i + 1);
    });
  });
  const keyed = [...ranks].map(([form, byList]) => {
    const sorted = [...byList].sort((a, b) => a - b);
    return { form, sorted, list: byList.indexOf(sorted[0]!) };
  });
  keyed.sort((a, b) => {
    for (let i = 0; i < a.sorted.length; i++)
      if (a.sorted[i] !== b.sorted[i])
        return a.sorted[i]! < b.sorted[i]! ? -1 : 1;
    return a.list - b.list;
  });
  return keyed.map(({ form }) => form);
}

/**
 * The forms a learning pack is built from (`buildLearningPacks`' `forms`), in rank
 * order: the spoken list's, or with a written-text list both lists' forms by their
 * better rank (`betterRank`). Every form either list has reaches the vocabulary and the
 * lemma table, as a form of the spoken list does.
 */
export const learningForms = ({ spoken, text }: FrequencyLists) =>
  text ? betterRank([spoken, text]) : [...spoken];
