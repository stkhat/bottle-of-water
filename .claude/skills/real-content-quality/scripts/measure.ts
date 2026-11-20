// units.jsonl → what one checkout shows on them: summary.json (per site) and rows.jsonl
// (one row per word token and per phrase highlight).
//
//   npx jiti .claude/skills/real-content-quality/scripts/measure.ts \
//     [--repo=<checkout>] [--units=<a.jsonl>,<b.jsonl>] [--out=<dir>] [--level=3000] \
//     [--learning=en] [--native=ja] [--cap=50]
//
// (or REPO, UNITS, OUT, LEVEL, LEARNING, NATIVE, CAP, STUDY in the environment).
// A transcript's cards are classified as the extension does: the cards whose sentence
// runs on together (`cardRuns`, in batches of 50); --runs=off classifies each alone.
// Defaults: REPO = this checkout; OUT = <study>/runs/<REPO's short sha>-L<level>;
// UNITS = <OUT>/units.jsonl. For before → after, run it once per checkout on the same
// units (built once, by either) and compare the summaries; ab-packets.py diffs the rows.
//
// Wiring as the extension does it (src/background/language-resources.ts; the reference
// is src/core/classify.smoke.test.ts): the pack, classifier and dictionary of the pair
// from createLanguageResources; each document's casing from blockCasing/documentCasing
// over its units (rule D names); unsaved words at the known level; hover lines from
// dictionary.entry(key, written, pos).lines, and a contraction's note (`note`: "I'm → I am",
// describe.ts `contractionNote`). What it cannot reproduce: a meaning that
// exists only as an English definition is machine-translated at display time (the row
// has the English line and hoverKind "translated"), a phrase with no entry gets a
// literal translation ("literal"), and whatever depends on the live site.
//
// Summary per site: word tokens; unknown (not in the vocabulary: no hover) and their
// share; words shown as New, phrase highlights, per 1,000 tokens; names; words with no
// entry; hovers translated at display; hover lines wider than CAP; video cards with no
// native line; load/build times and classify ms per 1,000 tokens.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  readJsonl,
  repo,
  setting,
  shortSha,
  studyDir,
  type Unit,
} from "./common.ts";

type Resources =
  typeof import("../../../../src/background/language-resources.ts");
type PackLoad = typeof import("../../../../src/core/packs/load.ts");
type PackFormats = typeof import("../../../../src/core/packs/formats.ts");
type DataFormats = typeof import("../../../../scripts/data/formats.ts");
type Casing = typeof import("../../../../src/core/text/casing.ts");
type ShortLines = typeof import("../../../../src/core/lexicon/short-lines.ts");
type Span = import("../../../../src/core/classify.ts").Span;
type Runs = typeof import("../../../../src/core/subtitles/runs.ts");
type Written = import("../../../../src/core/lexicon/dictionary.ts").Written;
type DocumentCasing =
  import("../../../../src/core/text/casing.ts").DocumentCasing;

const REPO = repo();
const LEVEL = Number(setting("level", "3000"));
const LEARNING = setting("learning", "en")!;
const NATIVE = setting("native", "ja")!;
const CAP = Number(setting("cap", "50"));
const OUT =
  setting("out") ?? join(studyDir(), "runs", `${shortSha(REPO)}-L${LEVEL}`);
const UNITS = (setting("units") ?? join(OUT, "units.jsonl")).split(",");

const { createLanguageResources } = (await import(
  `${REPO}/src/background/language-resources.ts`
)) as Resources;
const { createPackLoader } = (await import(
  `${REPO}/src/core/packs/load.ts`
)) as PackLoad;
const { DICTIONARY_PACKS, LANGUAGE_PACKS } = (await import(
  `${REPO}/src/core/packs/formats.ts`
)) as PackFormats;
const { packSourcePath } = (await import(
  `${REPO}/scripts/data/formats.ts`
)) as DataFormats;
const { blockCasing, documentCasing } = (await import(
  `${REPO}/src/core/text/casing.ts`
)) as Casing;
const { displayWidth } = (await import(
  `${REPO}/src/core/lexicon/short-lines.ts`
)) as ShortLines;

// A checkout that classifies a transcript's cards as the text they run on in
// (`cardRuns`, R4-asr) is measured so; RUNS=off measures each card alone.
const runsModule = (await import(`${REPO}/src/core/subtitles/runs.ts`).catch(
  () => undefined,
)) as Runs | undefined;
const RUNS = runsModule !== undefined && setting("runs", "on") === "on";
/** Cards per analysis request (content/video/session.ts, BATCH). */
const BATCH = 50;

const { readFile } = await import("node:fs/promises");
const loadPack = createPackLoader(async (path) =>
  JSON.parse(await readFile(packSourcePath(path), "utf8")),
);
const resources = createLanguageResources(loadPack);
const pairPacks = (
  (DICTIONARY_PACKS as Record<string, readonly string[]>)[
    `${LEARNING}-${NATIVE}`
  ] ?? []
).filter((p) => !(LANGUAGE_PACKS as readonly string[]).includes(p));

let t0 = performance.now();
await loadPack(LEARNING as "en");
const tLearning = performance.now() - t0;
t0 = performance.now();
const pack = await resources.pack(LEARNING);
const classifier = await resources.classifier(LEARNING);
// Build the tries now, so that classify times leave them out.
pack.matcher.prepare(pack.tokenize("warm up"));
const tBuild = performance.now() - t0;
t0 = performance.now();
const dictionary = await resources.dictionary(LEARNING, NATIVE);
const dictFiles = await Promise.all(
  pairPacks.map(
    async (name) =>
      [name, (await loadPack(name as "en-ja")) as object] as const,
  ),
);
const tDictionary = performance.now() - t0;

/** The pack file a key's meaning is in ("en-ja/dict", "en-defs/defs"), roughly. */
function meaningFrom(key: string): string | undefined {
  for (const [name, files] of dictFiles)
    for (const [file, data] of Object.entries(files))
      if (
        file !== "sensePos" &&
        data &&
        typeof data === "object" &&
        Object.hasOwn(data, key)
      )
        return `${name}/${file}`;
  return undefined;
}

/** How the page says a word was written (content/lookup/lookup.ts, `written`). */
function writtenOf(
  span: Span,
  surface: string,
  casing: DocumentCasing,
): Written | undefined {
  if (span.kind !== "word") return undefined;
  if (span.capital) return /\p{Ll}/u.test(surface) ? "capital" : "upper";
  return casing.mode === "mixed" && /^\p{Ll}/u.test(surface)
    ? "lower"
    : undefined;
}

type HoverKind = "dict" | "translated" | "literal" | "none";
/**
 * The hover card's lines for a term, as far as they can be known offline. A meaning
 * translated at display has the English text that is translated (`hover`) and the
 * lines the card shows while it is not translated (`fallback`).
 */
function hoverOf(
  key: string,
  kind: "word" | "phrase",
  written?: Written,
  pos?: string,
  surface?: string,
  clitic?: string,
): {
  hover: string[];
  hoverKind: HoverKind;
  fallback?: string[];
  note?: string;
} {
  const entry = dictionary.entry(key, written, pos, clitic);
  // A contraction's note (content/lookup/describe.ts, `contractionNote`): its entry's,
  // or, keyed by another word ("it's" by "it"), what the pack says it is short for.
  const form = surface?.toLowerCase().replaceAll("’", "'");
  const expansions =
    form !== undefined && form !== key && "expansions" in pack
      ? (pack as { expansions(word: string): readonly string[] })
          .expansions(form)
          // What the clitic stands for here, when the sentence decides (K4; before it,
          // `clitic` is never set): those expansions alone (handlers.ts).
          .filter(
            (one, _, all) =>
              clitic === undefined ||
              !all.some((e) => e.split(" ").at(-1)?.toLowerCase() === clitic) ||
              one.split(" ").at(-1)?.toLowerCase() === clitic,
          )
      : [];
  const note =
    (entry as { expansion?: string } | undefined)?.expansion ??
    (expansions.length > 0 ? expansions.slice(0, 2).join(" / ") : undefined);
  const noted = <T extends object>(h: T) =>
    note === undefined || kind !== "word" ? h : { ...h, note };
  if (!entry)
    return kind === "phrase"
      ? { hover: [], hoverKind: "literal" }
      : { hover: [], hoverKind: "none" };
  if (entry.glossLang !== undefined && entry.glossLang !== NATIVE)
    return noted({
      hover: [entry.short],
      hoverKind: "translated" as const,
      fallback: entry.lines,
    });
  return noted({ hover: entry.lines, hoverKind: "dict" as const });
}

const units: Unit[] = UNITS.flatMap((path) => readJsonl<Unit>(path));
const byDoc = new Map<string, Unit[]>();
for (const u of units) {
  const list = byDoc.get(u.doc) ?? [];
  list.push(u);
  byDoc.set(u.doc, list);
}

interface SiteCounts {
  units: number;
  tokens: number;
  unknown: number;
  newWords: number;
  known: number;
  names: number;
  phrases: number;
  noEntry: number;
  translated: number;
  overCap: number;
  cards: number;
  cardsNoNative: number;
}
const sites: Record<string, SiteCounts> = {};
const emptyCounts = (): SiteCounts => ({
  units: 0,
  tokens: 0,
  unknown: 0,
  newWords: 0,
  known: 0,
  names: 0,
  phrases: 0,
  noEntry: 0,
  translated: 0,
  overCap: 0,
  cards: 0,
  cardsNoNative: 0,
});
const sentences = new Intl.Segmenter(LEARNING, { granularity: "sentence" });
const rows: string[] = [];
let classifyMs = 0;

for (const [doc, list] of byDoc) {
  const casing = documentCasing(
    list.map((u) => blockCasing(pack.tokenize(u.text), LEARNING)),
  );
  const options = {
    terms: new Map(),
    knownLevel: LEVEL,
    casing,
    capitalMeaning: (key: string) => dictionary.capitalMeaning(key),
    outline: (key: string) => dictionary.outline(key),
  };
  /** Phrases as one match each: the parts of a phrase with a gap together. */
  const matchesOf = (spans: readonly Span[]) => {
    const open = new Map<string, { parts: Span[] }>();
    const matches: { parts: Span[] }[] = [];
    for (const s of spans) {
      if (s.kind !== "phrase") continue;
      if (!s.part || s.part.index === 0) {
        const match = { parts: [s] };
        matches.push(match);
        if (s.part) open.set(s.key, match);
      } else open.get(s.key)?.parts.push(s);
    }
    return matches;
  };
  /** With runs: each card's spans, and the phrases that start in it (offsets in the card). */
  const cardSpans = new Map<number, Span[]>();
  const cardPhrases = new Map<
    number,
    { parts: Span[]; surface: string; sentence?: string }[]
  >();
  if (RUNS && runsModule && list[0]!.site !== "article") {
    const texts = list.map((u) => u.text);
    for (let from = 0; from < list.length; from += BATCH) {
      const batch = texts.slice(from, from + BATCH).map((_, k) => from + k);
      for (const run of runsModule.cardRuns(texts, batch)) {
        const runTokens = pack.tokenize(run.text);
        const t1 = performance.now();
        const spans = classifier.classify(runTokens, {
          ...options,
          breaks: run.breaks,
        });
        classifyMs += performance.now() - t1;
        for (const [card, found] of runsModule.splitRun(run, texts, spans))
          cardSpans.set(card, found);
        for (const { parts } of matchesOf(spans)) {
          const first = parts[0]!;
          const last = parts.at(-1)!;
          const at = run.cards.findLast((c) => c.at <= first.start)!;
          if (!run.asked.has(at.card)) continue;
          const shift = (s: Span) => ({
            ...s,
            start: s.start - at.at,
            end: s.end - at.at,
          });
          const across = run.cards.filter(
            (c) => c.at < last.end && c.at + texts[c.card]!.length > first.start,
          );
          const found = cardPhrases.get(at.card) ?? [];
          found.push({
            parts: parts.map(shift),
            surface: parts
              .map((p) => run.text.slice(p.start, p.end))
              .join(" … "),
            ...(across.length > 1 && {
              sentence: across.map((c) => texts[c.card]).join(" | "),
            }),
          });
          cardPhrases.set(at.card, found);
        }
      }
    }
  }
  for (const [index, u] of list.entries()) {
    const site = (sites[u.site] ??= emptyCounts());
    site.units++;
    if (u.site !== "article") {
      site.cards++;
      if (!(u.native ?? u.ja)) site.cardsNoNative++;
    }
    const tokens = pack.tokenize(u.text);
    site.tokens += tokens.filter((t) => t.isWord).length;
    const joined = cardSpans.size > 0;
    const t1 = performance.now();
    const spans = joined
      ? (cardSpans.get(index) ?? [])
      : classifier.classify(tokens, options);
    if (!joined) classifyMs += performance.now() - t1;
    const bounds = [...sentences.segment(u.text)].map((s) => ({
      start: s.index,
      end: s.index + s.segment.length,
      text: s.segment.trim(),
    }));
    const sentenceAt = (i: number) =>
      bounds.find((b) => i >= b.start && i < b.end)?.text ?? u.text;
    const emit = (row: Record<string, unknown>) =>
      rows.push(
        JSON.stringify({
          doc,
          site: u.site,
          unit: u.i,
          ...row,
          sentence:
            (row.across as string | undefined) ??
            sentenceAt(row.start as number),
        }),
      );
    const withHover = (h: { hover: string[]; hoverKind: HoverKind }) => {
      if (h.hoverKind === "translated") site.translated++;
      if (h.hoverKind === "dict")
        site.overCap += h.hover.filter((l) => displayWidth(l) > CAP).length;
      return h;
    };

    // Phrases: one row per match, the parts of a phrase with a gap joined by " … ";
    // with runs, a phrase across cards in the card it starts in, its sentence the
    // cards it is in (" | " between them).
    const phrases = joined
      ? (cardPhrases.get(index) ?? [])
      : matchesOf(spans).map(({ parts }) => ({
          parts,
          surface: parts.map((p) => u.text.slice(p.start, p.end)).join(" … "),
          sentence: undefined as string | undefined,
        }));
    for (const { parts, surface, sentence } of phrases) {
      const first = parts[0]!;
      const last = parts.at(-1)!;
      site.phrases++;
      emit({
        start: first.start,
        end: last.end,
        surface,
        key: first.key,
        kind: "phrase",
        category: first.category,
        verdict: first.category,
        ...(first.pos && { pos: first.pos }),
        ...withHover(hoverOf(first.key, "phrase", undefined, first.pos)),
        from: meaningFrom(first.key) ?? null,
        ...(sentence !== undefined && { across: sentence }),
      });
    }

    for (const s of spans) {
      if (s.kind !== "word") continue;
      const surface = u.text.slice(s.start, s.end);
      let verdict: string = s.category;
      if (s.name) {
        verdict = "name";
        site.names++;
      } else if (s.category === "ignored") {
        if (/\p{N}/u.test(surface) || [...surface].length === 1) continue;
        verdict = "unknown";
        site.unknown++;
      } else if (s.category === "new") site.newWords++;
      else if (s.category === "known") site.known++;
      const shown = verdict !== "name" && verdict !== "unknown";
      const written = writtenOf(s, surface, casing);
      const h = shown
        ? withHover(
            hoverOf(
              s.key,
              "word",
              written,
              s.pos,
              surface,
              (s as { clitic?: string }).clitic,
            ),
          )
        : { hover: [], hoverKind: "none" as const };
      if (shown && h.hoverKind === "none") site.noEntry++;
      const rank = pack.rank(s.key);
      emit({
        start: s.start,
        end: s.end,
        surface,
        key: s.key,
        kind: "word",
        category: s.category,
        verdict,
        ...(s.capital && { capital: true }),
        ...(written && { written }),
        ...(s.pos && { pos: s.pos }),
        ...((s as { clitic?: string }).clitic && {
          clitic: (s as { clitic?: string }).clitic,
        }),
        ...(Number.isFinite(rank) && { rank }),
        ...h,
        from: shown ? (meaningFrom(s.key) ?? null) : null,
      });
    }
  }
}

const total = Object.values(sites).reduce((a, b) => {
  for (const k of Object.keys(b) as (keyof SiteCounts)[]) a[k] += b[k];
  return a;
}, emptyCounts());
const per1k = (n: number, s: SiteCounts) => +((1000 * n) / s.tokens).toFixed(1);
const report = (s: SiteCounts) => ({
  units: s.units,
  tokens: s.tokens,
  unknown: s.unknown,
  unknownPct: +((100 * s.unknown) / s.tokens).toFixed(2),
  newPer1k: per1k(s.newWords, s),
  phrasesPer1k: per1k(s.phrases, s),
  phrases: s.phrases,
  names: s.names,
  noEntry: s.noEntry,
  translatedAtDisplay: s.translated,
  linesOverCap: s.overCap,
  cards: s.cards,
  cardsNoNative: s.cardsNoNative,
});
const summary = {
  repo: REPO,
  units: UNITS,
  pair: `${LEARNING}-${NATIVE}`,
  level: LEVEL,
  cap: CAP,
  all: report(total),
  ...Object.fromEntries(Object.entries(sites).map(([k, v]) => [k, report(v)])),
  msPer1k: +((classifyMs / total.tokens) * 1000).toFixed(2),
  loadMs: {
    learning: Math.round(tLearning),
    dictionary: Math.round(tDictionary),
    build: Math.round(tBuild),
  },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "rows.jsonl"), rows.join("\n") + "\n");
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
