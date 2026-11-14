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

/**
 * The body's parts: the best-scored element and the elements beside it scoring at least
 * this share of its score. The body ends with the last of them that holds prose.
 */
const END_SHARE = 0.25;

/** Score shares of a prose block's parent, grandparent and great-grandparent. */
const ANCESTOR_SHARES = [1, 1 / 2, 1 / 3];

/**
 * An element scoring at least this share of the best score is a strong candidate:
 * another section of the same body (a live page's post, a chapter).
 */
const REPEAT_SHARE = 0.5;
/**
 * With at least this many strong candidates beside the best-scored element, the body
 * is their common container; a single one (a long teaser or rail block) is not enough.
 */
const MIN_REPEATS = 2;

/** A link to another page: not to a place on this one, not a script. */
function leavesPage(link: HTMLAnchorElement): boolean {
  if (!/^https?:$/.test(link.protocol)) return false;
  return (
    link.origin !== location.origin ||
    link.pathname !== location.pathname ||
    link.search !== location.search
  );
}

const linkText = (block: TextBlock) =>
  block.pieces.reduce((n, p) => {
    const link = p.node.parentElement?.closest("a[href]");
    return link instanceof HTMLAnchorElement && leavesPage(link)
      ? n + p.node.data.length
      : n;
  }, 0);

/**
 * The words of a class or id: split at non-letters and at camelCase ("readMore"),
 * except in generated tokens, where a camelCase piece is a single letter ("mwAdA").
 */
const words = (value: string) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .flatMap((token) => {
      const pieces = token.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ");
      return pieces.some((p) => p.length === 1) ? [token] : pieces;
    })
    .map((w) => w.toLowerCase())
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

/** The page's titles: `<title>`, `og:title` and `twitter:title`. */
function pageTitles(): string[] {
  const titles = [document.title];
  for (const selector of [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) {
    const title = document.querySelector(selector)?.getAttribute("content");
    if (title) titles.push(title);
  }
  return titles;
}

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
 *   element, widened to the nearest ancestor holding two other elements that score
 *   at least half as well (the posts of a live page, chapters), then to its nearest
 *   `article`, `main` or `[role=main]`.
 * - Left out of it: what follows the body's end (`bodyEnd`: author bios, sign-up walls,
 *   cards for other stories); `nav`, `aside`, `footer` and their roles; elements whose
 *   class or id names related stories, sharing, comments, ads, references and the like
 *   (unless they hold the best-scored element); blocks mostly made of links to other
 *   pages.
 * - The title: the container's first `h1`, else the heading `titleHeading` finds among
 *   `titles` (the page's `<title>`, `og:title`, `twitter:title`); it counts even
 *   outside the container.
 * When no block reads as prose, every block counts.
 */
export function findMainContent(
  root: Element,
  blocks: readonly TextBlock[],
  titles: readonly string[] = pageTitles(),
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
  best = widenToRepeats(best, top, scores, root);
  const semantic = best.closest("article, main, [role=main]");
  const container = semantic && root.contains(semantic) ? semantic : best;

  const end = bodyEnd(best, top, scores, container, prose);

  const included = new Set<TextBlock>();
  const holdsBest = (el: Element) => el.contains(best);
  for (const m of measured) {
    const { element } = m.block;
    if (!container.contains(element)) continue;
    if (
      !end.contains(element) &&
      end.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    )
      continue;
    if (m.density >= LINK_BLOCK_DENSITY) continue;
    if (underBoilerplate(element, container, holdsBest)) continue;
    included.add(m.block);
  }

  // The title. A heading's blocks are those with text in it (an inline `h1`'s text
  // belongs to its parent's block).
  const textIn = (heading: Element) =>
    normalize(
      blocks
        .flatMap((b) => b.pieces)
        .filter((p) => heading.contains(p.node))
        .map((p) => p.node.data)
        .join(""),
    );
  const heading =
    [...container.querySelectorAll("h1")].find((h) => textIn(h) !== "") ??
    titleHeading(root, titles, textIn);
  if (heading)
    for (const block of blocks)
      if (block.pieces.some((p) => heading.contains(p.node)))
        included.add(block);

  return {
    contains: (block) => included.has(block),
    last: blocks.findLast((b) => included.has(b)),
  };
}

/**
 * When the body is split into sections that each score well on their own (a live
 * page's posts, chapters), the best-scored element is only the biggest of them. Then
 * the nearest ancestor of `best` within `root` that holds `MIN_REPEATS` strong
 * candidates (elements beside `best` scoring `REPEAT_SHARE` of `top`); else `best`.
 */
function widenToRepeats(
  best: Element,
  top: number,
  scores: ReadonlyMap<Element, number>,
  root: Element,
): Element {
  const strong: Element[] = [];
  for (const [element, score] of scores)
    if (
      score >= top * REPEAT_SHARE &&
      !element.contains(best) &&
      !best.contains(element)
    )
      strong.push(element);
  if (strong.length < MIN_REPEATS) return best;
  for (
    let el = best.parentElement;
    el && root.contains(el);
    el = el.parentElement
  )
    if (strong.filter((s) => el.contains(s)).length >= MIN_REPEATS) return el;
  return best;
}

/**
 * Where the body ends: the smallest of its parts (`best` and the elements in
 * `container` beside it scoring `END_SHARE` of `top`, such as the second half of a
 * body split by an ad slot) around the last prose block in any of them.
 */
function bodyEnd(
  best: Element,
  top: number,
  scores: ReadonlyMap<Element, number>,
  container: Element,
  prose: readonly Measured[],
): Element {
  const parts = [best];
  for (const [element, score] of scores)
    if (
      score >= top * END_SHARE &&
      container.contains(element) &&
      !element.contains(best) &&
      !best.contains(element)
    )
      parts.push(element);
  const last = prose.findLast((m) =>
    parts.some((part) => part.contains(m.block.element)),
  )?.block.element;
  let end = best;
  if (last)
    for (const part of parts)
      if (part.contains(last) && (!end.contains(last) || end.contains(part)))
        end = part;
  return end;
}

/** The minimum length of an `h2` or `h3` taken as the title. */
const SUBHEADING_TITLE_CHARS = 12;

/**
 * The first `h1` whose text one of the page's titles contains; else the first `h2` or
 * `h3` of at least `SUBHEADING_TITLE_CHARS` (blogs that keep `h1` for the site name).
 */
function titleHeading(
  root: Element,
  titles: readonly string[],
  textIn: (heading: Element) => string,
): Element | undefined {
  const pages = titles.map(normalize).filter((t) => t !== "");
  const matches = (heading: Element, min: number) => {
    const text = textIn(heading);
    return text.length >= min && pages.some((page) => page.includes(text));
  };
  return (
    [...root.querySelectorAll("h1")].find((h) => matches(h, 1)) ??
    [...root.querySelectorAll("h2, h3")].find((h) =>
      matches(h, SUBHEADING_TITLE_CHARS),
    )
  );
}

function everything(blocks: readonly TextBlock[]): MainContent {
  const all = new Set(blocks);
  return { contains: (block) => all.has(block), last: blocks.at(-1) };
}
