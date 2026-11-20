import {
  casingChanges,
  documentCasing,
  textCasing,
  type BlockCasing,
} from "../../core/text/casing";
import type { Lookup } from "../lookup/lookup";
import type { TextBlock } from "./page-text";

/** The page's casing (rule D), taken from what each block says about it. */
export function createPageCasing(o: {
  lang: string;
  lookup: Pick<Lookup, "casing" | "setCasing" | "setDocument">;
}) {
  /** What each block says about the page's casing. */
  const blockCasings = new WeakMap<TextBlock, BlockCasing>();
  function casingOf(block: TextBlock) {
    let found = blockCasings.get(block);
    if (!found) {
      found = textCasing(block.text, o.lang);
      blockCasings.set(block, found);
    }
    return found;
  }

  return {
    /**
     * Takes the page's casing from these blocks (its main content as it is now: menus
     * and Title Case links outside it say nothing about names). Returns which blocks
     * have a word whose verdict changed, or undefined when none can have.
     */
    update(
      blocks: readonly TextBlock[],
    ): ((block: TextBlock) => boolean) | undefined {
      const before = o.lookup.casing;
      const after = documentCasing(blocks.map(casingOf));
      o.lookup.setCasing(after);
      // The same blocks are the text an abbreviation's card reads its expansion from.
      o.lookup.setDocument(() => blocks.map((block) => block.text).join("\n"));
      if (!before) return undefined;
      const changed = casingChanges(before, after);
      if (changed !== "all" && changed.size === 0) return undefined;
      const keys = changed === "all" ? undefined : [...changed];
      return (block) =>
        keys === undefined || keys.some((key) => casingOf(block).keys.has(key));
    },
  };
}
