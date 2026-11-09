# Netflix: how Lingo reads it, and what to check on the real site (2026-11-10)

Netflix needs a login, so nothing here was observed on netflix.com. The adapter was built against **synthetic** fixtures modeled on public descriptions of the web player (open-source subtitle downloaders and similar extensions). Everything Netflix-specific lives in two small modules so it can be corrected in one place:

- `src/content/video/netflix-manifest.ts`: the manifest's shape and the subtitle formats
- `src/content/video/netflix-site.ts`: DOM selectors (with fallbacks), the player API path, layout constants

When an assumption fails, Lingo shows nothing on that video and leaves Netflix's own subtitles alone (no tracks → `unavailable`; no player element → no UI; seek errors are logged).

## How it works
- **MAIN world** (`netflix-main.content.ts` → `netflix-page.ts`, `document_start`): wraps `JSON.parse` (the result is returned untouched) and runs `readManifest` on each result. A manifest is `{ result: { movieId, timedtexttracks } }` (also accepted: without `result`, or `viewableId`). Tracks are posted to the isolated script and kept in page memory for the last 6 titles (the next episode's manifest can arrive before the URL changes). It answers `getTracks`, `currentMovieId`, `title`, `fetchText` (only URLs from seen manifests) and `seek`.
- **Isolated world** (`netflix.content.ts` → `netflix.ts`): watch id from `/watch/<id>`; navigation by URL polling (500 ms), `popstate` and new manifests; the original track = learning language, not forced, subtitles before closed captions; formats in order `dfxp-ls-sdh`, `simplesdh`, `imsc1.1`, `webvtt-lssdh-ios8` (image `nflx-cmisc` is skipped), each CDN URL in turn; the translation = the native-language track (subtitles first), else the built-in translator, else none (Netflix has no machine translation). Translations are aligned by time overlap.
- Subtitle files are fetched by the content script; when that request is refused (CORS rules for content scripts differ between browsers) the page script fetches them. URLs and subtitles stay in memory only.

## Layout decisions (check on the real site)
- **L and ^ buttons**: inserted before the slot of the first of `[data-uia='control-audio-subtitle']`, `control-speed`, `control-fullscreen-enter/exit`, `.button-nfplayerSubtitles` (the slot = the outermost wrapper holding only that button). Netflix shows its control bar only while the pointer moves; while it is hidden the buttons are gone with it and come back with it (the mount puts them back). Only if no control bar was ever recognized on the page do the buttons float at the player's bottom right (`lingo-netflix-controls`), shown for 3 s after each pointer move. Chosen because it keeps the buttons where Netflix's own controls are, and still leaves them reachable if the selectors break.
- **Transcript**: Netflix has no side column, so the transcript is a fixed panel at the right (`lingo-netflix-side`: 360 px wide, 16 px from the right, from 72 px below the top to 120 px above the bottom, clear of the back arrow and the control bar). It **overlays** the video's right edge; the player is not narrowed, because changing the size of Netflix's player cannot be checked here. The transcript is as tall as the panel (`PlatformAdapter.transcriptFrame`). Hidden in fullscreen.
- **Subtitle "Below video"**: there is nothing below Netflix's video; the box sits at the bottom of the player, 120 px up (above the control bar).
- **Subtitle "In video"**: as on YouTube, 64 px above the player's bottom. Netflix's control bar (about 100–120 px) may cover it while shown.
- Netflix's subtitles are hidden with `.player-timedtext { display: none !important }` in a `<style>` element while Lingo shows its own.

## Assumptions to verify on netflix.com
1. `JSON.parse` sees the manifest (not `Response.json()`), with `result.movieId` and `result.timedtexttracks`.
2. Track fields: `language`, `languageDescription`, `rawTrackType` (`subtitles` / `closedcaptions`) or `trackType` (`PRIMARY` / `ASSISTIVE`), `isNoneTrack`, `isForcedNarrative`, `new_track_id`, `ttDownloadables[format].urls[].url` (or the older `downloadUrls` map), `isImage`.
3. Which text formats the default web player requests. Japanese may come only as images (`nflx-cmisc`) unless `imsc1.1` is in the manifest; then Lingo falls back to the built-in translator. If so, consider reading `imsc1.1` (already supported) or asking for it.
4. Subtitle CDN hosts (`*.nflxvideo.net`) answer the content script's `fetch` with CORS for `https://www.netflix.com` (Chrome and Firefox); else the page fetch is used.
5. Subtitle times match `video.currentTime` (no offset), including on titles with ads (ad tier: `adShowing()` always returns false; ads may break timing).
6. `netflix.appContext.state.playerApp.getAPI().videoPlayer`: `getAllPlayerSessionIds()` has an id containing `watch`; `getVideoPlayerBySessionId(id).seek(ms)` and `.getMovieId()`.
7. Title: `playerApp.getState().videoPlayer.videoMetadata[movieId]._metadata.video` with `title` and `seasons[].episodes[]` (`id`, `seq`, `title`); fallback `[data-uia='video-title']`.
8. DOM: `.watch-video--player-view` (positioned, covers the video) contains the `<video>`; `.player-timedtext` holds Netflix's subtitles; the control bar buttons' `data-uia` values above. Whether the control bar is removed or only hidden when idle.
9. The URL changes to `/watch/<episode id>` between episodes and the manifest's `movieId` equals that id (if the URL names a show, the playing title from `getMovieId()` is used).
10. `ended` fires at the end of an episode (Netflix may show its post-play screen or move on first), so the "Video finished" card may not show.
11. Fullscreen: which element Netflix makes fullscreen; Lingo hides its parts in fullscreen and shows Netflix's subtitles.
12. Netflix's content security policy allows the `<style>` element Lingo adds (to hide its subtitles); clicks on Lingo's parts do not reach the player (play/pause).
13. Layout: the overlay transcript, the dictionary window (opens over the player's right edge, so over the transcript), the end card (top right, over the transcript's top), and the subtitle against the control bar.
