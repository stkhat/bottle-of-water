// The pages of a Wiktionary edition's bot imports Langle cannot use
// (`UNDOCUMENTED_IMPORTS`: undocumented, or from a source of unknown license), which
// every build reading the edition leaves out, read from Wikimedia's MediaWiki
// history dump of the edition (docs/specs/architecture.md "Native meanings and the
// quality gate").
import { join } from "node:path";
import { RAW_DIR } from "../common.ts";
import { UNDOCUMENTED_IMPORTS } from "./recipes.ts";

/** Columns of Wikimedia's MediaWiki history dump (its TSV schema). */
const HISTORY = {
  entity: 2,
  comment: 5,
  user: 9,
  title: 29,
  namespace: 31,
  parent: 61,
} as const;

/**
 * The pages `user` created in the main namespace with the edit summary `comment` (none
 * by default), by a file of an edition's MediaWiki history dump (bzip2: read through
 * `bzcat`).
 */
async function createdUndocumented(
  path: string,
  user: string,
  comment = "",
): Promise<Set<string>> {
  const { spawn } = await import("node:child_process");
  const { createInterface } = await import("node:readline");
  // Only the lines that name the user are parsed (grep is far faster than a line loop
  // over a wiki's whole history: the Thai edition's is 280 MB compressed).
  const child = spawn(
    "sh",
    ["-c", 'bzcat "$1" | grep -F -- "$2"; true', "sh", path, user],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const pages = new Set<string>();
  for await (const line of createInterface({ input: child.stdout })) {
    const cells = line.split("\t");
    if (
      cells[HISTORY.user] === user &&
      cells[HISTORY.entity] === "revision" &&
      cells[HISTORY.namespace] === "0" &&
      cells[HISTORY.parent] === "0" &&
      cells[HISTORY.comment] === comment
    )
      pages.add(cells[HISTORY.title]!.replaceAll("_", " "));
  }
  return pages;
}

/** Each edition's pages, read once per raw folder. */
const read = new Map<string, Promise<ReadonlySet<string>>>();

/**
 * The page titles of an edition's unusable bot imports (`UNDOCUMENTED_IMPORTS`;
 * none for an edition that lists none): an entry whose `word` is one of them is not
 * read.
 */
export function undocumentedPages(
  edition: string,
  rawDir = RAW_DIR,
): Promise<ReadonlySet<string>> {
  const imports = UNDOCUMENTED_IMPORTS[edition];
  if (!imports) return Promise.resolve(new Set());
  const id = `${edition}\n${rawDir}`;
  let found = read.get(id);
  if (!found) {
    found = Promise.all(
      imports.files.map((file) =>
        createdUndocumented(
          join(rawDir, "mediawiki-history", file),
          imports.user,
          imports.comment,
        ),
      ),
    ).then((sets) => new Set(sets.flatMap((set) => [...set])));
    read.set(id, found);
  }
  return found;
}
