# Article main content on real sites (2026-11-15)

How well "Highlight only the article" (`findMainContent`, `src/content/article/main-content.ts`) keeps a
page's title and body, measured on real article pages, and what was changed.

## Method
- One current article per site (from the site's RSS/Atom feed, or a fixed URL for references), 108 pages
  measured. Headless Chromium (Playwright), 3 sites at a time, one page per site, images, video and fonts
  not loaded. The page was scrolled to the bottom once so lazy parts load.
- Lingo's own `collectBlocks` and `findMainContent` were bundled and injected into the page; Mozilla
  Readability ran on a clone of the same DOM as an independent reference (its own misses: cookie text,
  `<code>` text, video fallbacks, which were read past).
- Per page: the blocks kept and left out, the title found, `last` (the end-of-article trigger), and for
  each left-out block the ancestor that left it out. Candidate rules ran side by side on the same DOM, so
  each rule's effect was measured without loading the sites again.

Sites (by kind): news 38 (BBC News and Sport, Guardian incl. live and long read, NYT, CNN, NPR, Al Jazeera,
Axios, CNBC, Politico, ProPublica, Vox, The Atlantic, New Yorker, Japan Times, DW, Euronews, SCMP, …),
tech 19 (The Verge, Ars Technica, Wired, Engadget, 9to5Mac, MacRumors, Tom's Hardware, ZDNet, …),
science and long-form 17 (Aeon, Quanta, Nature, Smithsonian, Scientific American, Undark, Psyche, …),
blogs 15 (Medium, Substack, dev.to, Ghost, GitHub, Google, Cloudflare and Mozilla blogs, Kottke, Julia
Evans, Simon Willison, …), references 16 (Wikipedia, Simple Wikipedia, Britannica, MDN, Python docs, GOV.UK,
WHO, NHS, MedlinePlus, Investopedia, Gutenberg, a GitHub README, recipes), learning 3 (VOA Learning
English, News in Levels, Breaking News English). About 30 more were not measured: bot walls in headless
Chrome (Reuters, AP, WSJ, Forbes, Economist, Daily Mail, Sky News, …) or no feed item.

## What was wrong (root causes)
1. **The body never ended** (43 of 108): everything in the container after the body counted: author bios,
   subscribe and login walls, donation asks, user Q&A and reviews, related-story cards, topic lists, ad
   labels. `last` was then at the bottom of the page, so the end-of-article save fired late or never.
2. **Generated ids read as hint words**: camelCase splitting turned Wikipedia's paragraph ids `mwAdA`,
   `mwAdM` into "mw ad a", and those paragraphs were left out as ads.
3. **Anchors counted as links**: headings linked to their own anchor (`<h2><a href="#attributes">`: MDN,
   Julia Evans, Cloudflare) were 100% link text and were left out.
4. **Titles missed**: an `h1` with `display: inline` has its text in its parent's block (The Verge, The
   Conversation); `<title>` is an SEO variant while `og:title` matches the `h1` (Hollywood Reporter, LA
   Times); blogs keep `h1` for the site name and title posts with `h2` (Kottke).
5. **Drop caps split the first word** (Aeon): a floated `<span>M</span>any` is a block, so "M" and "any"
   were two words. This one is in `page-text.ts` and affects every page.

## What changed
- The body ends with its last part (`bodyEnd`): the best-scored element and the elements in the container
  scoring at least 1/4 as well are the parts; the smallest part around the last paragraph in them is the
  end, and what follows it is left out. On the 108 pages it removed only page-end chrome (one trailing image
  caption on BBC Sport went with it) and kept bodies split by ad slots (BBC Sport, NYT, Google Blog) and
  recipe directions (Allrecipes). A share of 0.15 kept subscribe boxes and cards (Japan Times, Psyche);
  0.35 cut recipe text (Allrecipes).
- Only links to other pages count as links (http(s), another path or query). Section headings stay; in-page
  tables of contents and "Copy link" labels now count too (short, harmless).
- A class or id token is split at camelCase only when no piece is a single letter.
- A heading's blocks are the blocks with a text node in it; the page's titles are `<title>`, `og:title` and
  `twitter:title`; when no `h1` matches, an `h2`/`h3` of at least 12 characters may.
- A floated one- or two-letter element followed by a letter is read inline.

## Tried and rejected
- Leaving out "story cards" (an element outside the body with a heading linked to another page): also
  dropped Britannica's sections, whose headings link to section pages; the body-end rule already covers
  nearly every card it caught.
- Leaving out everything after the best-scored element: dropped the second half of split bodies (BBC
  Sport, NYT, Google Blog, Allrecipes directions).
- Sparing a hinted wrapper only when it holds the title `h1`: dropped whole bodies (404 Media, Axios,
  France 24, New Yorker, Wired).
- More hint words (subscribe, cookie, consent, bio): special cases; the body-end rule removes what they did.

## Known limits
- A short post under a long comment section (Substack): the comments hold most of the prose, so their
  "comment" hint is spared and they win over the post.
- Lesson pages made of many equal sections (Breaking News English) count as a whole.
- Video and listing pages (NBC News video, News in Levels' level pages) are not articles; whatever they
  hold counts.
