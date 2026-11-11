/**
 * The page's main content: the article's title and body, without menus, sidebars,
 * footers and links to other stories.
 */
import type { TextBlock } from "./page-text";

export interface MainContent {
  /** The block belongs to the title or the body. */
  contains(block: TextBlock): boolean;
  /** The last block of the main content, in document order. */
  readonly last: TextBlock | undefined;
}

/** Elements that are never the body, whatever they hold. */
const BOILERPLATE_TAGS =
  "nav, aside, footer, [role=navigation], [role=complementary], [role=contentinfo]";

/** Words in a class or id that mark related stories, sharing, ads, references and the like. */
const BOILERPLATE_WORDS = new Set([
  "related",
  "recommend",
  "recommended",
  "recommendation",
  "recommendations",
  "share",
  "sharing",
  "social",
  "comment",
  "comments",
  "newsletter",
  "promo",
  "promoted",
  "sponsor",
  "sponsored",
  "sidebar",
  "breadcrumb",
  "breadcrumbs",
  "popular",
  "trending",
  "tags",
  "ad",
  "ads",
  "advert",
  "advertisement",
  "outbrain",
  "taboola",
  "references",
  "reflist",
  "footnotes",
  "citations",
  "bibliography",
]);

/** Pairs of words in a class or id that mark the same ("more-stories", "readMore"). */
const BOILERPLATE_PAIRS = new Set(["more stories", "read more", "most read"]);

/**
 * Blocks that never read as prose: list items, table cells, headings and captions
 * (reference lists and story lists are made of them; paragraphs make a body).
 */
const NOT_PROSE =
  "li, dt, dd, td, th, h1, h2, h3, h4, h5, h6, figcaption, caption";
/** A block reads as prose with this much text outside links … */
const PROSE_CHARS = 25;
/** … and less than this share of its text in links. */
const PROSE_LINK_DENSITY = 0.5;
/** A block with at least this share of its text in links is left out of the body. */
const LINK_BLOCK_DENSITY = 0.6;
/**
 * While the body is looked for, a class or id hint counts only on an element with
 * less than this share of the page's prose, so a wrapper such as
 * `<div class="has-sidebar">` does not drop the body. Inside the body's container, it
 * counts on any element that does not hold the best-scored element.
 */
const HINT_SHARE = 0.5;

/** Score shares of a prose block's parent, grandparent and great-grandparent. */
const ANCESTOR_SHARES = [1, 1 / 2, 1 / 3];

const linkText = (block: TextBlock) =>
  block.pieces.reduce(
    (n, p) =>
      p.node.parentElement?.closest("a[href]") ? n + p.node.data.length : n,
    0,
  );

const words = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function hasBoilerplateHint(element: Element): boolean {
  const list = words(`${element.getAttribute("class") ?? ""} ${element.id}`);
  return list.some(
    (w, i) =>
      BOILERPLATE_WORDS.has(w) ||
      (i > 0 && BOILERPLATE_PAIRS.has(`${list[i - 1]} ${w}`)),
  );
}

const normalize = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

interface Measured {
  block: TextBlock;
  /** Text outside links. */
  plain: number;
  density: number;
  prose: boolean;
}

function measure(block: TextBlock): Measured {
  const length = block.text.trim().length;
  const links = linkText(block);
  const density = length === 0 ? 0 : links / length;
  const plain = Math.max(0, length - links);
  return {
    block,
    plain,
    density,
    prose:
      plain >= PROSE_CHARS &&
      density < PROSE_LINK_DENSITY &&
      !block.element.matches(NOT_PROSE),
  };
}

/**
 * Finds the main content among `blocks` (the blocks of `root`, in document order):
 * - The body's container: prose blocks (paragraph-like: not list items, table cells,
 *   headings or captions) score their parent (fully), grandparent
 *   (1/2) and great-grandparent (1/3) by their text outside links; the best-scored
 *   element, widened to its nearest `article`, `main` or `[role=main]`.
 * - Left out of it: `nav`, `aside`, `footer` and their roles; elements whose class or
 *   id names related stories, sharing, comments, ads, references and the like (unless
 *   they hold the best-scored element); blocks mostly made of links.
 * - The title: the container's first `h1`, else an `h1` that `title` (the page's
 *   title) contains; it counts even outside the container.
 * When no block reads as prose, every block counts.
 */
export function findMainContent(
  root: Element,
  blocks: readonly TextBlock[],
  title: string = document.title,
): MainContent {
  const measured = blocks.map(measure);
  const prose = measured.filter((m) => m.prose);
  if (prose.length === 0) return everything(blocks);

  const proseIn = new Map<Element, number>();
  const proseOf = (element: Element) => {
    let n = proseIn.get(element);
    if (n === undefined) {
      n = prose.reduce(
        (sum, m) => (element.contains(m.block.element) ? sum + m.plain : sum),
        0,
      );
      proseIn.set(element, n);
    }
    return n;
  };

  /**
   * An element from `element` up to (not including) `top` is boilerplate: a
   * boilerplate tag, or a class or id hint on an element `spared` does not keep.
   */
  const underBoilerplate = (
    element: Element,
    top: Element,
    spared: (el: Element) => boolean,
  ) => {
    for (
      let el: Element | null = element;
      el && el !== top;
      el = el.parentElement
    )
      if (
        el.matches(BOILERPLATE_TAGS) ||
        (hasBoilerplateHint(el) && !spared(el))
      )
        return true;
    return false;
  };

  // Score the candidates.
  const pageProse = proseOf(root);
  const holdsMostProse = (el: Element) => proseOf(el) >= pageProse * HINT_SHARE;
  const scores = new Map<Element, number>();
  for (const m of prose) {
    if (underBoilerplate(m.block.element, root, holdsMostProse)) continue;
    let el: Element | null = m.block.element.parentElement;
    for (const share of ANCESTOR_SHARES) {
      if (!el || !root.contains(el)) break;
      scores.set(el, (scores.get(el) ?? 0) + m.plain * share);
      el = el.parentElement;
    }
  }
  let best: Element = root;
  let top = 0;
  for (const [element, score] of scores)
    if (score > top) {
      top = score;
      best = element;
    }
  const semantic = best.closest("article, main, [role=main]");
  const container = semantic && root.contains(semantic) ? semantic : best;

  const included = new Set<TextBlock>();
  const holdsBest = (el: Element) => el.contains(best);
  for (const m of measured) {
    const { element } = m.block;
    if (!container.contains(element)) continue;
    if (m.density >= LINK_BLOCK_DENSITY) continue;
    if (underBoilerplate(element, container, holdsBest)) continue;
    included.add(m.block);
  }

  // The title.
  const heading =
    container.querySelector("h1") ?? pageHeading(root, blocks, title);
  if (heading)
    for (const block of blocks)
      if (heading.contains(block.element)) included.add(block);

  return {
    contains: (block) => included.has(block),
    last: blocks.findLast((b) => included.has(b)),
  };
}

/** The first `h1` among the blocks whose text the page title contains. */
function pageHeading(
  root: Element,
  blocks: readonly TextBlock[],
  title: string,
): Element | undefined {
  const page = normalize(title);
  if (page === "") return undefined;
  for (const h1 of root.querySelectorAll("h1")) {
    const text = normalize(
      blocks
        .filter((b) => h1.contains(b.element))
        .map((b) => b.text)
        .join(" "),
    );
    if (text !== "" && page.includes(text)) return h1;
  }
  return undefined;
}

function everything(blocks: readonly TextBlock[]): MainContent {
  const all = new Set(blocks);
  return { contains: (block) => all.has(block), last: blocks.at(-1) };
}
