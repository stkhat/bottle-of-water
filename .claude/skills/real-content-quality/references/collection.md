# Collecting the corpus

All collection happens in the user's Chrome through Claude in Chrome, with Lingo's check build loaded. Each source gets one JSON file in the study folder (`data/raw/quality/<study>/corpus/<kind>/<id>.json`, git-ignored). Nothing here goes into the repo.

## Getting a big JSON from the page to disk

`javascript_tool` returns only a short result, and some page text is withheld from it. The grab snippets therefore:
1. build the JSON;
2. put it in a temporary `<textarea id="__tqta">`, then focus and select it;
3. return a short summary (counts, a sample line) so you can check the grab.

Then press `cmd+c` with the `computer` tool, and run `scripts/save-clipboard.sh <corpus-dir> <kind>` to write `<kind>/<id>.json`. This uses the user's clipboard (overwriting it) and `pbpaste`, so it works only when Chrome runs on this Mac; tell the user before you start.
Then remove the textarea from the page with `javascript_tool`: `document.getElementById('__tqta')?.remove()`.

Check the summary before saving. An empty track or a 0-card transcript means the page was not ready: reload it and grab again.

## YouTube — `scripts/youtube-grab.js`

The snippet does this:
1. Reads the caption tracks from the player response (`movie_player.getPlayerResponse()`).
2. Hooks `fetch`/XHR to learn the signed `/api/timedtext` URL the player uses, turning captions on once if needed.
3. Downloads three tracks as `fmt=json3`:
   - `en`: the manual track if there is one, else ASR (`a.en`);
   - `ja`: the human track, if any;
   - `tlang=ja`: YouTube's auto-translation of the English track.
4. Records `trackKind` (`manual` or `asr`) and `hasNative` (older files: `enKind`, `hasJa`). `scripts/build-units.ts` feeds these tracks to `parseYouTubeJson3` and `captionCards`, as the extension does.

If `tlang` comes back empty, grab again later. YouTube sometimes refuses it for a while.

## Netflix — `scripts/netflix-grab.js`

Last time this read the cards from Lingo's own transcript (`lingo-transcript` shadow root, `[data-cue]`): time, English line, Japanese line. It waits until the card count stops growing, then pauses the video. Show and episode titles come from `netflix.appContext` metadata.

Two caveats:
- It needs the check build: Lingo's shadow roots are open there and closed in production builds. If it finds no `lingo-transcript` root, the check build isn't loaded or the panel isn't open.
- Rendered cards are not enough to measure alignment changes. Also save the timed subtitle files the player downloads (not done yet; `build-units.ts` reads them as `timed: {<lang>: TTML or WebVTT text}`, untested), for English and Japanese: read the timed-text requests with `read_network_requests`, or with a fetch hook like the YouTube one. With them, the runner can re-align offline.

**Choosing shows: you pick them; the user doesn't name them.** Choose about 5 shows that differ in what they test, and confirm each has English and Japanese subtitles before using it. Useful kinds:
- fast everyday dialogue (a sitcom);
- specialised vocabulary (legal, medical, crime);
- British or other non-US English;
- captions in ALL-CAPS;
- condensed Japanese subtitles (most dramas).

Use shows already in the account's catalogue page or search; don't open a different profile. Pick 3 episodes per show at random with a fixed seed, and write the seed and the choices into the manifest.

**Clean up afterwards.** Every episode you open lands in the profile's "Continue Watching" row. When collection is done, remove each one you opened: on the Netflix home page, open the title's menu in that row and choose "Remove from row". Keep a list of what you opened so none are missed. If the row offers no remove option, stop and tell the user. Don't hide titles through the account's viewing-activity page without asking: that is an account setting.

## Articles — `scripts/article-grab.js`

Set `ID` (a short slug) in the snippet. The snippet takes the main story body (`p`, `h2`, `li` outside nav, footer, promos and related links), keeps paragraphs longer than 30 characters, and records whether Lingo mounted (`lingo-article`).
- Check that the first and last paragraphs in the summary belong to the story.
- Skip pages behind an ad-block or consent wall, and leave cookie banners unanswered.

## Manifest

`manifest.json` holds one entry per source:
- kind, id, title
- channel or show, genre
- `trackKind`, `hasNative`, `hasTlang`
- minutes, url

Spread the sources over:
- genres and speakers (US, UK, Australian; vlogs, ASR-only, stand-up, sports);
- outlets;
- caption quirks (ALL-CAPS, speaker dashes, sound labels).
