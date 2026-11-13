// Parts of speech of EJDict's senses → public/packs/en-ja/pos.json, so the extension
// can show the senses of a word's tagged part of speech first (rule A2) without reading
// Japanese glosses itself. EJDict has no labels; they come from, in order:
// - a pointer's grammar ("seeの過去" → verb, "boxの複数形" → noun) [Japanese glosses]
// - the source's own markers: 〈C〉/〈U〉 (countable / uncountable: a noun), {形} {名}
//   {動} {副} {間投} [EJDict]
// - notes that name a part of speech (《疑問代名詞》, 《補語にのみ用いて》 → adjective,
//   《複数形で》 → noun); a sense that is only such a note heads the senses after it
//   [Japanese glosses]
// - the gloss's main item: "…を" / "〈人〉に" or a verb ending → verb, a leading "…" →
//   preposition, な / い / の → adjective, に / く / て / と → adverb, a kanji or
//   katakana ending → noun, as a guess that also fits an adverb (今, 現在)
//   [Japanese glosses]
// - gap filling: an unlabelled run between two senses of the same part of speech
//   takes it (dictionaries group senses by part of speech) [any source]
// A label is only one of the word's parts of speech in en/pos.json (or the nearest).
// Words with one part of speech are left out: the extension labels their senses
// with it. EJDict's phrases are labelled the same way, with their patterns' parts of
// speech in Wiktionary (en/phrases.json) when they have several. Run after ejdict.ts,
// kaikki.ts and phrases.ts.
// Usage: node scripts/data/sense-pos.ts
import { join } from "node:path";
import {
  encodeSenseLabels,
  LABELLED_POS,
  type SenseLabel,
} from "../../src/core/lexicon/sense-labels.ts";
import { japaneseForm } from "../../src/core/lexicon/short-lines.ts";
import type { DictPack, PosPack } from "../../src/core/packs/types.ts";
import { decodePhrasePos } from "../../src/core/phrases/phrase-pos.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import { PACKS_DIR, readDictPacks, readPack, writePack } from "./common.ts";
import { senseLabelOf } from "./senses.ts";

/** Text outside any bracket pair, without 『』 marks: what a gloss's ending is read from. */
function outside(sense: string, open = "《〈(（[{", close = "》〉)）]}") {
  let out = "";
  let depth = 0;
  for (const ch of sense) {
    if (open.includes(ch)) depth++;
    else if (close.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch !== "『" && ch !== "』") out += ch;
  }
  return out;
}

/** A label the word cannot have goes to its nearest part of speech it has (形容詞 for "what": determiner). */
const NEAR: Readonly<Record<string, readonly string[]>> = {
  adjective: ["determiner"],
  determiner: ["adjective"],
  adverb: ["particle"],
  preposition: ["particle", "conjunction"],
};

/** EJDict's markers at the start of a sense. */
const MARKERS: Readonly<Record<string, string>> = {
  形: "adjective",
  名: "noun",
  動: "verb",
  副: "adverb",
  間投: "interjection",
  前: "preposition",
  接: "conjunction",
  代: "pronoun",
};

/** A sense's first item: the text before its first separator outside brackets. */
function firstItem(sense: string) {
  let depth = 0;
  for (let i = 0; i < sense.length; i++) {
    const ch = sense[i]!;
    if ("《〈(（[{".includes(ch)) depth++;
    else if ("》〉)）]}".includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && i > 0 && ";；・".includes(ch))
      return sense.slice(0, i);
  }
  return sense;
}

/**
 * [EJDict] A part of speech from the source's own markers: {形} and the like at the
 * start, 〈C〉/〈U〉 in the first item (a later item may be a noun sense merged into a
 * verb's: "見える,姿を見せる…・〈U〉見せること").
 */
function marker(sense: string, candidates: readonly string[]) {
  const found = /^\{(形|名|動|副|間投|前|接|代)\}/.exec(sense.trim());
  if (found) return MARKERS[found[1]!];
  if (/〈[CU]〉/.test(firstItem(sense)) && candidates.includes("noun"))
    return "noun";
  return undefined;
}

/** [EJDict] 『』 around a Japanese gloss marks a core translation. */
const isCore = (sense: string) =>
  /『[^』]*[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}][^』]*』/u.test(sense);

/** [Japanese] Notes in 《》 that name a part of speech. */
const NOTES: readonly (readonly [RegExp, string])[] = [
  [/^(?:疑問|関係|指示|人称|不定|再帰|所有|複合)?代名詞$/, "pronoun"],
  [/^(?:疑問|関係|指示|不定)?形容詞$/, "adjective"],
  [/^(?:疑問|関係|接続)?副詞$/, "adverb"],
  [/^(?:従位|等位)?接続詞$/, "conjunction"],
  [/^前置詞$/, "preposition"],
  [/^間投詞$/, "interjection"],
  [/^(?:補語にのみ用いて|名詞の前にのみ用いて)$/, "adjective"],
  [/^(?:複数形で|単数扱い|複数扱い|集合的に|単数形で)$/, "noun"],
];

const VERB_ENDING = /(する|る|う|く|す|つ|む|ぶ|ぐ|ぬ)$/;

interface Inferred {
  pos: string;
  weak?: boolean;
  /** The sense is only a note naming the part of speech of the senses after it. */
  header?: boolean;
}

/** [Japanese] A part of speech read from the gloss: its notes, then its main item's ending. */
export function inferPos(
  sense: string,
  candidates: readonly string[],
): Inferred | undefined {
  const has = (pos: string) => candidates.includes(pos);
  for (const [, note] of sense.matchAll(/《([^《》]*)》/g))
    for (const [pattern, pos] of NOTES)
      if (pattern.test(note!))
        return {
          pos,
          header: outside(sense).replace(/[\s,、;…]/g, "") === "",
        };
  // The main item: the gloss up to its first separator.
  const items = outside(sense)
    .replace(/^[\s,、;・]+/, "")
    .split(/[,、;；・]/)
    .map((item) => item.trim());
  const gloss = items[0]!;
  // "…く" is an adjective's adverb as well as a verb's ending: the items after it
  // tell ("『速く』,急速に").
  if (
    has("adverb") &&
    gloss.endsWith("く") &&
    items.slice(1).some((item) => /(に|と)$/.test(item))
  )
    return { pos: "adverb" };
  // "…を含んで": a participle used as a preposition.
  if (gloss.startsWith("…") && has("preposition") && !VERB_ENDING.test(gloss))
    return { pos: "preposition" };
  if (
    has("verb") &&
    (/…を|〉を|〉に/.test(gloss) ||
      (VERB_ENDING.test(gloss) && !gloss.startsWith("…の")))
  )
    return { pos: "verb" };
  // A gloss that starts with the object's placeholder: …の中に, …に似た. Any other
  // gloss with a placeholder is a pattern whose ending says nothing ("何も…ない").
  if (gloss.includes("…")) {
    if (!gloss.startsWith("…")) return undefined;
    if (has("preposition")) return { pos: "preposition" };
    if (has("conjunction") && /^…(する|した|である|であろう)/.test(gloss))
      return { pos: "conjunction" };
    return undefined;
  }
  if (has("adjective") && /(的な|な|い|の)$/.test(gloss))
    return { pos: "adjective" };
  if (has("adverb") && /(に|く|て|と)$/.test(gloss)) return { pos: "adverb" };
  // A noun gloss (罰金, 衰弱, 張りつめること); Sino-Japanese nouns also work as adverbs.
  if (has("noun") && /([一-鿿゠-ヿー]|こと|もの|人)$/.test(gloss))
    return { pos: "noun", weak: true };
  return undefined;
}

/** [Japanese] The part of speech of a form a pointer names: "過去" → verb, "複数形" → noun. */
function formPos(grammar: string, candidates: readonly string[]) {
  if (/比較級|最上級/.test(grammar))
    return candidates.includes("adjective") ? "adjective" : "adverb";
  if (/複数/.test(grammar) && !/過去|現在|人称/.test(grammar)) return "noun";
  if (/過去|分詞|三人称|現在|直説法|仮定法/.test(grammar)) return "verb";
  return undefined;
}

/** Labels for the senses of one word with these parts of speech (en/pos.json). */
export function labelSenses(
  senses: readonly string[],
  candidates: readonly string[],
): SenseLabel[] {
  const fit = (pos: string) =>
    candidates.includes(pos)
      ? pos
      : ((NEAR[pos] ?? []).find((near) => candidates.includes(near)) ?? pos);
  let header: string | undefined;
  /** Senses that name another word's form: they do not fill gaps ("seeの過去" is not "saw"). */
  const forms = new Set<number>();
  const labels = senses.map((sense, i): SenseLabel => {
    const core = isCore(sense) ? { core: true as const } : {};
    const form = japaneseForm(sense);
    if (form) {
      forms.add(i);
      const fromRest =
        form.rest === "" ? undefined : inferPos(form.rest, candidates);
      const pos = fromRest?.pos ?? formPos(form.grammar, candidates);
      return pos === undefined ? core : { pos: fit(pos), ...core };
    }
    const marked = marker(sense, candidates);
    if (marked) return { pos: marked, ...core };
    const inferred = inferPos(sense, candidates);
    if (inferred?.header) {
      header = fit(inferred.pos);
      return { pos: header, ...core };
    }
    if (inferred && !inferred.weak) return { pos: fit(inferred.pos), ...core };
    if (header) return { pos: header, ...core };
    return inferred ? { pos: fit(inferred.pos), posBy: "weak", ...core } : core;
  });
  // Gap filling.
  labels.forEach((label, i) => {
    if (label.pos) return;
    let before = i - 1;
    let after = i + 1;
    while (before >= 0 && !labels[before]!.pos) before--;
    while (after < labels.length && !labels[after]!.pos) after++;
    const pos = forms.has(before) ? undefined : labels[before]?.pos;
    if (pos !== undefined && pos === labels[after]?.pos) {
      label.pos = pos;
      label.posBy = "gap";
    }
  });
  // Only parts of speech the pack's code can write.
  return labels.map((label) =>
    label.pos !== undefined && !LABELLED_POS.has(label.pos)
      ? { ...(label.core && { core: true as const }) }
      : label,
  );
}

/**
 * en-ja/pos.json: the labels of every word with several parts of speech that gets one,
 * and of every phrase whose pattern has several (`phrasePos`, as sense labels name
 * them).
 */
export function sensePos(
  dict: DictPack,
  pos: PosPack,
  phrasePos: (key: string) => readonly string[] = () => [],
) {
  const out: Record<string, string> = {};
  let senses = 0;
  let labelled = 0;
  for (const [key, [, texts]] of Object.entries(dict)) {
    const candidates = key.includes(" ")
      ? phrasePos(key)
      : Object.hasOwn(pos, key)
        ? pos[key]!
        : [];
    if (candidates.length < 2) continue;
    const labels = labelSenses(texts, candidates);
    senses += labels.length;
    labelled += labels.filter((label) => label.pos).length;
    if (labels.some((label) => label.pos || label.core))
      out[key] = encodeSenseLabels(labels);
  }
  return { labels: out, senses, labelled };
}

function main() {
  const dict = readDictPacks<DictPack[string]>(join(PACKS_DIR, "en-ja"));
  const patterns = readPack<PhrasePatterns>("en/phrases.json");
  const phrases = new Map<string, string[]>();
  for (const list of ["detect", "more"] as const) {
    const codes = patterns.pos?.[list].split(" ") ?? [];
    patterns[list].forEach((key, i) =>
      phrases.set(key, decodePhrasePos(codes[i] ?? "-")),
    );
  }
  const { labels, senses, labelled } = sensePos(
    dict,
    readPack<PosPack>("en/pos.json"),
    (key) => [
      ...new Set(
        (phrases.get(key) ?? []).flatMap((pos) => senseLabelOf(pos).pos ?? []),
      ),
    ],
  );
  writePack("en-ja/pos.json", labels);
  console.log(
    `en-ja/pos.json: ${Object.keys(labels).length} words and phrases with several parts of speech; ` +
      `${labelled} of their ${senses} senses labelled (${((labelled / senses) * 100).toFixed(1)}%)`,
  );
}

if (import.meta.main) main();
