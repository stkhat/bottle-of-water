# Netflix: how Lingo reads it, and what was seen on the real site

The adapter was first built against synthetic fixtures modeled on public descriptions of the web player. On **2026-11-10** it was checked on netflix.com (an episode, `/watch/70274124`, in the user's own Chrome with only Lingo enabled): Lingo mounted its parts but found no subtitles, because the manifest's shape was not the assumed one. What was seen is recorded below, and the code and fixtures follow it. Everything Netflix-specific lives in two small modules so it can be corrected in one place:

- `src/content/video/netflix-manifest.ts`: the manifest's shape and the subtitle formats
- `src/content/video/netflix-site.ts`: DOM selectors (with fallbacks), the player API path, layout constants

When an assumption fails, Lingo shows nothing on that video and leaves Netflix's own subtitles alone (no tracks → `unavailable`; no player element → no UI; seek errors are logged).

The fixtures stay synthetic (`src/core/subtitles/fixtures/netflix/`): the subtitles of real titles are copyrighted, so they copy the real markup with made-up lines.

## Seen on netflix.com (2026-11-10)
1. **Manifest**: arrives by XHR (`/msl/playapi/cadmium/licensedmanifest/1`) and is passed through `JSON.parse` as one string (51 KB), so the page-level `JSON.parse` wrapper sees it. Top keys: `id`, `version`, `serverTime`, `result`, `common`, `from`. `result` holds `movieId` (a **number**, the id in `/watch/<id>`), `textTracks` (**not** `timedtexttracks`), `audioTracks`, `duration`, `viewableType`, `links`, `servers`, …
2. **Text tracks** (`result.textTracks[]`): `type`, `trackType` (`PRIMARY` / `ASSISTIVE`), `rawTrackType` (`subtitles` / `closedcaptions`), `id`, `language` (`en`, `ja`; `null` for Off), `languageDescription`, `downloadableIds` (`{ profile: id }`), `downloadables` (`{ profile: { size, hashValue, hashAlgo, urls: [{ cdnId, url }], textKey, isImage } }`), `rank`, `hydrated`, `encodingProfileNames`, `trackMapIndex`, `allowedVideoTracks`, `selectableVideoTracks`, `allowedAudioTracks`, `selectableAudioTracks`, `selectionGroupId`, `isForcedNarrative`, `isLanguageLeftToRight`, `isNoneTrack`. On that title, 3 tracks:
   - Off: `language: null`, `isNoneTrack: true`, `rawTrackType: subtitles`
   - English: `closedcaptions` / `ASSISTIVE`, profiles `dfxp-ls-sdh`, `imsc1.1`, `simplesdh` (all text). There was **no English `subtitles` track**, so the original falls back to the closed captions.
   - Japanese: `subtitles` / `PRIMARY`, profiles `imsc1.1` (text) and `nflx-cmisc` (images)
3. **Downloads**: fetching the subtitle URLs from the page works (200; English DFXP 133 KB, Japanese IMSC 42 KB). The content script's `fetch` (CORS) was not tried; the page fetch stays as the fallback.
4. **English `dfxp-ls-sdh`**: `ttp:tickRate="10000000"`, `ttp:timeBase="media"`, `<ttp:profile use="http://netflix.com/ttml/profile/dfxp-ls-sdh"/>`, positional regions (`region_00`, `region_01`, …). One on-screen subtitle is **several `<p>` elements with the same `begin`/`end`**, one per line, each with `tts:origin` (e.g. `50.00% 79.29%` and `50.00% 84.62%`); two speakers' lines can sit side by side. Closed captions are in **capital letters**.
5. **Japanese `imsc1.1`**: `ttp:tickRate="10000000"`, `xml:lang="ja"`, `xml:space="preserve"` on `<p>`, `<p begin="…t" end="…t" region="region0" style="style0">`. Ruby is declared on `<style>` elements (`tts:ruby="container"`, `"base"`, `"text"` with `tts:rubyPosition="before"`) that spans refer to with `style="…"`. Some cues use vertical writing (`tts:writingMode="tb…"`) or `tts:shear` styles.
6. **DOM**: `.watch-video--player-view` exists (`position: absolute`) and contains the `<video>`; `.player-timedtext` exists. `data-uia` values while idle: `watch-video`, `watch-video-player-view-minimized`, `player`, `video-canvas`. The control bar's `control-*` buttons were **not in the DOM** while idle (synthetic hovering did not bring them), so the L/^ group floated at the player's bottom right (the fallback).
7. Another subtitle extension in the same Chrome (Language Reactor) re-parses the manifest; with it on, Lingo did get tracks. Lingo must not depend on other extensions.

## How it works
- **MAIN world** (`netflix-main.content.ts` → `netflix-page.ts`, `document_start`): wraps `JSON.parse` (the result is returned untouched) and runs `readManifest` on each result. A manifest is `{ result: { movieId, textTracks } }`, or the older `{ result: { movieId, timedtexttracks } }` with `ttDownloadables` (other titles or accounts may still get it); also accepted without `result`, or with `viewableId`. Tracks without text downloads (Off, image-only, not yet downloadable) are dropped. Tracks are posted to the isolated script and kept in page memory for the last 6 titles (the next episode's manifest can arrive before the URL changes). It answers `getTracks`, `currentMovieId`, `title`, `fetchText` (only URLs from seen manifests) and `seek`.
- **Isolated world** (`netflix.content.ts` → `netflix.ts`): watch id from `/watch/<id>`; navigation by URL polling (500 ms), `popstate` and new manifests; the original track = learning language, not forced, subtitles before closed captions; formats in order `imsc1.1`, `dfxp-ls-sdh`, `simplesdh`, `webvtt-lssdh-ios8` (images are skipped), each CDN URL in turn, the next format when one gives no cues; the translation = the native-language track that is not forced, else the built-in translator, else none (Netflix has no machine translation). Translations are aligned by time overlap.
- **TTML** (`src/core/subtitles/ttml.ts`): `<p>` elements with the same times become one cue, lines top to bottom then left to right by `tts:origin` (the `<p>`'s, else its region's); ruby text is dropped whether `tts:ruby` is on the span or on a referenced `<style>`; `xml:space="preserve"` keeps line breaks; writing mode and shear are ignored. Capital-letter lines are classified like lowercase ones (lookups lowercase); Lingo shows the text as it is.
- Subtitle files are fetched by the content script; when that request is refused (CORS rules for content scripts differ between browsers) the page script fetches them. URLs and subtitles stay in memory only.

## Layout decisions
- **L and ^ buttons**: inserted before the slot of the first of `[data-uia='control-audio-subtitle']`, `control-speed`, `control-fullscreen-enter/exit`, `.button-nfplayerSubtitles` (the slot = the outermost wrapper holding only that button). Netflix shows its control bar only while the pointer moves, and removes it from the DOM while idle; while it is gone the buttons are gone with it and come back with it (the mount puts them back). Only if no control bar was ever recognized on the page do the buttons float at the player's bottom right (`lingo-netflix-controls`), shown for 3 s after each pointer move. On 2026-11-10 the bar never appeared (no real pointer), so only the floating path was seen; both are kept.
- **Transcript**: Netflix has no side column, so the transcript is a fixed panel at the right (`lingo-netflix-side`: 360 px wide, 16 px from the right, from 72 px below the top to 120 px above the bottom, clear of the back arrow and the control bar). It **overlays** the video's right edge; the player is not narrowed. The transcript is as tall as the panel (`PlatformAdapter.transcriptFrame`). Hidden in fullscreen.
- **Subtitle "Below video"**: there is nothing below Netflix's video; the box sits at the bottom of the player, 120 px up (above the control bar).
- **Subtitle "In video"**: as on YouTube, 64 px above the player's bottom. Netflix's control bar (about 100–120 px) may cover it while shown.
- Netflix's subtitles are hidden with `.player-timedtext { display: none !important }` in a `<style>` element while Lingo shows its own.

## Still to check on netflix.com
1. Subtitles, translation and transcript once the manifest is read (the 2026-11-10 check stopped at "no tracks").
2. Whether the English `imsc1.1` file (tried first) looks like the Japanese one or splits lines into `<p>` elements like the DFXP; if it gives no cues, Lingo moves on to `dfxp-ls-sdh`.
3. Whether tracks other than the selected ones can come with `hydrated: false` and no `downloadables` (titles with many languages); such tracks are dropped, so the native-language translation could be missing.
4. Subtitle CDN hosts (`*.nflxvideo.net`) answer the content script's `fetch` with CORS for `https://www.netflix.com` (Chrome and Firefox); else the page fetch is used.
5. Subtitle times match `video.currentTime` (no offset), including on titles with ads (ad tier: `adShowing()` always returns false; ads may break timing).
6. `netflix.appContext.state.playerApp.getAPI().videoPlayer`: `getAllPlayerSessionIds()` has an id containing `watch`; `getVideoPlayerBySessionId(id).seek(ms)` and `.getMovieId()`.
7. Title: `playerApp.getState().videoPlayer.videoMetadata[movieId]._metadata.video` with `title` and `seasons[].episodes[]` (`id`, `seq`, `title`); fallback `[data-uia='video-title']`.
8. The control bar's buttons' `data-uia` values above, with a real pointer.
9. The URL changes to `/watch/<episode id>` between episodes and the manifest's `movieId` equals that id (if the URL names a show, the playing title from `getMovieId()` is used).
10. `ended` fires at the end of an episode (Netflix may show its post-play screen or move on first), so the "Video finished" card may not show.
11. Fullscreen: which element Netflix makes fullscreen; Lingo hides its parts in fullscreen and shows Netflix's subtitles.
12. Netflix's content security policy allows the `<style>` element Lingo adds (to hide its subtitles); clicks on Lingo's parts do not reach the player (play/pause).
13. Layout: the overlay transcript, the dictionary window (opens over the player's right edge, so over the transcript), the end card (top right, over the transcript's top), and the subtitle against the control bar.
