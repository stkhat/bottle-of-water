// How much of Langle is written per language, for the tidy-up cycle (references/tidy.md).
//
//   npx jiti .claude/skills/language-cycle/scripts/rule-inventory.ts [--repo=<checkout>] \
//     [--out=<file.json>] [--before=<earlier inventory.json>]
//
// The languages are the lock's (src/core/packs/packs.lock.json `pairs`: learning languages
// and their natives). Counted in src/ and scripts/data/ (tests left out):
// - branches: code comparing a value with a language code (`lang === "zh"`, `case "ja":`,
//   `["ja", "zh"].includes(…)`), each with file:line. A branch is a rule hidden from the
//   per-language tables; a tidy-up moves it into one or makes it general.
// - tables: objects keyed by language code (`  ja: { … }` with the closing brace at the same
//   indent), e.g. NATIVE_LANGUAGES, RECIPES. Per table: entries, fields per entry, and per
//   field which languages set it. Fields set to the same value by ≥ 3 entries are
//   default candidates; fields only one language sets are one-off rules to review.
// - files named for a language (`tagging/de.ts`, `scripts/data/es-kaikki.ts`), with lines.
// - docs: lines of docs/notes/*-quality.md and of docs/specs/architecture.md.
// - study scripts: script basenames found in two or more study folders under
//   data/raw/quality/ (main checkout; a folder's top level and one level down, leaving
//   out copies of the repo in proto/, corpus/, runs/ …), candidates to promote into a
//   skill.
// With --before, prints what grew or shrank since that inventory.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  qualityRoot,
  repo,
  setting,
  shortSha,
} from "../../real-content-quality/scripts/common.ts";

const REPO = repo();
const lock = JSON.parse(
  readFileSync(join(REPO, "src/core/packs/packs.lock.json"), "utf8"),
) as { pairs: Record<string, string[]> };
const CODES = [
  ...new Set([...Object.keys(lock.pairs), ...Object.values(lock.pairs).flat()]),
].sort();
const CODE = CODES.join("|");

function walk(dir: string, keep: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let isDir: boolean;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue; // a broken link
    }
    if (isDir) {
      if (name !== "node_modules" && name !== "fixtures")
        out.push(...walk(path, keep));
    } else if (keep(path)) out.push(path);
  }
  return out;
}
const lines = (path: string) => readFileSync(path, "utf8").split("\n");

const sources = ["src", "scripts/data"].flatMap((d) =>
  walk(
    join(REPO, d),
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f),
  ),
);

// Branches on a language code: a value whose name says it is a language (lang, native,
// learning, language, lang_code …) compared with a code. Words that are also codes
// ("de", "it", "id") are compared as words elsewhere, so the name is required.
const LANG_VALUE = String.raw`[\w.]*(?:lang|native|learning|language)\w*\)?`;
const BRANCH = new RegExp(
  String.raw`\b${LANG_VALUE}\s*(?:===?|!==?)\s*"(${CODE})"|"(${CODE})"\s*(?:===?|!==?)\s*${LANG_VALUE}|case\s+"(${CODE})"\s*:|\[\s*"(${CODE})"(?:\s*,\s*"(?:${CODE})")*\s*\]\s*\.includes\(\s*${LANG_VALUE}`,
  "i",
);
const branches: { at: string; code: string; text: string }[] = [];
// Tables keyed by language code.
interface Table {
  file: string;
  line: number;
  entries: Record<string, Record<string, string>>;
}
const tables: Table[] = [];
const ENTRY = new RegExp(String.raw`^(\s+)"?(${CODE})"?: \{\s*$`);
for (const file of sources) {
  const text = lines(file);
  const rel = relative(REPO, file);
  let table: Table | undefined;
  let tableIndent = "";
  for (let i = 0; i < text.length; i++) {
    const line = text[i]!;
    if (/^\s*(\/\/|\*)/.test(line)) continue;
    const b = BRANCH.exec(line);
    if (b)
      branches.push({
        at: `${rel}:${i + 1}`,
        code: b.slice(1).find(Boolean)!,
        text: line.trim().slice(0, 100),
      });
    const e = ENTRY.exec(line);
    if (!e) continue;
    const [, indent, code] = e as unknown as [string, string, string];
    // A new table unless this entry follows the last entry's closing brace (comments and
    // blank lines between them allowed) at the same indent.
    let k = i - 1;
    while (k >= 0 && /^\s*(\/\/|\*|\/\*|$)/.test(text[k]!)) k--;
    if (!table || indent !== tableIndent || text[k] !== `${indent}},`) {
      tables.push((table = { file: rel, line: i + 1, entries: {} }));
      tableIndent = indent;
    }
    const fields: Record<string, string> = {};
    const fieldIndent = `${indent}  `;
    let j = i + 1;
    for (; j < text.length && !text[j]!.startsWith(`${indent}}`); j++) {
      const f = new RegExp(String.raw`^${fieldIndent}(\w+)\??:\s*(.*)$`).exec(text[j]!);
      if (f) fields[f[1]!] = f[2]!.replace(/,$/, "");
    }
    table.entries[code] = fields;
    i = j;
  }
}
const byStart = tables.filter((t) => Object.keys(t.entries).length >= 2);
const tableReport = byStart.map((t) => {
  const fieldLangs: Record<string, string[]> = {};
  const values: Record<string, Record<string, string[]>> = {};
  for (const [code, fields] of Object.entries(t.entries))
    for (const [field, value] of Object.entries(fields)) {
      (fieldLangs[field] ??= []).push(code);
      ((values[field] ??= {})[value] ??= []).push(code);
    }
  const entries = Object.keys(t.entries).length;
  return {
    at: `${t.file}:${t.line}`,
    entries,
    fields: Object.keys(fieldLangs).length,
    fieldsPerEntry: +(
      Object.values(t.entries).reduce((n, f) => n + Object.keys(f).length, 0) / entries
    ).toFixed(1),
    oneOff: Object.entries(fieldLangs)
      .filter(([, langs]) => langs.length === 1 && entries >= 3)
      .map(([field, [code]]) => `${field} (${code})`),
    sameValue: Object.entries(values).flatMap(([field, byValue]) =>
      Object.entries(byValue)
        .filter(([v, langs]) => langs.length >= 3 && v.length < 60)
        .map(([v, langs]) => `${field} = ${v} (${langs.join(" ")})`),
    ),
  };
});

// Files named for a language.
const FILE = new RegExp(String.raw`^(${CODE})([-.]|$)`);
const langFiles = sources
  .filter((f) => FILE.test(basename(f)))
  .map((f) => ({ file: relative(REPO, f), lines: lines(f).length }));

// Docs.
const notesDir = join(REPO, "docs/notes");
const docs = {
  qualityNotes: Object.fromEntries(
    readdirSync(notesDir)
      .filter((f) => f.endsWith("-quality.md"))
      .map((f) => [f, lines(join(notesDir, f)).length]),
  ),
  architecture: lines(join(REPO, "docs/specs/architecture.md")).length,
  status: lines(join(REPO, "docs/status.md")).length,
};

// Study scripts repeated across study folders.
const scriptFolders: Record<string, string[]> = {};
try {
  const root = qualityRoot();
  for (const study of readdirSync(root)) {
    if (study === "cycles" || !statSync(join(root, study)).isDirectory()) continue;
    for (const f of walk(join(root, study), (p) => /\.(py|ts|mjs|sh)$/.test(p))) {
      const inside = relative(join(root, study), f).split("/");
      if (
        inside.length <= 2 &&
        !/^(corpus|runs|packets|proto|packs-.*|grab)$/.test(inside[0]!) &&
        !/\.test\.ts$/.test(f)
      )
        (scriptFolders[basename(f)] ??= []).push(study);
    }
  }
} catch {
  // no study data on this machine
}
const repeatedScripts = Object.fromEntries(
  Object.entries(scriptFolders)
    .map(([name, folders]) => [name, [...new Set(folders)]] as const)
    .filter(([, folders]) => folders.length >= 2)
    .sort((a, b) => b[1].length - a[1].length),
);

const branchCount: Record<string, number> = {};
for (const b of branches) branchCount[b.code] = (branchCount[b.code] ?? 0) + 1;
const inventory = {
  sha: shortSha(REPO),
  date: new Date().toISOString().slice(0, 10),
  languages: CODES,
  totals: {
    branches: branches.length,
    tables: tableReport.length,
    tableFields: tableReport.reduce((n, t) => n + t.fields, 0),
    oneOffFields: tableReport.reduce((n, t) => n + t.oneOff.length, 0),
    sameValueFields: tableReport.reduce((n, t) => n + t.sameValue.length, 0),
    languageFiles: langFiles.length,
    languageFileLines: langFiles.reduce((n, f) => n + f.lines, 0),
    qualityNoteLines: Object.values(docs.qualityNotes).reduce((a, b) => a + b, 0),
    repeatedStudyScripts: Object.keys(repeatedScripts).length,
  },
  branchesByLanguage: branchCount,
  branches,
  tables: tableReport,
  languageFiles: langFiles,
  docs,
  repeatedScripts,
};

const out = setting("out");
if (out) writeFileSync(out, JSON.stringify(inventory, null, 1));
console.log(`inventory ${inventory.sha} ${inventory.date}`);
console.log(JSON.stringify(inventory.totals));
const before = setting("before");
if (before) {
  const prev = JSON.parse(readFileSync(before, "utf8")) as typeof inventory;
  const growth = Object.entries(inventory.totals).map(([k, v]) => {
    const was = (prev.totals as Record<string, number>)[k] ?? 0;
    return `${k}: ${was} → ${v}${was ? ` (${(((v - was) / was) * 100).toFixed(0)}%)` : ""}`;
  });
  console.log(`since ${prev.sha} ${prev.date}:\n  ${growth.join("\n  ")}`);
}
if (!out) {
  for (const t of tableReport)
    console.log(
      `${t.at}: ${t.entries} entries, ${t.fields} fields; one-off ${t.oneOff.length}; same value ${t.sameValue.length}`,
    );
  console.log(`branches:\n  ${branches.map((b) => `${b.at} ${b.text}`).join("\n  ")}`);
}
