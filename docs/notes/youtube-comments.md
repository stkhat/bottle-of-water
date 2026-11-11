# YouTube comments (investigated 2026-11-12)

Video: `iG9CE55wbtY` (TED, "Do schools kill creativity?"), then an SPA navigation to `g4IAa8wZlqU` through a related video. User's Chrome, signed in, Japanese UI (`<html lang="ja-JP">`). Read through Claude in Chrome.

## Structure
- The comment section is `ytd-comments#comments` inside `#below` (`#columns > #primary > #primary-inner > #below`). It loads lazily: its threads appear once the page is scrolled near it, 20 at a time.
- A second `ytd-comments` (no id, empty, hidden) sits in an engagement panel (`#panels ytd-engagement-panel-section-list-renderer`). It is not the comment list under the video.
- **The same `ytd-comments#comments` element stays across SPA navigation**: YouTube keeps the element and replaces the threads inside it.
- A thread: `ytd-item-section-renderer#sections > div#contents > ytd-comment-thread-renderer > div#comment-container > ytd-comment-view-model#comment`.
- A comment (`ytd-comment-view-model`): `div#body > div#main > ytd-expander#expander > div#content` (display `flow-root`, the nearest block of the text) `> yt-attributed-string#content-text > span.ytAttributedStringHost` (the text).
  - `div#content` also holds `yt-pdg-comment-chip-renderer#paid-comment-chip` (Super Thanks chip, normally empty).
  - "Read more" / "Show less" are `tp-yt-paper-button#more` / `#less`, siblings of `div#content` in the expander (outside the block).
  - Around the body, in other blocks: the author (`@name`, a span inside a link), the time ("3 weeks ago", a link), "Translate to Japanese" (`tp-yt-paper-button`), the like count, "Reply".
- Replies: "N replies" is a button in `ytd-comment-replies-renderer`. Opened, its replies are `… > ytd-comment-replies-renderer > div#expanded-threads > yt-sub-thread > div > ytd-comment-thread-renderer > … > ytd-comment-view-model`, with the same `#content-text` body.
- The header (`ytd-comments-header-renderer`): the count ("13,054 comments"), "Sort by", the "Add a comment…" box.

## What Lingo uses
- Root: `ytd-comments#comments` (watch pages only).
- Text: only text nodes inside `#content-text`, so each comment body (and each reply) is one block, and names, times, buttons and the header are never blocks.
- `<html lang>` is the YouTube UI's language, not the comments' language: comments are checked one by one with `i18n.detectLanguage`.
