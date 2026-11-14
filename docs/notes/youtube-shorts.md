# YouTube Shorts (investigated 2026-11-13)

Shorts: `mzYMZGrIml4` ("Money Idioms in English - Part 2", English ASR), `9JQ8ZTDJvlo` (Japanese), reached with the "Next video" / "Previous video" buttons. User's Chrome, signed in, Japanese UI, 1400×847 window. Read through Claude in Chrome.

## Page
- URL `/shorts/<id>`. The page is `ytd-shorts` inside `ytd-page-manager`. **The watch page's `ytd-watch-flexy` (with `#movie_player`, 0×0, and `ytd-comments#comments`) can stay in the DOM while a Short shows**, so lookups must go by the URL path, not by which elements exist.
- One `ytd-reel-video-renderer#reel-video-renderer` sits in `#reel-overlay-container` and holds the player; the reels in the sequence (`div.reel-video-in-sequence-new`) are placeholders. It had no `is-active` attribute.
- Player: `ytd-reel-video-renderer > #short-video-container > div.player-wrapper > #player-container > ytd-player#player > div#container > div#shorts-player.html5-video-player.ytp-hide-controls`. Same player API as `#movie_player` (`getPlayerResponse`, `getOption/setOption("captions", …)`, `seekTo`). `video.video-stream.html5-main-video` and `#ytp-caption-window-container` are inside it. 426×757 at this window size, centered (x 564); it moves left (x 300) when the comments panel opens.
- **The same `#shorts-player` and `<video>` are reused for the next Short.**

## Controls over the video
- `ytd-shorts-player-controls` at the top of the video:
  - `#left-controls`: play/pause (`#play-pause-button-shape`), volume (`volume-controls`)
  - `#right-controls`: captions (`#closed-captioning-button-container > ytm-closed-captioning-button`), "More actions" (`#menu-button`), fullscreen (`#fullscreen-button-shape`). 48 px round buttons, y +16 from the video's top
- Bottom of the video: the metapanel (`yt-reel-metapanel-view-model`: channel bar, title, a link), about 92 px tall ending ~16 px above the video's bottom.
- Title: `yt-shorts-video-title-view-model h1` (`h1.ytShortsVideoTitleViewModelShortsVideoTitle`); `document.title` is "<title> - YouTube".
- Right of the video (outside it): `reel-action-bar-view-model` (like, comments "N 件のコメントを表示", share, remix, sound). Far right: `#navigation-button-up` / `#navigation-button-down`.

## Navigation to the next Short
`yt-navigate-start` → `yt-player-updated` (the player response is already the next video's, the URL not yet) → `yt-page-data-updated` → `yt-navigate-finish` (URL `/shorts/<next>`), within ~400 ms. History uses `pushState`.

## Captions
- English Shorts had `en` ASR plus ASR tracks in many other languages, and 150+ translation languages: the watch page's capture / auto-translate path applies.
- With captions off (the default), the player makes no `/api/timedtext` request; the CC button or `setOption("captions", "track", …)` makes one.
- **Each track's `baseUrl` names its own `variant`** (2026-11-14, `mzYMZGrIml4`, Japanese UI): `a.en` has `variant=gemini`, the other 20 auto-generated tracks (`a.ja`, `a.fr`…, YouTube's translations of the speech) `variant=timing-optimized`. A request with another track's `variant` gets `200` with an empty body (`lang=en&kind=asr&variant=timing-optimized`: 0 bytes; without `variant`: the track). The token, signature and client params are the same for every track. So a track's URL is its own `baseUrl` plus the token and client params the player added to its request (`trackUrl`); copying the captured request and changing `lang` gave an empty body whenever the player had asked for another language (the user's caption language, `yt-player-caption-sticky-language`).
- `getOption("captions", "tracklist")` is `[]` on the Shorts player; `setOption("captions", "track", { languageCode, kind })` still loads that track.
- Once (a full load with the sticky language `ja` and captions off) the player made no timedtext request at all, also not after Lingo's `setOption`; it did not happen again in four more loads.

## Loop
- `video.loop` is true (attribute set): at the end the browser seeks to 0 (`seeking`/`seeked` at 0.00, `currentTime` 20.85 → 0) and `ended` never fires.

## Comments
- The comments open in an engagement panel beside the action bar: `div#anchored-panel > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]`, `visibility` `ENGAGEMENT_PANEL_VISIBILITY_HIDDEN` → `…_EXPANDED`. 480×758, right of the action bar (x 833 here); the list scrolls inside (`div#contents`).
- Its `ytd-comments` has **no id**; it is in the DOM before the panel opens; threads load when it opens.
- Inside it the structure is the watch page's: `ytd-item-section-renderer#sections > div#contents > ytd-comment-thread-renderer > div#comment-container > ytd-comment-view-model#comment > … > ytd-expander#expander > div#content > yt-attributed-string#content-text`.
- **Moving to the next Short keeps the panel open and the same `ytd-comments` element**; its threads are replaced.
