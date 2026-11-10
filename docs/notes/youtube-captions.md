# YouTube captions and watch page (investigated 2026-11-10)

Video: `iG9CE55wbtY` (TED, "Do schools kill creativity?"), 64 caption tracks including manual `en`, manual `ja`, and `a.en` (ASR). Logged out, no consent banner (none was shown from this location). Player client `cver=2.20261105.05.01`.

Tools: Playwright Chromium (headless and headed) and, because of the token problem below, the Claude desktop app's built-in browser (a regular Chromium, `navigator.webdriver === false`), logged out. Fixtures were saved from the built-in browser; DOM and layout facts come from Playwright at 1400x900.

## Summary
- Every `/api/timedtext` request needs a **PO token** (`pot`) plus the player's client params. Without them the server answers `200` with an **empty body**.
- A plain `fetch(baseUrl + "&fmt=json3")` from the page: `200`, 0 bytes (`en`, `ja`, `a.en`, `&tlang=ja`, and the XML default format alike).
- **Playwright-driven Chromium gets empty bodies even for the player's own requests** (headless, new headless and headed). The token the player mints under automation (`navigator.webdriver === true`) is not accepted, and the player then labels the CC button "Subtitles/closed captions unavailable". So E2E tests must serve recorded fixtures with `context.route`; the real-site check (M6 Task 7) can verify layout, but captions may stay empty under Playwright.
- In a regular browser the player's request works (`en` 59 KB, `ja` 44 KB, `en&tlang=ja` 51 KB, `a.en` 379 KB as json3).
- **Once one player request is captured, we can fetch the other tracks ourselves**: take that URL, change `lang`, add `tlang=ja`, or add `kind=asr`, and `fetch` it from the page — all returned full bodies. Removing `pot`/`potc` or the client params (`c`, `cver`, `cplayer`, `cbr`, …) gives an empty body again.
- The token is **bound to the video**: the same `pot` + client params on another video's `baseUrl` returns an empty body. Capture one player request per video.
- Answer to the spec's open question: yes, the extension can get the Japanese track and `tlang=ja`, but only after the player has made one timedtext request for that video (either on its own or because we asked it to load a track).

## Caption track list
- First load: `window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer`. **Stale after SPA navigation** (still the first video). Use `document.getElementById("movie_player").getPlayerResponse()` (current video) or the `yt-navigate-finish` event's `detail.response.playerResponse`.
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
- Side effect: this turns on YouTube's own captions and may persist as the user's sticky caption choice. The adapter should hide `.ytp-caption-window-container` while Lingo is on and, when it switched captions on itself, restore the previous state (`unloadModule("captions")` or the previous track).
- Simplest flow: if no timedtext response was seen for this video shortly after playback starts, ask the player for the original track once, capture the URL, then fetch `lang=<native>` and `tlang=<native>` ourselves from that URL.

## json3 format (`fmt=json3`)
Top level: `wireMagic: "pb3"`, `pens`, `wsWinStyles`, `wpWinPositions`, `events[]`.
- Manual tracks: one event per cue, `{ tStartMs, dDurationMs, segs: [{ utf8 }] }`. Line breaks are `\n` inside `utf8`.
- `tlang` responses keep **exactly the original's timing** (same `tStartMs`/`dDurationMs`, same count). Some translated events are only `"\n"` or start/end with `\n`; machine translation can contain U+200B (zero-width space).
- ASR (`kind=asr`): a first window-definition event without `segs` (`dDurationMs` = whole video), then alternating word events `{ tStartMs, dDurationMs, wWinId, segs: [{ utf8: "how" }, { utf8: " are", tOffsetMs: 240, acAsrConf }…] }` and `aAppend: 1` events whose only seg is `"\n"`. Events overlap (two-line rolling window), some lack `dDurationMs`, there is no punctuation or capitalization in this track, and filler words (`um`, `uh`) are included. Each word event contains only new words.
- The Japanese manual track has its own segmentation (2–7 s cues, a translator credit cue at 0 s).

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

## Risks
- PO token rules change often; if the "reuse the player's URL" trick stops working, fall back to asking the player for each track in turn (`setOption`) and capturing every response, or to the built-in translator.
- Automated tests cannot get real captions from youtube.com; only recorded fixtures.
- Changing the player's caption track changes what the user sees and may persist; restore it.
- Player API (`loadModule`, `setOption`, `getPlayerResponse`) and class names are undocumented and may change.
- Pre-roll ads produce their own timedtext requests and `ad-showing` state; filter by video id and wait for the ad to end.
- Not checked: videos with only ASR captions (the format is the same as `a.en` above), live streams, Shorts, embedded players, the mobile site.
