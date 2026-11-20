# YouTube captions and watch page (investigated 2026-11-10)

Video: `iG9CE55wbtY` (TED, "Do schools kill creativity?"), 64 caption tracks including manual `en`, manual `ja`, and `a.en` (ASR). Logged out, no consent banner (none was shown from this location). Player client `cver=2.20261105.05.01`.

Tools: Playwright Chromium (headless and headed) and, because of the token problem below, the Claude desktop app's built-in browser (a regular Chromium, `navigator.webdriver === false`), logged out. Fixtures were saved from the built-in browser; DOM and layout facts come from Playwright at 1400x900.

## Summary
- Every `/api/timedtext` request for a baseUrl naming `exp=xpe` needs a **PO token** (`pot`) plus the player's client params. Without them the server answers `200` with an **empty body**. A player response whose baseUrls have no `exp` needs no token (2026-11-18, "Track URLs from a replaced player response" below).
- A plain `fetch(baseUrl + "&fmt=json3")` from the page: `200`, 0 bytes (`en`, `ja`, `a.en`, `&tlang=ja`, and the XML default format alike).
- **Playwright-driven Chromium gets empty bodies even for the player's own requests** (headless, new headless and headed). The token the player mints under automation (`navigator.webdriver === true`) is not accepted, and the player then labels the CC button "Subtitles/closed captions unavailable". So E2E tests must serve recorded fixtures with `context.route`; the real-site check (M6 Task 7) can verify layout, but captions may stay empty under Playwright.
- In a regular browser the player's request works (`en` 59 KB, `ja` 44 KB, `en&tlang=ja` 51 KB, `a.en` 379 KB as json3).
- **Once one player request is captured, we can fetch the other tracks ourselves**: take that URL, change `lang`, add `tlang=ja`, or add `kind=asr`, and `fetch` it from the page — all returned full bodies. Removing `pot`/`potc` or the client params (`c`, `cver`, `cplayer`, `cbr`, …) gives an empty body again.
- The token is **bound to the video**: the same `pot` + client params on another video's `baseUrl` returns an empty body. Capture one player request per video.
- A track's own parameters (`lang`, `kind`, and `variant` where its `baseUrl` has one) must stay that track's: another track's `variant` gets an empty body (seen on Shorts, [youtube-shorts.md](youtube-shorts.md)). Build each track's URL from its `baseUrl` plus what the player added (`trackUrl`).
- Answer to the spec's open question: yes, the extension can get the Japanese track and `tlang=ja`, but only after the player has made one timedtext request for that video (either on its own or because we asked it to load a track).

## Caption track list
- First load: `window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer`. **Stale after SPA navigation** (still the first video). Use `document.getElementById("movie_player").getPlayerResponse()` (current video) or the `yt-navigate-finish` event's `detail.response.playerResponse`. The player can also replace the response for the same video (another `ei`, baseUrls without `exp`): read the list again after capturing a request, and use it only when its `ei` is the request's.
- `playerCaptionsTracklistRenderer` keys: `captionTracks`, `audioTracks`, `translationLanguages` (156 languages), `defaultAudioTrackIndex`.
- Track fields: `baseUrl`, `name.simpleText` (localized by `hl`, e.g. "English (auto-generated)"), `vssId` (`.en` manual, `a.en` ASR, `.ja`), `languageCode` (`en`, `ja`, `zh-CN`, `pt-BR`, `iw` for Hebrew…), `kind` (`"asr"` only for ASR; absent for manual), `isTranslatable`, `trackName`.
- `baseUrl` shape: `/api/timedtext?v&ei&caps=asr&opi&exp=xpe&xoaf=5&xowf=1&hl&ip=0.0.0.0&ipbits=0&expire&sparams&signature&key=yt8&lang=en` (+ `&kind=asr` for ASR). No `fmt` → XML (srv) by default.
- `audioTracks[0].captionsInitialState` was `CAPTIONS_INITIAL_STATE_ON_RECOMMENDED`; `defaultCaptionTrackIndex` points at the track the player turns on by default.
- Fixture: `src/core/subtitles/fixtures/youtube/captionTracks.json` (`en`, `a.en`, `ja`, `es`; `ei` and `signature` redacted).

## The player's own request
Query params added by the player (in this order after `baseUrl`'s): `potc=1`, `pot=<116 chars>`, `fmt=json3`, `xorb=2`, `xobt=3`, `xovt=3`, then `tlang=ja` when translating, then `cbrand`, `cbr`, `cbrver`, `c=WEB`, `cver`, `cplayer=UNIPLAYER`, `cos`, `cosver`, `cplatform=DESKTOP`.
- Made with **XMLHttpRequest** (Playwright reports resource type `xhr`), `responseType` text. Hook both XHR and `fetch` anyway.
- When captions are on (sticky user choice, or `ON_RECOMMENDED`), the player requests the default track right after the video starts (after any pre-roll ad).
- **Ads**: during a pre-roll the player made timedtext requests too. Accept only responses whose `v` matches the current video id (`getVideoData().video_id`).
- Switching tracks re-requests; nothing is cached by the player across switches.

## Making the player load a track (page script, MAIN world)
```js
const p = document.getElementById("movie_player");
p.loadModule("captions");
p.setOption("captions", "track", { languageCode: "ja" });                 // → request lang=ja
const en = p.getOption("captions", "tracklist").find((t) => t.languageCode === "en" && !t.kind);
p.setOption("captions", "track", { ...en, translationLanguage: { languageCode: "ja", languageName: "Japanese" } }); // → lang=en&tlang=ja
p.getOption("captions", "track");        // current track ({} or a track object)
p.unloadModule("captions");              // captions off
```
- Each `setOption("captions", "track", …)` triggers one capturable XHR. `getOptions("captions")` lists `reload, fontSize, track, tracklist, translationLanguages, sampleSubtitle, stickyLoading, serverDefaultTrack`.
- Side effect: this turns on YouTube's own captions and persists as the caption choice for the next load (below). The adapter hides `.ytp-caption-window-container` while Langle is on and restores the previous state (`unloadModule("captions")` or the previous track), then the stored choice.
- **Setting the track that is already on makes no request**, and a load that starts with a stored track on can show it without any request Langle sees (2026-11-18, below; once on a Short too, [youtube-shorts.md](youtube-shorts.md)). So `loadTrack` switches captions off (`unloadModule` + `loadModule`) before setting the track already on.

## Reload after Langle's first load (fixed 2026-11-19)
Seen in the user's Chrome on `iG9CE55wbtY` (check build `a80c332`, learner English, native fr and zh): the first load of the watch page in a tab showed the French/Chinese lines; a reload of the same tab showed English only, with no error logged; a new tab worked again.
- After the first load, YouTube's localStorage held `yt-player-caption-persistence` and `yt-player-caption-sticky-language=en`, written by the player when Langle set the English track (captions were off before; `restoreCaptions` switched them off again, but the stored choice stayed).
- After the reload, the player's track was `en` and the only /api/timedtext request seen was the player's own `lang=az` one: no request for `en`, neither the player's own nor one after Langle's `setOption` for the track already on.
- Cause: Langle found no request to capture within its waits (1.5 s for the player's own, 10 s after asking), so `loadCaptions` gave up silently and YouTube's own (English) captions stayed. Two changes:
  1. `loadTrack` keeps the storage entries whose key starts with `yt-player-` and names `caption` (localStorage and the tab's sessionStorage), and `restoreCaptions` puts them back after restoring the player, so Langle leaves the next load as it found it.
  2. Asking for the track already on switches captions off first, so the player requests it (covers a user who chose English captions themselves).
- Reproduced offline by the fake player (`tests/fake-youtube-player.ts`), which keeps the track set in localStorage, starts the next load with it on without a request, and ignores setting the track already on: E2E "a reload of the tab shows the Japanese line again" and the adapter's browser tests failed before the fix.
- Not explained offline: why "a new tab works" when the stored choice is in localStorage (shared by tabs), and where the `lang=az` request came from (it was not captured in time or had an empty body). A real-site check must look at: the first load, then a reload of the same tab, then a new tab, each showing the native lines (fr, then zh); `localStorage` and `sessionStorage` keys matching `yt-player-*caption*` before and after Langle's first load (they must be as before); the timedtext requests (`performance.getEntriesByType("resource")`) of each load; and the player's track (`getOption("captions", "track")`) after a load, which must be what it was before Langle asked.

## Track URLs from a replaced player response (fixed 2026-11-19)
Seen in the user's Chrome on `iG9CE55wbtY` (check build `f2f3811`, learner English, native fr), on the first load of the watch page in a new tab opened after the youtube.com home page: English only, nothing logged.
- Timedtext requests: the player's own XHR `lang=en` (59,007 B), then Langle's `lang=fr`, `lang=fr-CA` and `lang=en&tlang=fr`, all with empty bodies.
- Langle's URLs carried `exp=xpe` and the `ei`, `signature` and `expire` of `ytInitialPlayerResponse`. The player's own request had neither `exp` nor `pot`: it was made from a newer `getPlayerResponse()`, whose baseUrls have no `exp`.
- On the page: Langle's `fr` URL as sent → 0 B; the same URL without `exp` → 2,133 B (`exp` is in `sparams`, so the signature no longer fits); the player's captured URL with `lang=fr` → 57,162 B, with `tlang=fr` → 61,947 B.
- So **the player can replace its player response after the page loads**, and the new one's baseUrls need no PO token (the player then sends none). A baseUrl naming `exp=xpe` needs the token: one response's baseUrls with another response's request params get empty bodies. A later load of the same video, a reload of the tab and another new tab all worked (`lang=fr` without `exp`): the response had been replaced already.
- Cause: `loadCaptions` read the track list once, before waiting for the player's request, and `trackUrl` combined those stale baseUrls with a capture from the newer response.
- Fix: the track list is read again after the capture and must be the response the capture was made from (`sameResponse`: the same `ei`, which every baseUrl of a response carries and signs); a kept capture from an earlier response is dropped and the player asked again. When every track Langle fetched still comes back empty, it tries once more with a fresh capture and track list, and after that logs a warning (`YouTube answered every caption track fetched for <id> with an empty body`), so the check build's error log shows this class of failure.
- Reproduced offline: the fake player (`tests/fake-youtube-player.ts`) can swap in a refreshed response before its first caption request (`refreshedPlayerResponse`: no `exp`, its own `ei` and `signature`) and adds its token only to baseUrls naming `exp=xpe`, and the fixture server (`tests/youtube-timedtext.ts`) asks for the token only there. The adapter's browser tests and the E2E test "a first load whose player replaces its response…" failed before the fix.
- Not explained: what makes the player replace the response (here, a new tab after the home page; the earlier recordings had `exp=xpe` baseUrls and a token). A real-site check must look at the first load of a video in a new tab opened from the home page with native fr, then zh: the native lines shown; the timedtext requests (`performance.getEntriesByType("resource")`), where every Langle URL has the `ei` of the player's own request and `exp` only together with `pot`; `ytInitialPlayerResponse` against `getPlayerResponse()` (`ei`, `exp` in the baseUrls); and an empty error log (a warning there means every fetched body was still empty after the second try).

## Changing the language pair while a video is open (fixed 2026-11-19)
The video session chose the tracks once per video, so switching the native language in Settings kept the old one's lines (French stayed after switching to zh). Now a change of the learning or native language loads the video's subtitles again, as on opening it (all video sites).
- Simplest flow: if no timedtext response was seen for this video shortly after playback starts, ask the player for the original track once, capture the URL, then fetch `lang=<native>` and `tlang=<native>` ourselves from that URL.

## json3 format (`fmt=json3`)
Top level: `wireMagic: "pb3"`, `pens`, `wsWinStyles`, `wpWinPositions`, `events[]`.
- Manual tracks: one event per cue, `{ tStartMs, dDurationMs, segs: [{ utf8 }] }`. Line breaks are `\n` inside `utf8`.
- `tlang` responses keep **exactly the original's timing** (same `tStartMs`/`dDurationMs`, same count). Some translated events are only `"\n"` or start/end with `\n`; machine translation can contain U+200B (zero-width space).
- ASR (`kind=asr`): a first window-definition event without `segs` (`dDurationMs` = whole video), then alternating word events `{ tStartMs, dDurationMs, wWinId, segs: [{ utf8: "how" }, { utf8: " are", tOffsetMs: 240, acAsrConf }…] }` and `aAppend: 1` events whose only seg is `"\n"`. Events overlap (two-line rolling window), some lack `dDurationMs`, there is no punctuation or capitalization in this track, and filler words (`um`, `uh`) are included. Each word event contains only new words.
- The Japanese manual track has its own segmentation (2–7 s cues, a translator credit cue at 0 s).
- Manual tracks uploaded as SRT/WebVTT keep their formatting tags in `utf8` (`<i>Craigslist</i>`, seen 2026-11-15 on `u1hVAhIVa-4`), and so does YouTube's translation of them; the player renders them. The parser drops tags whose name starts with a letter (`<i>`, `</b>`, `<font color="…">`), so "<3" and "2 < 3" stay text.

## Auto-translation of an ASR track (checked 2026-11-11)
Videos: `GLNVMi_4Khw` (gaming commentary, 2018, ASR without punctuation), `1w5R5QOjbVY` and `RVzIGNFyvYU` (vlogs, ASR with punctuation), `P30_ec_t0Y8` (30-minute interview, ASR with sparse punctuation, `>>` at speaker changes, `[music]` inside sentences). Newer ASR tracks have punctuation and capitals; older ones have none.
- `kind=asr&tlang=ja` keeps the English word events' `tStartMs` (some events get no text and are left out). YouTube translates **whole sentences**, punctuating them itself even when the English track has none, and spreads each translation over the events, with `tOffsetMs` interpolated evenly over the English words' span. So the Japanese of one English event is often half of one sentence and half of the next ("…変えます。それは"), and sentence ends drift by a few words, sometimes an event.
- Every 。！？ in the translation is a sentence end YouTube saw; marks inside 「」 are not (「いいね！」を押して…). One English sentence is sometimes translated as two (", which is crazy." → "…。それはとんでもない金額だ。").
- `tlang=en` on an English ASR track gives the raw words in one event, without punctuation: no way to get YouTube's punctuation directly.
- Langle follows the translation's sentences (`alignAsrSentences`, `src/core/subtitles/asr.ts`). Fixtures (first 150 s, English ASR and `tlang=ja`) in `src/core/subtitles/fixtures/youtube/`: `asr-plain-*` (`GLNVMi_4Khw`), `asr-punctuated-*` (`1w5R5QOjbVY`), `asr-interview-*` (`P30_ec_t0Y8`).

## Watch page DOM (desktop, default two-column layout)
- Player: `#movie_player.html5-video-player` (inside `ytd-player#ytd-player > #container`, under `#primary-inner > #player > #player-container-outer > #player-container-inner > #player-container`). Player API methods live on this element.
- Video: `video.video-stream.html5-main-video` inside `.html5-video-container`. The same `<video>` and player element are reused across SPA navigations.
- Captions: `#ytp-caption-window-container.ytp-caption-window-container` (direct child of `#movie_player`, covers the player) → `.caption-window.ytp-caption-window-bottom > span.captions-text > span.caption-visual-line > span.ytp-caption-segment`.
- Controls: `.ytp-chrome-bottom > .ytp-chrome-controls > .ytp-left-controls | .ytp-right-controls`. `.ytp-right-controls` children in order:
  1. `.ytp-right-controls-left`: `.ytp-expand-right-bottom-section-button` (hidden), `.ytp-autonav-toggle`, `.ytp-subtitles-button` (`aria-pressed`), `.ytp-settings-button`
  2. `.ytp-right-controls-right`: `.ytp-size-button` (theater), `.ytp-remote-button` (hidden), `.ytp-fullscreen-button`
  3. `.ytp-pip-button` (hidden)
  Good insertion point for the L + ^ group: before `.ytp-settings-button` inside `.ytp-right-controls-left`, or as the first child of `.ytp-right-controls-right`. Buttons are 48x40 px.
- Below the player: `#below` (in `#primary-inner`); title `ytd-watch-metadata h1`.
- Right column: `#secondary > #secondary-inner` with children `#panels`, `#chat-container`, `ytd-playlist-panel-renderer#playlist`, `#inline-panels`, `#persistent-panel-container`, `#donation-shelf`, `#related`. Insert the transcript before `#related` (after the playlist). At 1400 px: player 967x725 at (16, 68); `#secondary` 401 px wide at x=999.
- Layout attributes on `ytd-watch-flexy`: `video-id`, `default-layout`, `is-two-columns_`, `theater` (theater mode), `is-single-column` (narrow windows: `#secondary` is empty and 0x0, content moves under the player).
- Theater mode: `ytd-watch-flexy[theater]`; the player moves into `#full-bleed-container` at full width, and `#secondary` drops below the player (y=811 instead of 56). The transcript then sits below the video.
- SPA navigation: `document` events `yt-navigate-start` → `yt-player-updated` → `yt-navigate-finish` (`detail.response.playerResponse.videoDetails.videoId`) → `yt-page-data-updated`. `ytd-watch-flexy[video-id]` updates too.
- Ads: `#movie_player.ad-showing` (also `ad-interrupting`) while an ad plays; `ad-created` is present even without an ad.
- Trusted Types are enforced on youtube.com: assigning `innerHTML` throws ("This document requires 'TrustedHTML' assignment"). Build DOM with `createElement`/Preact, not HTML strings.
- Titles are localized by the viewer's language (`videoDetails.title` and the `<h1>` showed a Japanese title when the UI was Japanese).
- Skeleton for E2E routing: `e2e/fixtures/youtube-watch.html` (scripts stripped, trimmed).

## Fullscreen and the transcript sidebar (seen on youtube.com, 2026-11-13)
- YouTube's fullscreen button calls `requestFullscreen()` on `<html>`: the whole page is the fullscreen element, so Langle's parts stay in `body`. `ytd-watch-flexy` moves the player into `#full-bleed-container` (a flex row) > `#player-full-bleed-container` (`flex: 1 1 0%`) > `#player-container` (absolute, inset 0) > … > `#movie_player`. The row's other child, `#panels-full-bleed-container`, is hidden (`display: none`).
- `width` on `#player-full-bleed-container` has no effect (it is a growing flex item); `margin-right: 392px` narrows it, and with it the player, its title bar and its control bar.
- The `<video>`'s size is set inline by the player (`width`, `height`, `left`, `top`) and is not updated when only its container changes: after a dispatched window `resize` it fitted the narrower player (a 4:3 talk: 986 × 740 at top 32 in a 986 × 804 player). Undoing it needs another `resize`. Leaving fullscreen puts the player back in `#player` and sizes the video again by itself.
- Theater mode uses the same full-bleed container, so Langle narrows it only while the page is in fullscreen.

## Shorts track URL and long ASR cards (fixed 2026-11-14)

A track's URL is built from its own `baseUrl` (its `variant`) plus the player's token, so Shorts load when the player first asked for another caption language (an empty body before, so no subtitles); YouTube's own captions show again for a video Langle has no subtitles for (they stayed hidden after a video with subtitles); with YouTube's auto-translation a bracket that never closes no longer hides every later sentence end, and an auto-generated card holds at most 30 words, its translation cut at a clause end. Over the 14 auto-generated videos of the corpus: cards over 30 words 203 → 1 (31 by whitespace), the longest 7,615 → 31 words, cards 2,673 → 4,153. Checked in the user's Chrome on 2026-11-14 (Short `mzYMZGrIml4` with the caption language Japanese, SPA moves between Shorts, `7C9gSIvAn9I`: longest card 67 → 30 words)

## Speaker changes and translated sentence ends in ASR cards (fixed 2026-11-15)

With YouTube's auto-translation, an auto-generated card now always ends at a speaker change `>>`, and each translated sentence end is dated when it is said (the piece's time spread over its characters) instead of at the start of the piece holding it. Study `2026-11-cards`, offline over 11 + 14 auto-generated videos (new sample / round 2 of the 2026-11 study):
- Cards with `>>` inside: 5 → 0 of 1,952 / 177 → 0 of 4,153 (4.3%; up to 1 card in 7 on talk shows). Cards 1,952 → 1,962 / 4,153 → 4,347.
- Cards without a translation: 0.1 → 0.2% / 0 → 2.1% (91: 62 are only sound labels such as "[laughter]" before a `>>`, 29 are speech whose translated clause YouTube said after the change, e.g. ">> WOW." before ">> IT'S LIKE MAGIC.").
- Cards ending mid-sentence with the next going on in lower case: 11.5 → 11.5% / 28.4 → 26.6%; the same translation as the card before: 0.9 → 1.0% / 1.3 → 1.2%.
- Dating, 18 punctuated tracks (4,820 translated end marks): distance to the nearest English sentence boundary median 336 → 153 ms, at the boundary 11.5 → 34.3%, within 300 ms 46 → 63% (p90 1.13 → 1.24 s: the last piece of an event spreads up to the next piece, which YouTube sometimes starts late).
- Read by hand, 30 changed places (before vs after): 14 better, 7 the same, 9 worse. Worse: a translated clause put on the wrong side of a `>>` (Japanese word order, or a label "[笑い]" opening the clause said at the change), and one-word boundary shifts in tracks without punctuation.
- Manual tracks and auto-generated tracks without the translation are unchanged.

## Phrases across transcript cards (R4-asr, 2026-11-20)
In an auto-generated track a card ends at a pause (no punctuation) or where YouTube's translation ends a sentence, so a phrase is often cut by a card's end ("sin | embargo", "du | coup", "zu | Hause"; C4). Cards whose sentence runs on are now classified together, the phrase highlighted in each card's part ([architecture](../specs/architecture.md) "Transcript cards classified together"). Over the 2026-11 corpora's auto-generated tracks: 1.3 (es), 0.7 (fr), 0.4 (de, en) phrases more per 1,000 tokens, judged better 17 : 4, 23 : 1, 7 : 2, 25 : 8. A human track's lines inside a card (YouTube's English tracks cut by length) read as spaces, no longer sentence ends for the tagger: judged 17 : 7 on English hovers.

## Risks
- PO token rules change often; if the "reuse the player's URL" trick stops working, fall back to asking the player for each track in turn (`setOption`) and capturing every response, or to the built-in translator.
- Automated tests cannot get real captions from youtube.com; only recorded fixtures.
- Changing the player's caption track changes what the user sees and may persist; restore it.
- Player API (`loadModule`, `setOption`, `getPlayerResponse`) and class names are undocumented and may change.
- Pre-roll ads produce their own timedtext requests and `ad-showing` state; filter by video id and wait for the ad to end.
- Not checked: videos with only ASR captions (the format is the same as `a.en` above), live streams, embedded players. Shorts use the same requests through their own player: [youtube-shorts.md](youtube-shorts.md). The mobile site (`m.youtube.com`) was checked on 2026-11-13: the same capture works, the DOM differs ([mobile.md](mobile.md)).
